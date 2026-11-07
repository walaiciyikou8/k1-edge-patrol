# -*- coding: utf-8 -*-
"""主循环编排：取流 → 检测 → 识别 → 分流 → 存档 → 上报 → 播报 → 界面。

三类分流（与后台一致）：
    suspect  重点关注 → 危险告警：抓拍 + 环境音 + 外放/耳机播报 + 上报 + LCD 小点
    staff/vip 白名单  → 正常通行：只抓拍 + 上报（不播报、不亮灯）
    unknown  陌生人   → 陌生访客：抓拍 + 上报（不播报）
"""
import datetime
import os
import threading
import time

from . import audio, events as ev_mod, gallery, vision
from .events import Cooldown

CAT_TEXT = {"suspect": "重点关注", "staff": "内部员工", "vip": "访客白名单", "unknown": "陌生访客"}

_IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def _letterbox(img, size):
    """等比缩放 + 居中填充到目标尺寸（直接 resize 会把脸拉变形，影响识别）。"""
    import cv2
    import numpy as np
    tw, th = int(size[0]), int(size[1])
    h, w = img.shape[:2]
    s = min(tw / float(w), th / float(h))
    nw, nh = max(1, int(w * s)), max(1, int(h * s))
    out = np.zeros((th, tw, 3), dtype=img.dtype)
    out[:] = (24, 24, 24)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    x0, y0 = (tw - nw) // 2, (th - nh) // 2
    out[y0:y0 + nh, x0:x0 + nw] = resized
    return out


class ImageReplay:
    """用照片目录代替摄像头。

    演示/联调时不需要真人站在镜头前：把照片按顺序"播放"给流水线，
    每张停留 hold 秒，效果与真实摄像头完全一致（同样走检测→识别→处置）。
    """

    def __init__(self, folder, hold=3.0, size=(1280, 720), loop=True, shuffle=False):
        import glob
        self.files = []
        for ext in _IMG_EXT:
            self.files += glob.glob(os.path.join(folder, "*" + ext))
            self.files += glob.glob(os.path.join(folder, "*" + ext.upper()))
        self.files = sorted(set(self.files))
        if shuffle:
            import random
            random.shuffle(self.files)
        if not self.files:
            raise SystemExit("[replay] 目录里没有图片: %s" % folder)
        self.hold = max(0.2, float(hold or 3.0))
        self.size = size
        self.loop = loop
        self.i = -1
        self._t = 0.0
        self._img = None
        print("[replay] 照片回放 %d 张（每张 %.1fs）：%s" % (len(self.files), self.hold, folder))

    def isOpened(self):
        return True

    def _load(self):
        import cv2
        self.i += 1
        if self.i >= len(self.files):
            if not self.loop:
                return False
            self.i = 0
        path = self.files[self.i]
        img = vision.imread(path)
        if img is None:
            print("[replay] 读不到，跳过:", path)
            return False
        img = _letterbox(img, self.size)
        self._img = img
        self._t = time.time()
        print("[replay] ▶ %s" % os.path.basename(path))
        return True

    def read(self):
        if self._img is None or time.time() - self._t > self.hold:
            for _ in range(len(self.files)):
                if self._load():
                    break
            else:
                return False, None
        return True, self._img.copy()

    def release(self):
        self._img = None


def _pick_camera():
    """auto：优先 K1 的 MIPI 虚拟相机 /dev/video50，其次第一个 /dev/video*，电脑退回 0。"""
    import glob
    devs = sorted(glob.glob("/dev/video*"))
    if not devs:
        return "0"
    for d in devs:
        if d.endswith("video50"):
            return d
    return devs[0]


