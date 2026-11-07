#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""下载真机人脸模型（YuNet 检测 + SFace 识别）。

    python3 tools/get_models.py              # 下载到 ./models/
    python3 tools/get_models.py --dir /opt/models
    python3 tools/get_models.py --check      # 只检查，不下载

模型很小、CPU 也能跑；板上装了 NPU 的话同一条链路会自动用上（见 vision_real.py）。

也可以在没有任何网络的机器上手工拷：
    face_detection_yunet_2023mar.onnx    ≈ 232 KB
    face_recognition_sface_2021dec.onnx  ≈ 37 MB
来源：https://github.com/opencv/opencv_zoo
"""
import argparse
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

BASE = "https://github.com/opencv/opencv_zoo/raw/main/models"
HF = "https://huggingface.co/opencv/%s/resolve/main/%s"
HFM = "https://hf-mirror.com/opencv/%s/resolve/main/%s"

# 2022mar 模型已从 opencv_zoo 主分支移除，只能从历史 commit 的 Git LFS 取
YUNET_2022_URL = ("https://media.githubusercontent.com/media/opencv/opencv_zoo/"
                  "7e062e54cf5410c09b795ff71b4a255e58498c79/models/"
                  "face_detection_yunet/face_detection_yunet_2022mar.onnx")

# (子目录, 文件名, 最小大小, 备用下载源)
MODELS = [
    ("face_detection_yunet", "face_detection_yunet_2023mar.onnx", 200 * 1024,
     [HF, HFM, "gh"]),
    ("face_recognition_sface", "face_recognition_sface_2021dec.onnx", 30 * 1024 * 1024,
     [HF, HFM, "gh"]),
    # OpenCV 4.5.4~4.7（板子 apt 自带 4.6）需要这版，2023mar 跑不起来
    ("_legacy_yunet", "face_detection_yunet_2022mar.onnx", 300 * 1024,
     ["_url:" + YUNET_2022_URL]),
]


def urls_for(folder, fname, kinds):
    """按优先级给出候选 URL：HuggingFace / hf 镜像 / GitHub / 自定义。"""
    out = []
    for k in kinds:
        if k == "gh":
            out.append("%s/%s/%s" % (BASE, folder, fname))
        elif k == HF:
            out.append(HF % (folder, fname))
        elif k == HFM:
            out.append(HFM % (folder, fname))
        elif k.startswith("_url:"):
            out.append(k[len("_url:"):])
    return out


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return "%.1f %s" % (n, unit)
        n /= 1024.0


def fetch(url, dst, retries=5):
    """带断点续传 + 重试的下载（大文件在弱网下很容易被重置）。"""
    tmp = dst + ".part"
    for attempt in range(1, retries + 1):
        have = os.path.getsize(tmp) if os.path.isfile(tmp) else 0
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        if have:
            req.add_header("Range", "bytes=%d-" % have)
        print("  下载 %s%s" % (url, ("（续传 %s）" % human(have)) if have else ""))
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "ab" if have else "wb") as f:
                total = int(r.headers.get("Content-Length") or 0) + have
                got, mark = have, (have * 100 // total) if total else 0
                while True:
                    chunk = r.read(256 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    got += len(chunk)
                    if total and got * 100 // total >= mark + 20:
                        mark = got * 100 // total
                        print("    %d%%  (%s / %s)" % (mark, human(got), human(total)))
            os.replace(tmp, dst)
            return True
        except Exception as e:
            print("  第 %d 次失败: %s" % (attempt, e))
            if attempt < retries:
                time.sleep(2 * attempt)          # 退避后继续续传
    print("  放弃。可手动下载后放到 %s" % dst)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(HERE, "models"))
    ap.add_argument("--check", action="store_true", help="只检查本地是否齐全")
    args = ap.parse_args()

    os.makedirs(args.dir, exist_ok=True)
    print("模型目录:", args.dir)
    missing = 0
    for folder, fname, min_size, kinds in MODELS:
        dst = os.path.join(args.dir, fname)
        ok = os.path.isfile(dst) and os.path.getsize(dst) >= min_size
        if ok:
            print("  ✓ %s  %s" % (fname, human(os.path.getsize(dst))))
            continue
        missing += 1
        if args.check:
            print("  ✗ %s  缺失" % fname)
            continue
        got = False
        for url in urls_for(folder, fname, kinds):
            if fetch(url, dst):
                got = True
                break
            print("  换下一个源…")
        if not got:
            print("  ✗ %s 下载失败" % fname)
            continue
        if os.path.getsize(dst) >= min_size:
            print("  ✓ %s  %s" % (fname, human(os.path.getsize(dst))))
            missing -= 1
        else:
            print("  ✗ %s 大小异常（%s），可能是网络拦截" % (fname, human(os.path.getsize(dst))))

    if missing:
        print("\n还缺 %d 个模型。离线环境可手动从 opencv_zoo 拷进 %s：" % (missing, args.dir))
        for _, fname, _, _ in MODELS:
            print("  ", fname)
        return 1
    print("\n模型就绪。真机模式：python3 main.py --real --camera /dev/video0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
