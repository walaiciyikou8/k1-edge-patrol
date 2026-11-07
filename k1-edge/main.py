#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""K1 手持巡更 —— 端侧主程序。

常用命令
--------
本机调试（笔记本摄像头 / 无板子）：
    python main.py --mock --camera 0

只在板上跑界面与桥接（不接摄像头，用于联调后台）：
    python main.py --mock --serve-only

真机（已装 SpaceMiT AI SDK）：
    python main.py --real --camera /dev/video0 --gallery ./gallery

生成配置文件 / 查看录音设备：
    python main.py --init-config
    python main.py --list-audio
"""
import argparse
import os
import signal
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k1edge import bridge, config
from k1edge.events import EventStore
from k1edge.pipeline import Pipeline
from k1edge.ui import Lcd

HERE = os.path.dirname(os.path.abspath(__file__))


def _has_gui():
    """判断当前 opencv 是否带 GUI（headless 版没有 imshow，需要走网页屏）。"""
    try:
        import cv2
        info = cv2.getBuildInformation()
        for line in info.splitlines():
            if line.strip().startswith("GUI"):
                val = line.split(":", 1)[1].strip().upper()
                return val not in ("NONE", "")
    except Exception:
        pass
    try:
        import cv2
        return hasattr(cv2, "imshow")
    except Exception:
        return False


def build_cfg(args):
    path = args.config or os.path.join(HERE, "config.json")
    cfg = config.load(path)
    if args.mock:
        cfg["mock"] = True
    if args.real:
        cfg["mock"] = False
    for key, val in (("camera", args.camera), ("camera_backend", args.camera_backend),
                     ("camera_json", args.camera_json), ("gallery", args.gallery),
                     ("location", args.location), ("device_id", args.device_id),
                     ("bridge_port", args.port), ("replay", args.replay),
                     ("replay_hold", args.replay_hold)):
        if val not in (None, ""):
            cfg[key] = val
    if args.no_speak:
        cfg["speak"] = False
    if args.quiet:
        cfg["quiet"] = True
    if args.center_crop:
        cfg["center_crop"] = float(args.center_crop)
    # K1 是纯 CPU 推理：检测宽度收紧到 480（config.json 里的旧值 640 也一并压下来），
    # 否则界面刷新和点击响应都会被检测拖慢
    try:
        cfg["detect_max_w"] = min(int(cfg.get("detect_max_w") or 480), 480)
    except Exception:
        cfg["detect_max_w"] = 480
    # 抗误检：阈值与人脸最小像素给一个下限（板上 config.json 的旧松值不生效）
    try:
        cfg["yunet_score"] = max(float(cfg.get("yunet_score") or 0.75), 0.7)
    except Exception:
        cfg["yunet_score"] = 0.75
    try:
        cfg["min_face_px"] = max(int(cfg.get("min_face_px") or 90), 80)
    except Exception:
        cfg["min_face_px"] = 90
    # 没有麦克风时 arecord 会一直报"音乐打开错误"，默认关掉环境音录制
    if getattr(args, "ambient", False):
        cfg["record_ambient"] = True
    elif not getattr(args, "keep_ambient", False):
        cfg["record_ambient"] = False
    cfg["_path"] = path
    return cfg


def main():
    ap = argparse.ArgumentParser(description="K1 手持巡更端侧程序")
    ap.add_argument("--config", default=None, help="配置文件路径，默认 ./config.json")
    ap.add_argument("--init-config", action="store_true", help="生成示例配置并退出")
    ap.add_argument("--list-audio", action="store_true", help="列出 ALSA 录音设备并退出")
    ap.add_argument("--ambient", action="store_true", help="开启环境音录制（需要麦克风）")
    ap.add_argument("--keep-ambient", action="store_true", help="沿用配置里的环境音开关")
    ap.add_argument("--mock", action="store_true", help="本机 OpenCV 调试模式")
    ap.add_argument("--real", action="store_true", help="SpaceMiT NPU 真机模式")
    ap.add_argument("--camera", default=None, help="0 / /dev/video50（auto=自动）")
    ap.add_argument("--camera-backend", default=None, choices=["auto", "gstreamer", "v4l2"],
                    help="取流后端：gstreamer=spacemitsrc（MIPI 虚拟相机）；v4l2=USB/普通")
    ap.add_argument("--camera-json", default=None, help="spacemitsrc 配置 json 路径（默认自动找 csi3/csi1）")
    ap.add_argument("--list-cameras", action="store_true", help="列出 /dev/video* 并退出")
    ap.add_argument("--replay", default=None,
                    help="用照片目录代替摄像头（演示/联调，不需要真人站在镜头前）")
    ap.add_argument("--replay-hold", default=None, type=float, help="每张照片停留秒数，默认 3")
    ap.add_argument("--gallery", default=None, help="人脸库目录")
    ap.add_argument("--location", default=None, help="点位名称")
    ap.add_argument("--device-id", default=None, help="设备 SN")
    ap.add_argument("--port", default=None, type=int, help="桥接服务端口，默认 8088")
    ap.add_argument("--center-crop", default=None, help="广角中心裁剪比例，如 0.75")
    ap.add_argument("--no-speak", action="store_true", help="不播报")
    ap.add_argument("--quiet", action="store_true", help="静默模式（实战：不惊动目标）")
    ap.add_argument("--no-ui", action="store_true", help="不显示 LCD 界面（等同 --ui-mode none）")
    ap.add_argument("--no-browser", action="store_true", help="网页屏模式不自动打开浏览器")
    ap.add_argument("--no-fullscreen", action="store_true", help="窗口不全屏（排查黑屏时用）")
    ap.add_argument("--ui-mode", default="auto", choices=["auto", "window", "web", "fb", "none"],
                    help="LCD 显示方式：window=OpenCV 窗口；web=浏览器屏(/screen)；"
                         "fb=直接写 /dev/fbN（无需桌面/X）；none=不显示")
    ap.add_argument("--fb", default=None, help="framebuffer 模式指定设备，如 /dev/fb1")
    ap.add_argument("--list-fb", action="store_true", help="列出所有 framebuffer 并退出")
    ap.add_argument("--serve-only", action="store_true", help="只跑桥接与界面，不接摄像头")
    args = ap.parse_args()

    if args.init_config:
        cfg = config.load(None)
        path = config.save(cfg, args.config or os.path.join(HERE, "config.json"))
        print("已生成配置:", path)
        return

    if args.list_audio:
        from k1edge import audio
        devs = audio.list_audio_devices()
        if not devs:
            print("未发现 ALSA 录音设备（Windows 调试环境可忽略）")
        for card, sub, desc in devs:
            print("  card %s device %s  →  plughw:%s,%s   %s" % (card, sub, card, sub, desc))
        print("自动选择结果:", audio.pick_mic(config.load(None)))
        return

    if args.list_cameras:
        import glob
        devs = sorted(glob.glob("/dev/video*"))
        if not devs:
            print("未发现 /dev/video* 节点（板上 MIPI 相机要先 cam-test 生成 /dev/video50）")
        for d in devs:
            tag = "  ← MIPI 虚拟相机（默认）" if d.endswith("video50") else ""
            print("  %s%s" % (d, tag))
        import os as _os
        for j in ("/usr/share/camera_json/csi3_camera_auto.json",
                  "/usr/share/camera_json/csi1_camera_auto.json",
                  "/usr/share/camera_json/csi2_camera_auto.json",
                  "/tmp/csi3_camera_auto.json", "/tmp/csi1_camera_auto.json",
                  "/root/svivi_cam1.json"):
            if _os.path.isfile(j):
                print("  [配置] %s 存在" % j)
        print("推荐板上运行：python3 main.py --real --camera /dev/video50 --camera-backend gstreamer")
        return

    if args.list_fb:
        from k1edge.fbdev import list_fbs, pick_fb
        rows = list_fbs()
        if not rows:
            print("未发现 framebuffer（/sys/class/graphics 下没有 fb*）")
        for name, path, w, h, bpp in rows:
            print("  %-6s %-10s %4dx%-4d %2dbpp" % (name, path, w, h, bpp))
        best = pick_fb()
        print("自动选择:", best[1] if best else "无")
        return

    cfg = build_cfg(args)
    config.ensure_dirs(cfg)
    if not os.path.isfile(cfg["_path"]):
        config.save(cfg, cfg["_path"])
        print("[config] 已生成默认配置:", cfg["_path"])

    print("=" * 62)
    print("K1 手持巡更 ·", config.summary(cfg))
    print("=" * 62)

    if not cfg.get("mock", True):
        try:
            from k1edge.vision_real import (MODEL_YUNET, find_model, models_ready,
                                            npu_status)
            md = cfg.get("models_dir") or None
            if models_ready(md):
                print("[vision] 真机模型就绪:", find_model(MODEL_YUNET, md), npu_status())
            else:
                print("[vision] ⚠ 模型缺失 → 会降级为 mock。先跑：python3 tools/get_models.py")
        except Exception as e:
            print("[vision] 检查真机模型失败:", e)

    ui_mode = args.ui_mode
    if args.no_ui:
        ui_mode = "none"
    if ui_mode == "auto":
        if _has_gui():
            ui_mode = "window"
        else:
            # 无 GUI 时优先直写 framebuffer（板上没有桌面也能亮屏），否则网页屏
            try:
                from k1edge.fbdev import pick_fb
                _c = pick_fb()
                ui_mode = "fb" if (_c and _c[2] == 800 and _c[3] == 480) else "web"
            except Exception:
                ui_mode = "web"
    cfg["ui_mode"] = ui_mode

    if ui_mode == "window":
        try:
            import cv2 as _cv2
            _gui = "未知"
            for _ln in (_cv2.getBuildInformation().splitlines()):
                if _ln.strip().startswith("GUI"):
                    _gui = _ln.split(":", 1)[1].strip()
            print("[ui] OpenCV GUI 后端:", _gui, "  DISPLAY=", os.environ.get("DISPLAY", "(空)"))
        except Exception as _e:
            print("[ui] 读取 OpenCV GUI 信息失败:", _e)

    store = EventStore(cfg["queue_file"], cfg["actions_file"])
    print("[store] 历史事件 %d 条（未同步 %d 条）" % (
        store.stats()["total"], store.stats()["unsynced"]))

    fbdev = None
    if ui_mode == "fb":
        from k1edge.fbdev import FbDev
        fbdev = FbDev(args.fb)
        if not fbdev.ok:
            print("[ui] framebuffer 不可用，自动降级为网页屏（/screen）")
            ui_mode = "web"
            cfg["ui_mode"] = ui_mode
        else:
            print("[ui] LCD 直写 framebuffer：%s %dx%d" % (fbdev.dev, fbdev.w, fbdev.h))

    ui = Lcd(cfg, show=(ui_mode == "window"), fullscreen=not args.no_fullscreen, fb=fbdev)
    if ui_mode == "web":
        url = "http://127.0.0.1:%d/screen" % cfg["bridge_port"]
        print("[ui] LCD 走浏览器屏：%s" % url)
        if not args.no_browser:
            import threading
            import webbrowser
            threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    admin_dir = os.path.join(HERE, "admin")
    bridge.serve(store, cfg, html_dir=admin_dir if os.path.isdir(admin_dir) else None, ui=ui)

    if args.serve_only:
        print(">>> 仅桥接 + 界面模式（Ctrl+C 退出）。摄像头未启用。")
        try:
            while True:
                if ui_mode in ("window", "fb") and not ui.tick():
                    break
                for act in store.drain_actions():
                    if act.get("type") == "resolved":
                        ui.mark_resolved(act.get("event_id"), act.get("resolution_name") or "")
                if ui_mode == "window":
                    time.sleep(0.03)
                elif ui_mode == "fb":
                    time.sleep(0.12 if not ui.pending else 0.06)
                else:
                    time.sleep(0.2)
        except KeyboardInterrupt:
            print("\n已退出。")
        finally:
            ui.close()
        return

    pipe = Pipeline(cfg, store)
    pipe.attach_ui(ui)

    def _stop(signum, frame):
        raise KeyboardInterrupt
    try:
        signal.signal(signal.SIGINT, _stop)
    except Exception:
        pass

    try:
        stats = pipe.run()
        print("[done]", stats)
    except KeyboardInterrupt:
        print("\n[stop] 已停止巡更")


if __name__ == "__main__":
    main()