def _spacemit_gst_pipeline(w, h, cam_json=None):
    """K1 MIPI 虚拟相机的 GStreamer 管线。

    IMX219 走 spacemitsrc 读 NV12 非连续平面；普通 v4l2src 会报
    “non-contiguous planes”。cam-test 默认把配置写到 /usr/share/camera_json/csiN_camera_auto.json
    （本镜像实测），旧版本可能写到 /tmp/csiN_camera_auto.json，这里一并兼容。
    """
    cands = [c for c in (cam_json,
                         "/root/svivi_cam1.json",
                         "/usr/share/camera_json/csi3_camera_auto.json",
                         "/usr/share/camera_json/csi1_camera_auto.json",
                         "/usr/share/camera_json/csi2_camera_auto.json",
                         "/tmp/csi3_camera_auto.json",
                         "/tmp/csi1_camera_auto.json",
                         "/tmp/csi2_camera_auto.json") if c]
    loc = next((c for c in cands if os.path.isfile(c)), "/usr/share/camera_json/csi3_camera_auto.json")
    return ("spacemitsrc location=%s close-dmabuf=1 ! "
            "video/x-raw,format=NV12,width=%d,height=%d ! "
            "videoconvert ! video/x-raw,format=BGR ! "
            "appsink drop=true max-buffers=1 sync=false" % (loc, int(w), int(h)))


