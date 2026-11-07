#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""端侧自检：不需要摄像头、不需要 K1，验证整条链路。

    python tools/selftest.py

覆盖：
    1. 人脸库扫描（cat 分层）
    2. 命中 → 建事件 → 抓拍落盘 → 队列 JSONL
    3. 白名单命中 → pass（不告警）
    4. 未匹配 → stranger
    5. 同人冷却
    6. 桥接服务：POST 事件 / GET 拉取 / POST 处置 / GET 取动作
    7. 队列持久化与重新加载
"""
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import numpy as np

from k1edge import bridge, config, gallery, vision
from k1edge.events import EventStore
from k1edge.pipeline import Pipeline
from k1edge.ui import Lcd

PASS, FAIL = [], []


def ok(name, cond, extra=""):
    (PASS if cond else FAIL).append(name + ((" → " + str(extra)) if (extra and not cond) else ""))
    print(("PASS · " if cond else "FAIL · ") + name + (("  [" + str(extra) + "]") if extra and not cond else ""))


def make_img(path, color):
    import cv2
    img = np.zeros((200, 200, 3), np.uint8)
    img[:, :] = color
    cv2.circle(img, (100, 100), 60, (255, 255, 255), -1)
    cv2.rectangle(img, (70, 70), (95, 90), (0, 0, 0), -1)
    cv2.rectangle(img, (110, 70), (135, 90), (0, 0, 0), -1)
    vision.imwrite(path, img)
    return img


def http_bytes(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.read()


def http(url, data=None, method=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method or ("POST" if data else "GET"),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode())


def main():
    tmp = tempfile.mkdtemp(prefix="k1selftest_")
    try:
        gal = os.path.join(tmp, "gallery")
        for cat, name in (("suspect", "张伟"), ("staff", "陈立")):
            d = os.path.join(gal, cat, name)
            os.makedirs(d)
            make_img(os.path.join(d, "a.jpg"), (40, 90, 180) if cat == "suspect" else (40, 160, 120))

        caps = os.path.join(tmp, "captures")
        cfg = config.load(None)
        cfg.update({
            "mock": True, "gallery": gal, "captures": caps,
            "queue_file": os.path.join(caps, "_events.jsonl"),
            "actions_file": os.path.join(caps, "_actions.jsonl"),
            "record_ambient": False, "speak": False, "quiet": True,
            "location": "东门主入口", "device_id": "K1S-TEST-01",
            "bridge_port": 18088, "cooldown_sec": 8,
        })
        config.ensure_dirs(cfg)

        # 1 人脸库
        people = gallery.scan(gal)
        ok("人脸库扫描（2 人 / 分类正确）",
           len(people) == 2 and gallery.counts(people)["suspect"] == 1
           and gallery.counts(people)["staff"] == 1, people)

        store = EventStore(cfg["queue_file"], cfg["actions_file"])
        pipe = Pipeline(cfg, store)
        ok("识别后端为 Mock（Haar + 向量比对）",
           isinstance(pipe.det, vision.HaarDetector) and isinstance(pipe.rec, vision.VectorRecognizer))

        # 2 命中布控人员：用库里的同一张图当作抓拍帧
        import cv2
        suspect_img = vision.imread(people[0]["files"][0])
        m = pipe.rec.match(suspect_img, (0, 0, suspect_img.shape[1], suspect_img.shape[0]))
        ok("布控人员匹配成功", m["ok"] and m["cat"] == "suspect", m)

        ev1 = pipe.dispatch(suspect_img, (0, 0, 200, 200), m)
        ok("命中生成 alert 事件", bool(ev1) and ev1["kind"] == "alert", ev1)
        snap = os.path.join(caps, ev1["snapshot_key"]) if ev1 else ""
        ok("抓拍图已落盘（时间_点位_人名.jpg）",
           bool(ev1) and os.path.isfile(snap) and "东门主入口" in os.path.basename(snap), snap)
        ok("事件带设备号与操作人",
           bool(ev1) and ev1["device_id"] == "K1S-TEST-01" and ev1["operator"]["name"] == "王巡逻")

        # 3 冷却
        ok("同人冷却生效（8 秒内不重复告警）",
           pipe.dispatch(suspect_img, (0, 0, 200, 200), m) is None)

        # 4 白名单
        staff_img = vision.imread(people[1]["files"][0])
        m2 = pipe.rec.match(staff_img, (0, 0, staff_img.shape[1], staff_img.shape[0]))
        ev2 = pipe.dispatch(staff_img, (0, 0, 200, 200), m2)
        ok("白名单识别为 pass（不告警）", bool(ev2) and ev2["kind"] == "pass", ev2)

        # 5 陌生人
        other = np.zeros((200, 200, 3), np.uint8)
        other[:, :] = (200, 60, 60)
        m3 = pipe.rec.match(other, (0, 0, 200, 200))
        ev3 = pipe.dispatch(other, (0, 0, 200, 200), m3)
        ok("未匹配记为 stranger", bool(ev3) and ev3["kind"] == "stranger", ev3)

        # 6 队列落盘
        with open(cfg["queue_file"], "r", encoding="utf-8") as f:
            lines = [l for l in f if l.strip()]
        ok("事件已写入 JSONL 队列（3 条）", len(lines) == 3, len(lines))
        store2 = EventStore(cfg["queue_file"], cfg["actions_file"])
        ok("重启后队列可恢复", len(store2.all()) == 3, len(store2.all()))

        # 7 桥接服务
        ui = Lcd(cfg, show=False)
        pipe.attach_ui(ui)
        server, _ = bridge.serve(store, cfg, port=18088, ui=ui)
        base = "http://127.0.0.1:18088"
        try:
            h = http(base + "/api/k1/health")
            ok("桥接健康检查", h.get("ok") is True and h["stats"]["total"] == 3, h)

            lst = http(base + "/api/k1/events?since=0")
            ok("后台可拉取全部事件", lst.get("ok") and len(lst["events"]) == 3, len(lst.get("events", [])))

            rid = lst["events"][0]["id"]
            r = http(base + "/api/k1/resolve", {"event_id": rid, "resolution": "onscene",
                                                "unit": "", "operator": {"id": "admin", "name": "系统管理员"},
                                                "note": "自检处置"})
            ok("后台处置写回成功", r.get("ok") and r["event"]["status"] == "confirmed", r.get("event", {}).get("status"))
            ok("处置人记录为后台账号", r["event"]["handler"] == "系统管理员", r["event"].get("handler"))

            acts = http(base + "/api/k1/actions")
            ok("端侧可领取处置动作（用于收尾播报）",
               len(acts["actions"]) == 1 and acts["actions"][0]["type"] == "resolved", acts)

            acts2 = http(base + "/api/k1/actions")
            ok("动作队列取走即清空", len(acts2["actions"]) == 0)

            # 端侧处置通道
            e2 = store.all()[1]
            pipe.resolve_from_device(e2, "track")
            ok("端侧处置记为 device 通道 + 绑定账号",
               store.get(e2["id"])["source"] == "device"
               and store.get(e2["id"])["handler"] == "王巡逻", store.get(e2["id"])["source"])

            wl = http(base + "/api/k1/watchlist")
            ok("桥接可下发布控名单", wl.get("ok") and len(wl["people"]) == 2, len(wl.get("people", [])))

            # 8 网页屏（LCD 用浏览器显示 + 点击回传）
            page = http_bytes(base + "/screen").decode("utf-8", "replace")
            ok("LCD 网页屏可打开", "K1 巡更屏" in page and "/api/k1/screen.mjpg" in page)

            jpg = http_bytes(base + "/api/k1/screen.jpg")
            ok("网页屏输出 JPEG 帧", jpg[:2] == b"\xff\xd8" and len(jpg) > 2000,
               "%d bytes" % len(jpg))

            # 新事件 → 亮小点 → 点开 → 点「现场处置」
            ev4 = pipe.dispatch(suspect_img, (0, 0, 200, 200),
                                pipe.rec.match(suspect_img, (0, 0, 200, 200))) or store.all()[-1]
            ui.push(ev4)
            http_bytes(base + "/api/k1/screen.jpg")          # 刷新热区
            c1 = http(base + "/api/k1/click", {"x": 400, "y": 400})
            ok("点屏幕可打开调阅", c1.get("action") == "open" and ui.state == "detail", c1)

            http_bytes(base + "/api/k1/screen.jpg")          # 调阅态刷新按钮热区
            c2 = http(base + "/api/k1/click", {"x": 620, "y": 150})
            ok("点「现场处置」按钮生效", c2.get("action") == "onscene", c2)
            ok("LCD 处置写回同一事件（device 通道）",
               store.get(ev4["id"])["status"] == "confirmed"
               and store.get(ev4["id"])["source"] == "device",
               store.get(ev4["id"])["status"])

            # 9 framebuffer 直写（板上无桌面时的显示通路）
            from PIL import Image as _Im
            from k1edge import fbdev
            probe = _Im.new("RGB", (4, 2), (10, 20, 30))
            bgra, row32 = fbdev._to_bgra(probe)
            rgb565, row16 = fbdev._to_rgb565(probe)
            ok("framebuffer 32bpp 转换正确",
               row32 == 16 and len(bgra) == 32
               and bgra[0:4] == bytes([30, 20, 10, 255]),
               list(bgra[0:4]))
            # (10,20,30) → RGB565: r=1 g=5 b=3 → 0x08A3，小端 A3 08
            ok("framebuffer 16bpp 转换正确",
               row16 == 8 and len(rgb565) == 16 and rgb565[0:2] == b"\xa3\x08",
               list(rgb565[0:2]))
            ok("framebuffer 枚举不抛异常", isinstance(fbdev.list_fbs(), list),
               len(fbdev.list_fbs()))

            # 10 真机后端（模型下载了才跑，否则跳过）
            from k1edge import vision_real as vr
            ok("真机后端模块可导入",
               hasattr(vr, "build_real") and hasattr(vr, "SFaceRecognizer"))
            if vr.models_ready():
                fx = os.path.join(os.path.dirname(HERE), "models", "fixtures", "lena.jpg")
                det = vr.YuNetDetector()
                rec = vr.SFaceRecognizer([], detector=det)
                if os.path.isfile(fx):
                    img = vision.imread(fx)
                    faces = det.detect_ex(img)                   # [(box, landmarks), ...]
                    ok("YuNet 能检出样例人脸", len(faces) >= 1, len(faces))
                    if faces:
                        (box, lm) = max(faces, key=lambda f: f[0][2] * f[0][3])
                        f1 = rec.feature(img, box, lm)
                        f2 = rec.feature(img, box, lm)
                        ok("SFace 特征稳定（同一图余弦≈1）",
                           f1.shape[0] == 128 and float(f1 @ f2) > 0.999,
                           round(float(f1 @ f2), 4))
                        # 换一张不同的人脸，余弦应明显低于阈值
                        fx2 = os.path.join(os.path.dirname(fx), "messi5.jpg")
                        if os.path.isfile(fx2):
                            img2 = vision.imread(fx2)
                            f3 = det.detect_ex(img2)
                            if f3:
                                b2, l2 = max(f3, key=lambda f: f[0][2] * f[0][3])
                                v2 = rec.feature(img2, b2, l2)
                                sim = float(f1 @ v2)
                                ok("不同人余弦低于阈值（能区分）",
                                   sim < vr.SFACE_THRESH, round(sim, 3))
                else:
                    print("SKIP · 真机样例图缺失（models/fixtures/lena.jpg）")
            else:
                print("SKIP · 真机模型未下载（python3 tools/get_models.py）")

            # 11 照片回放（演示模式：不用摄像头也能跑完整流程）
            from k1edge.pipeline import ImageReplay
            rp_dir = os.path.join(tmp, "replay")
            os.makedirs(rp_dir, exist_ok=True)
            vision.imwrite(os.path.join(rp_dir, "a.jpg"), suspect_img)
            rp = ImageReplay(rp_dir, hold=0.1, size=(640, 480))
            ok1, f1 = rp.read()
            ok("照片回放能出帧（且等比填充到采集尺寸）",
               ok1 and f1 is not None and f1.shape[:2] == (480, 640),
               None if f1 is None else f1.shape)
            time.sleep(0.15)
            ok2, f2 = rp.read()
            ok("照片回放会循环下一张", ok2 and f2 is not None)
            rp.release()

            # 12 底库热更新（后台/手工加照片后不用重启程序）
            hot = os.path.join(tmp, "hotgal")
            os.makedirs(os.path.join(hot, "suspect", "新人"), exist_ok=True)
            vision.imwrite(os.path.join(hot, "suspect", "新人", "1.jpg"), suspect_img)
            cfg2 = dict(pipe.cfg)
            cfg2["gallery"] = hot
            p2 = Pipeline(cfg2, store)
            n0 = len(p2.people)
            os.makedirs(os.path.join(hot, "staff", "老王"), exist_ok=True)
            vision.imwrite(os.path.join(hot, "staff", "老王", "1.jpg"), staff_img)
            ok("底库签名能感知新增照片", p2.gallery_sig() != p2._gsig)
            p2.reload_gallery()
            ok("底库热更新后人数 +1", len(p2.people) == n0 + 1, len(p2.people))

            # 13 巡检点切换（后台下发动作 → K1 改抓拍命名）
            store2 = EventStore(os.path.join(tmp, "q2.jsonl"), os.path.join(tmp, "a2.jsonl"))
            p3 = Pipeline(cfg2, store2)
            p3.cfg["location"] = "东门主入口"
            p3.cfg["point_code"] = "P-01"
            store2.push_action({"type": "switch_point", "location": "南门车库", "point_code": "P-02"})
            p3.poll_actions()
            ok("巡检点切换生效", p3.cfg["location"] == "南门车库" and p3.cfg["point_code"] == "P-02",
               p3.cfg["location"] + "/" + p3.cfg["point_code"])
        finally:
            server.shutdown()

        print("-" * 58)
        print("RESULT PASS=%d FAIL=%d" % (len(PASS), len(FAIL)))
        return 0 if not FAIL else 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
