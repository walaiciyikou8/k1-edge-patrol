#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""K1 板端环境检查：摄像头 / NPU / 模型 / 底库 / 字体 一键体检。

    python3 tools/check_env.py

参考官方实验套件 check_env.py，但针对本项目（人脸巡更）定制。
"""
import glob
import os
import platform
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

ROWS = []


def add(name, ok, detail, required=True):
    ROWS.append((name, ok, required, detail))


def _ver(mod):
    try:
        return getattr(mod, "__version__", "?")
    except Exception:
        return "?"


def main():
    print("=" * 56)
    print("K1 手持巡更 · 板端环境检查")
    print("=" * 56)
    print("platform: %s / %s" % (platform.platform(), platform.machine()))
    print("python:   %s" % platform.python_version())
    print()

    # ---- 依赖 ----
    for name, import_as in (("numpy", None), ("cv2", "opencv"), ("PIL", "Pillow")):
        try:
            mod = __import__(name)
            add("import " + (import_as or name), True, _ver(mod))
        except Exception as e:
            add("import " + (import_as or name), False, str(e))

    # ---- NPU ----
    try:
        import onnxruntime as ort
        eps = ort.get_available_providers()
        has_ep = "SpaceMITExecutionProvider" in eps
        add("SpaceMITExecutionProvider", has_ep, ", ".join(eps), required=False)
    except Exception as e:
        add("onnxruntime", False, str(e), required=False)
        has_ep = False
    try:
        import spacemit_ort  # noqa: F401
        add("import spacemit_ort", True, "ok", required=False)
    except Exception as e:
        add("import spacemit_ort", False, str(e), required=False)
    if os.path.exists("/dev/tcm"):
        import stat
        mode = oct(stat.S_IMODE(os.stat("/dev/tcm").st_mode))
        add("/dev/tcm 权限", mode == "0660", mode, required=False)
    else:
        add("/dev/tcm 权限", False, "缺失（需 udev 规则 + plugdev 组）", required=False)

    # ---- 摄像头 ----
    is_linux = platform.system() == "Linux"
    devs = sorted(glob.glob("/dev/video*"))
    add("摄像头节点", bool(devs), ", ".join(devs) or "无 /dev/video*", required=is_linux)
    add("MIPI 虚拟相机 /dev/video50", "/dev/video50" in devs,
        "存在" if "/dev/video50" in devs else "缺失（先 cam-test 生成）", required=False)
    for j in ("/usr/share/camera_json/csi3_camera_auto.json",
              "/usr/share/camera_json/csi1_camera_auto.json",
              "/usr/share/camera_json/csi2_camera_auto.json",
              "/tmp/csi3_camera_auto.json", "/tmp/csi1_camera_auto.json",
              "/root/svivi_cam1.json"):
        if os.path.isfile(j):
            add("spacemitsrc 配置 " + j, True, "存在", required=False)
            break
    else:
        add("spacemitsrc 配置", False, "未见 csi3/csi1 配置 json", required=False)

    # ---- 模型 ----
    from k1edge import vision_real as vr
    models_dir = os.path.join(HERE, "models")
    for f in ("face_detection_yunet_2023mar.onnx",
              "face_detection_yunet_2022mar.onnx",
              "face_recognition_sface_2021dec.onnx"):
        p = os.path.join(models_dir, f)
        add("模型 " + f, os.path.isfile(p),
            "%d KB" % (os.path.getsize(p) // 1024) if os.path.isfile(p) else "缺失",
            required=(f != "face_detection_yunet_2023mar.onnx"))
    add("真机后端可加载", vr.models_ready(models_dir), "YuNet+SFace 齐备", required=False)

    # ---- 底库 ----
    try:
        from k1edge import gallery
        people = gallery.scan(os.path.join(HERE, "gallery"))
        add("人脸底库", len(people) > 0, "%d 人（suspect %d）" % (
            len(people), sum(1 for p in people if p.get("cat") == "suspect")), required=False)
    except Exception as e:
        add("人脸底库", False, str(e), required=False)

    # ---- 中文字体 ----
    font_ok = any(os.path.isfile(f) for f in (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"))
    add("中文字体", font_ok, "有 Noto/wqy" if font_ok else "缺（apt install fonts-noto-cjk）", required=False)

    # ---- 结论 ----
    print("\n" + "-" * 56)
    for name, ok, required, detail in ROWS:
        mark = "OK" if ok else ("WARN" if not required else "FAIL")
        print("  [%-4s] %-32s %s" % (mark, name, detail))
    fails = [n for n, ok, r, _ in ROWS if r and not ok]
    print("-" * 56)
    if fails:
        print("仍有 %d 项必须项未通过：%s" % (len(fails), "、".join(fails)))
        print("对照 板端运行.md 的「环境检查 / 摄像头」章节处理。")
        return 1
    print("环境检查通过。可运行：python3 tools/selftest.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
