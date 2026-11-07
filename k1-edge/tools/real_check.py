#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""真机后端离线自检：不接摄像头，直接对人脸照片跑 检测 + 特征 + 比对。

    # 1) 单图：看检测框、关键点、128 维特征、耗时
    python3 tools/real_check.py --img 张三.jpg

    # 2) 两张图：看是不是同一个人（余弦相似度）
    python3 tools/real_check.py --img 张三1.jpg --img 张三2.jpg

    # 3) 不传参数：用内置样例图（models/fixtures/）跑一遍
    python3 tools/real_check.py

判定标准（SFace 官方）：余弦 ≥ 0.363 认为是同一人。
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from k1edge import vision                       # noqa: E402
from k1edge import vision_real as vr            # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--img", action="append", default=[], help="图片路径，可给两次")
    ap.add_argument("--models", default=None, help="模型目录，默认自动找")
    args = ap.parse_args()

    if not vr.models_ready(args.models):
        print(vr._missing_msg(args.models))
        return 2

    imgs = list(args.img)
    if not imgs:
        fx = os.path.join(HERE, "models", "fixtures")
        for name in ("lena.jpg", "messi5.jpg"):
            p = os.path.join(fx, name)
            if os.path.isfile(p):
                imgs.append(p)
    if not imgs:
        print("没有图片可测。用 --img 指定一张人脸照片。")
        return 2

    det = vr.YuNetDetector(model_dir=args.models)
    rec = vr.SFaceRecognizer([], model_dir=args.models, detector=det)

    feats = []
    for path in imgs:
        img = vision.imread(path)
        if img is None:
            print("读不到图片:", path)
            continue
        t = time.time()
        faces = det.detect_ex(img)
        dt = (time.time() - t) * 1000.0
        print("\n=== %s  %dx%d ===" % (path, img.shape[1], img.shape[0]))
        if not faces:
            print("  未检测到人脸（换个正面清晰的照片，或调低 cfg['yunet_score']）")
            continue
        print("  检测到 %d 张人脸，耗时 %.1f ms" % (len(faces), dt))
        for i, (box, lm) in enumerate(faces):
            print("   #%d 框=%s 关键点=%s" % (i, box, lm.astype(int).tolist()))
        box, lm = max(faces, key=lambda f: f[0][2] * f[0][3])
        t = time.time()
        f = rec.feature(img, box, lm)
        print("  特征 %d 维，提取 %.1f ms，范数 %.3f"
              % (f.shape[0], (time.time() - t) * 1000.0, float(abs(f).sum())))
        feats.append((path, f))

    if len(feats) >= 2:
        (pa, fa), (pb, fb) = feats[0], feats[1]
        sim = float(fa @ fb)
        print("\n=== 比对 ===")
        print("  %s  vs  %s" % (os.path.basename(pa), os.path.basename(pb)))
        print("  余弦相似度 = %.3f   →  %s（阈值 %.3f）"
              % (sim, "同一人" if sim >= vr.SFACE_THRESH else "不同人", vr.SFACE_THRESH))
    elif len(feats) == 1:
        print("\n再给第二张图（--img b.jpg）就能看比对结果。")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