class Pipeline:
    def __init__(self, cfg, store):
        self.cfg = cfg
        self.store = store
        self.people = gallery.scan(cfg.get("gallery") or "./gallery")
        self.det, self.rec = vision.build(cfg, self.people)
        self.cool = Cooldown()
        self.ui = None
        self.hits = {}
        self._t0 = time.time()
        self._frames = 0
        self._infer_ms = 0.0
        self.cap = None
        self._gsig = self.gallery_sig()

    # ---------------- 外部挂载 ----------------
    def attach_ui(self, ui):
        self.ui = ui
        ui.on_resolve = self.resolve_from_device

    # ---------------- 摄像头 ----------------
    def open_camera(self):
        vision.require_cv2()
        import cv2
        src = self.cfg.get("camera") or "0"
        if isinstance(src, str) and src.strip().lower() in ("auto", ""):
            src = _pick_camera()
            print("[camera] auto 选中:", src)
        w = int(self.cfg.get("capture_w") or 1920)
        h = int(self.cfg.get("capture_h") or 1080)
        backend = (self.cfg.get("camera_backend") or "auto").lower()
        is_dev = isinstance(src, str) and src.startswith("/dev/video")
        if is_dev and backend in ("auto", "gstreamer"):
            # spacemitsrc / IMX219 只出 1080p，强制对齐，忽略 config.json 里的旧分辨率
            w, h = 1920, 1080
            self.cfg["capture_w"], self.cfg["capture_h"] = 1920, 1080

        cap = None
        used_gst = False
        # 1) K1 MIPI 虚拟相机：优先 spacemitsrc（NV12 非连续平面，v4l2src 会报错）
        if is_dev and backend in ("auto", "gstreamer"):
            try:
                pipe = _spacemit_gst_pipeline(w, h, self.cfg.get("camera_json"))
                cap = cv2.VideoCapture(pipe, cv2.CAP_GSTREAMER)
                if cap.isOpened():
                    used_gst = True
                    print("[camera] 通过 spacemitsrc 打开 %s" % src)
                else:
                    cap.release()
                    cap = None
            except Exception as e:
                print("[camera] spacemitsrc 不可用（%s），回退 v4l2" % e)
                cap = None

        # 2) 普通 v4l2（USB 摄像头 / 电脑 0 号）
        if cap is None and backend in ("auto", "v4l2"):
            device = int(src) if (isinstance(src, str) and src.isdigit()) else src
            try:
                cap = cv2.VideoCapture(device, cv2.CAP_V4L2 if isinstance(device, str) else cv2.CAP_ANY)
            except Exception:
                cap = None
            if cap and cap.isOpened():
                print("[camera] 通过 v4l2 打开 %s" % src)
            else:
                if cap:
                    cap.release()
                cap = None

        if cap is None:
            raise SystemExit(
                "[camera] 打不开摄像头: %s。\n"
                "  本机调试: --camera 0\n"
                "  板上 MIPI: --camera /dev/video50（需先 cam-test 生成 /usr/share/camera_json/csi3_camera_auto.json，"
                "见板端运行.md）" % src)
        if not used_gst:
            # GStreamer 管线的分辨率已在管线字符串里定死；
            # 对它调用 set 会触发 OpenCV 停止并重建管线，重建失败后所有读帧都会失败
            try:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
                cap.set(cv2.CAP_PROP_FPS, 30)
            except Exception:
                pass
        self.cap = cap
        print("[camera] 已打开 %s (%dx%d)" % (src, w, h))
        return cap

    # ---------------- 指标 ----------------
    def metrics(self):
        self._frames += 1
        fps = self._frames / max(0.001, time.time() - self._t0)
        try:
            load = os.getloadavg()[0]
            cores = os.cpu_count() or 4
            cpu = int(min(99, load / cores * 100))
        except Exception:
            cpu = 0
        return {"cpu": cpu, "npu": 0, "fps": round(fps, 1),
                "infer_ms": round(self._infer_ms, 1), "device": self.cfg.get("device_id")}

    # ---------------- 主循环 ----------------
    def open_source(self):
        """有 cfg['replay'] 就走照片回放，否则开摄像头。"""
        folder = self.cfg.get("replay")
        if folder:
            self.cap = ImageReplay(folder,
                                   hold=self.cfg.get("replay_hold") or 3.0,
                                   size=(self.cfg["capture_w"], self.cfg["capture_h"]),
                                   shuffle=bool(self.cfg.get("replay_shuffle")))
            return self.cap
        return self.open_camera()

    def run(self, max_frames=None):
        cap = self.cap or self.open_source()
        every = max(1, int(self.cfg.get("detect_every") or 3))
        idx = 0
        fails = 0
        gcheck = time.time()
        self.cleanup_captures()          # 启动先清一次旧抓拍
        last_clean = time.time()
        print(">>> 巡更开始（q 退出）。点位 %s，库 %d 人" % (
            self.cfg.get("location"), len(self.people)))
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    # 板子上 v4l2 偶发掉流：先尝试重开几次，别直接退出
                    if fails < 3 and not isinstance(cap, ImageReplay):
                        fails += 1
                        print("[camera] 读帧失败（%d/3），1 秒后重开…" % fails)
                        try:
                            cap.release()
                        except Exception:
                            pass
                        time.sleep(1.0)
                        try:
                            cap = self.open_camera()
                        except SystemExit as e:
                            print(e)
                            break
                        continue
                    print("[camera] 读帧失败，退出")
                    break
                fails = 0
                if self.ui:
                    self.ui.set_frame(frame)   # 窗口/网页屏的实时预览
                if time.time() - last_clean > 1800:   # 每 30 分钟清一次
                    last_clean = time.time()
                    self.cleanup_captures()
                if time.time() - gcheck > 3.0:          # 底库热更新：3 秒看一眼有没有新照片
                    gcheck = time.time()
                    try:
                        if self.gallery_sig() != self._gsig:
                            self.reload_gallery()
                    except Exception as e:
                        print("[gallery] 检查失败:", e)
                if frame is None or frame.shape[1] != self.cfg["capture_w"]:
                    import cv2
                    frame = cv2.resize(frame, (self.cfg["capture_w"], self.cfg["capture_h"]))
                if idx % every == 0:
                    self.process_frame(frame)
                self.poll_actions()
                if self.ui and not self.ui.tick():
                    break
                idx += 1
                if max_frames and idx >= max_frames:
                    break
        finally:
            if self.cap:
                self.cap.release()
            if self.ui:
                self.ui.close()
        return self.store.stats()

    # ---------------- 单帧处理 ----------------
    def process_frame(self, frame):
        """检测 + 识别 + 分流。返回本帧产生的事件列表（自检脚本直接调用）。"""
        out = []
        sub, (ox, oy) = vision.center_crop(frame, self.cfg.get("center_crop") or 1.0)
        t = time.time()
        faces = None
        if hasattr(self.det, "detect_ex"):          # 真机后端会额外给 5 点关键点
            try:
                faces = self.det.detect_ex(sub)
            except Exception as e:
                print("[pipe] detect_ex 失败，退回纯框检测:", e)
        if faces is None:
            faces = [(b, None) for b in self.det.detect(sub)]
        self._infer_ms = (time.time() - t) * 1000.0
        min_px = int(self.cfg.get("min_face_px") or 60)
        for (x, y, w, h), lm in faces:
            if w < min_px or h < min_px:
                continue
            box = (x + ox, y + oy, w, h)
            if lm is not None and (ox or oy):
                lm = lm + [ox, oy]                  # 关键点也换算到整帧坐标
            m = self.rec.match(frame, box, lm)
            e = self.dispatch(frame, box, m)
            if e:
                out.append(e)
        return out

    def dispatch(self, frame, box, m):
        """把一次识别结果落成事件；被冷却拦下时返回 None。"""
        cat = m.get("cat") or "unknown"
        if m.get("ok"):
            key, cooldown = m["name"], float(self.cfg.get("cooldown_sec") or 60)
        else:
            key, cooldown = "__stranger__", float(self.cfg.get("stranger_cooldown_sec") or 20)
        if not self.cool.allow(key, cooldown):
            return None

        if m.get("ok"):
            kind = "alert" if cat == "suspect" else "pass"
            person = {"name": m["name"], "code": m.get("code") or "", "cat": cat,
                      "level": m.get("level") or 0}
            self.hits[m["name"]] = self.hits.get(m["name"], 0) + 1
        else:
            kind = "stranger"
            person = {"name": "陌生访客", "code": "", "cat": "unknown", "level": 0}

        snap_rel = ""
        if kind != "stranger" or self.cfg.get("stranger_snapshot", True):
            snap_rel = self.save_snapshot(frame, person["name"])
        event = ev_mod.build_event(
            self.cfg, kind=kind, person=person, similarity=m.get("score") or 0,
            snapshot_key=snap_rel, box=box, metrics=self.metrics(),
            history_hits=self.hits.get(person["name"], 0))
        self.store.add(event)
        print("[%s] %s %s %.2f → %s" % (kind.upper(), CAT_TEXT.get(cat, cat),
                                        person["name"], event["similarity"], snap_rel or "(不抓拍)"))

        if kind == "alert":
            audio.speak(audio.alert_text(self.cfg, person["name"], event["similarity"]), self.cfg)
            self._start_audio(event, snap_rel)
            if self.ui:
                self.ui.push(event)
        elif self.cfg.get("record_ambient"):
            self._start_audio(event, snap_rel)
        return event

    # ---------------- 抓拍清理 ----------------
    def cleanup_captures(self):
        """按「保留天数 + 最多张数」清理抓拍，避免长期运行把磁盘塞满。"""
        root = os.path.abspath(self.cfg.get("captures") or "./captures")
        if not os.path.isdir(root):
            return 0
        try:
            days = int(self.cfg.get("capture_keep_days") or 0)
            maxn = int(self.cfg.get("capture_max_files") or 0)
        except Exception:
            return 0
        removed, files, now = 0, [], time.time()
        for day in sorted(os.listdir(root)):
            d = os.path.join(root, day)
            if not (os.path.isdir(d) and day.isdigit()):
                continue
            for f in os.listdir(d):
                if not f.lower().endswith((".jpg", ".jpeg", ".png")):
                    continue
                p = os.path.join(d, f)
                try:
                    st = os.stat(p)
                except OSError:
                    continue
                if days > 0 and (now - st.st_mtime) > days * 86400:
                    try:
                        os.remove(p)
                        removed += 1
                    except OSError:
                        pass
                    continue
                files.append((st.st_mtime, p))
            try:
                if not os.listdir(d):
                    os.rmdir(d)
            except OSError:
                pass
        if maxn > 0 and len(files) > maxn:
            files.sort()
            for _, p in files[:len(files) - maxn]:
                try:
                    os.remove(p)
                    removed += 1
                except OSError:
                    pass
        if removed:
            print("[cleanup] 清理旧抓拍 %d 张（保留 %d 天 / 上限 %d 张）"
                  % (removed, days, maxn))
        return removed

    # ---------------- 存档 ----------------
    def save_snapshot(self, frame, name):
        import cv2
        now = datetime.datetime.now()
        day = now.strftime("%Y%m%d")
        d = os.path.join(self.cfg.get("captures") or "./captures", day)
        os.makedirs(d, exist_ok=True)
        fname = "%s_%s_%s.jpg" % (now.strftime("%Y%m%d_%H%M%S"),
                                  self.cfg.get("location", "点位"), name)
        path = os.path.join(d, fname)
        vision.imwrite(path, frame)
        return "%s/%s" % (day, fname)

    def _start_audio(self, event, snap_rel):
        if not self.cfg.get("record_ambient"):
            return
        base = os.path.splitext(snap_rel)[0] + ".wav"
        out = os.path.join(self.cfg.get("captures") or "./captures", base)

        def work():
            if audio.record_ambient(self.cfg, out):
                self.store.patch(event["id"], audio_key=base)

        threading.Thread(target=work, daemon=True).start()

    # ---------------- 处置 ----------------
    def resolve_from_device(self, event, resolution):
        """LCD 上巡逻员点选的处置：写库 + 播报确认（处置人=设备绑定账号）。"""
        eid = event.get("id") if isinstance(event, dict) else str(event)
        e = self.store.resolve(eid, resolution, unit="", operator=self.cfg.get("operator"),
                               note="", source="device")
        if e:
            audio.speak(audio.resolve_text(self.cfg, e.get("resolution_name")), self.cfg)
            print("[device] 端侧处置 %s → %s" % (eid, e.get("resolution_name")))
        return e

    def poll_actions(self):
        """取后台下发的动作（后台处置后让端侧收尾）。"""
        for act in self.store.drain_actions():
            if act.get("type") == "resolved":
                audio.speak(audio.resolve_text(self.cfg, act.get("resolution_name") or "已处置"),
                            self.cfg)
                if self.ui:
                    self.ui.mark_resolved(act.get("event_id"), act.get("resolution_name") or "")
                print("[action] 后台处置同步: %s" % act.get("event_id"))
            elif act.get("type") in ("reload_gallery", "watchlist"):
                self.reload_gallery()
            elif act.get("type") in ("switch_point", "set_location"):
                name = act.get("location") or act.get("point_name") or act.get("name") or ""
                code = act.get("point_code") or act.get("code") or ""
                if name:
                    self.cfg["location"] = name
                if code:
                    self.cfg["point_code"] = code
                print("[action] 切换巡检点 → %s (%s)，后续抓拍以此命名" % (
                    self.cfg.get("location"), self.cfg.get("point_code")))

    # ---------------- 底库热更新 ----------------
    def gallery_sig(self):
        """底库签名（文件路径 + 修改时间），用来判断要不要重载。"""
        root = self.cfg.get("gallery") or "./gallery"
        sig = []
        for dp, _, fns in os.walk(root):
            for f in fns:
                if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
                    p = os.path.join(dp, f)
                    try:
                        sig.append((p, int(os.path.getmtime(p))))
                    except OSError:
                        pass
        return tuple(sorted(sig))

    def reload_gallery(self):
        """重新扫描人脸库并重建模板（新增/替换照片后不用重启程序）。"""
        try:
            people = gallery.scan(self.cfg.get("gallery") or "./gallery")
            if hasattr(self.rec, "index") or hasattr(self.rec, "vecs"):
                if hasattr(self.rec, "index"):
                    self.rec.index = []
                else:
                    self.rec.vecs = []
                self.rec.people = []
                n = sum(self.rec.add_person(p) for p in people)
                print("[gallery] 热重载完成：%d 人 / %d 张模板" % (len(people), n))
            else:
                self.det, self.rec = vision.build(self.cfg, people)
                print("[gallery] 热重载完成（重建后端）：%d 人" % len(people))
            self.people = people
            self._gsig = self.gallery_sig()
            return True
        except Exception as e:
            print("[gallery] 热重载失败:", e)
            return False
