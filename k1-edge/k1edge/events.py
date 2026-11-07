# -*- coding: utf-8 -*-
"""事件模型 / 冷却 / 断网落盘队列 / 处置指令队列。

落盘格式 JSONL（一行一个 JSON），断网时照样写盘，恢复后按序补传。
"""
import datetime
import json
import os
import threading
import time
import uuid

# 与后台一致的四种处置方式（端侧只认 id，文案由后台决定）
RESOLUTIONS = {
    "onscene": {"name": "现场处置", "status": "confirmed", "archive": True},
    "track": {"name": "隐蔽跟踪", "status": "tracking", "archive": False},
    "backup": {"name": "请求增援", "status": "backup", "archive": False},
    "false": {"name": "误报归档", "status": "false", "archive": True},
}

LEVEL_BY_CAT = {"suspect": 2, "staff": 0, "vip": 0}


def iso_now():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def stamp(dt=None):
    return (dt or datetime.datetime.now()).strftime("%Y%m%d_%H%M%S")


def new_id(prefix="ev"):
    return "%s_%s_%s" % (prefix, stamp(), uuid.uuid4().hex[:4])


class Cooldown:
    """同一个人 N 秒内只产生一次事件，避免站在摄像头前刷屏。"""

    def __init__(self):
        self._last = {}

    def allow(self, key, seconds):
        now = time.time()
        if now - self._last.get(key, 0) >= seconds:
            self._last[key] = now
            return True
        return False

    def remaining(self, key, seconds):
        return max(0.0, seconds - (time.time() - self._last.get(key, 0)))


class EventStore:
    def __init__(self, queue_file, actions_file):
        self.queue_file = queue_file
        self.actions_file = actions_file
        self._lock = threading.RLock()
        self.events = self._load(queue_file)
        self.actions = []          # 待端侧执行的处置指令（读走即删）

    # ---------------- 内部 ----------------
    @staticmethod
    def _load(path):
        out = []
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            out.append(json.loads(line))
                        except Exception:
                            continue
            except Exception as e:
                print("[store] 读取队列失败:", e)
        return out

    def _rewrite(self):
        tmp = self.queue_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            for e in self.events:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
        os.replace(tmp, self.queue_file)

    # ---------------- 事件 ----------------
    def add(self, event):
        with self._lock:
            if not event.get("id"):
                event["id"] = new_id()
            event.setdefault("created_at", iso_now())
            event.setdefault("created_ms", int(time.time() * 1000))
            event.setdefault("status", "pending")
            event.setdefault("resolution", "")
            event.setdefault("resolution_name", "")
            event.setdefault("unit", "")
            event.setdefault("handler", "")
            event.setdefault("source", "device")
            event.setdefault("synced", False)
            self.events.append(event)
            try:
                with open(self.queue_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(event, ensure_ascii=False) + "\n")
            except Exception as e:
                print("[store] 落盘失败:", e)
            return event

    def get(self, eid):
        with self._lock:
            for e in self.events:
                if e.get("id") == eid:
                    return e
        return None

    def all(self):
        with self._lock:
            return list(self.events)

    def since(self, ts=0):
        """ts 为毫秒时间戳；返回创建时间晚于 ts 的事件（后台轮询用）。"""
        with self._lock:
            return [e for e in self.events if float(e.get("created_ms") or 0) > float(ts or 0)]

    def unsynced(self):
        with self._lock:
            return [e for e in self.events if not e.get("synced")]

    def mark_synced(self, eid):
        with self._lock:
            e = self.get(eid)
            if e:
                e["synced"] = True
                self._rewrite()
            return e

    def patch(self, eid, **fields):
        """局部更新（比如录音异步完成后回填 audio_key）。"""
        with self._lock:
            e = self.get(eid)
            if not e:
                return None
            e.update(fields)
            self._rewrite()
            return e

    def resolve(self, eid, resolution, unit="", operator=None, note="", source="console"):
        """写入处置结果。resolution 取 RESOLUTIONS 的 key。"""
        meta = RESOLUTIONS.get(resolution) or {"name": resolution, "status": "confirmed"}
        with self._lock:
            e = self.get(eid)
            if not e:
                return None
            e["status"] = meta["status"]
            e["resolution"] = resolution
            e["resolution_name"] = meta["name"]
            e["unit"] = unit or e.get("unit", "")
            e["handler"] = (operator or {}).get("name") or e.get("handler") or ""
            e["handler_id"] = (operator or {}).get("id") or e.get("handler_id", "")
            e["source"] = source
            e["handled_at"] = iso_now()
            if note:
                e["note"] = note
            trace = e.setdefault("trace", [])
            trace.append({"at": e["handled_at"], "by": e["handler"] or "系统",
                          "action": meta["name"] + (("（%s）" % unit) if unit else ""),
                          "note": note or "", "via": source})
            self._rewrite()
            return e

    # ---------------- 处置指令（后台 → 端侧）----------------
    def push_action(self, action):
        with self._lock:
            if not action.get("id"):
                action["id"] = new_id("act")
            action.setdefault("at", iso_now())
            self.actions.append(action)
            try:
                with open(self.actions_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(action, ensure_ascii=False) + "\n")
            except Exception:
                pass
            return action

    def drain_actions(self):
        with self._lock:
            out = self.actions[:]
            self.actions = []
            return out

    def stats(self):
        with self._lock:
            by = {}
            for e in self.events:
                by[e.get("status", "?")] = by.get(e.get("status", "?"), 0) + 1
            return {"total": len(self.events), "by_status": by,
                    "unsynced": len([e for e in self.events if not e.get("synced")])}


def build_event(cfg, *, kind, person, similarity, snapshot_key, audio_key="",
                box=None, metrics=None, history_hits=0):
    """组装一条标准事件（字段与后台 /api/k1/events 契约一致）。"""
    cat = person.get("cat", "unknown")
    return {
        "id": new_id("ev"),
        "kind": kind,                                  # alert | pass | stranger
        "device_id": cfg.get("device_id"),
        "point_code": cfg.get("point_code"),
        "location": cfg.get("location"),
        "person": {
            "name": person.get("name") or "陌生访客",
            "code": person.get("code") or "",
            "cat": cat,
        },
        "similarity": round(float(similarity or 0), 3),
        "level": int(person.get("level") if person.get("level") is not None
                     else LEVEL_BY_CAT.get(cat, 0)),
        "captured_at": iso_now(),
        "created_ms": int(time.time() * 1000),
        "snapshot_key": snapshot_key,
        "audio_key": audio_key or "",
        "box": list(box) if box else [],
        "history_hits": int(history_hits or 0),
        "k1_metrics": metrics or {},
        "operator": cfg.get("operator") or {},
    }
