#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 LCD 三态界面渲染成 PNG，便于在电脑上预览 / 写进文档（不需要显示器）。

    python tools/ui_preview.py            # 输出到 ../docs/lcd-*.png
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import numpy as np

from k1edge import vision
from k1edge.ui import Lcd

OUT = os.path.join(os.path.dirname(HERE), "..", "docs")


def fake_photo(path):
    """生成一张"抓拍照片"占位图（灰底 + 人形轮廓 + 噪点），仅用于界面预览。"""
    h, w = 480, 640
    img = np.zeros((h, w, 3), np.uint8)
    for y in range(h):
        img[y, :] = (60 + y // 6, 70 + y // 7, 80 + y // 8)
    import cv2
    cv2.rectangle(img, (0, h - 120), (w, h), (52, 56, 62), -1)
    cv2.circle(img, (320, 190), 78, (168, 150, 132), -1)                 # 头
    cv2.ellipse(img, (320, 430), (120, 170), 0, 0, 360, (74, 88, 120), -1)  # 身体
    cv2.circle(img, (296, 178), 8, (40, 40, 44), -1)
    cv2.circle(img, (344, 178), 8, (40, 40, 44), -1)
    noise = np.random.randint(-12, 12, (h, w, 1), dtype=np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    vision.imwrite(path, img)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    cfg = {"location": "东门主入口", "captures": os.path.join(OUT, "_tmp"), "device_id": "K1S-2601-A01"}
    os.makedirs(cfg["captures"], exist_ok=True)
    snap = fake_photo(os.path.join(cfg["captures"], "demo.jpg"))

    lcd = Lcd(cfg, show=False)

    # 1 待机
    lcd.state = "idle"
    lcd.compose().save(os.path.join(OUT, "lcd-1-idle.png"))

    # 2 命中（只亮小点）
    lcd.state = "hit"
    lcd.pending = [{"id": "ev_demo"}]
    lcd.compose().save(os.path.join(OUT, "lcd-2-hit.png"))

    # 3 调阅
    lcd.current = {
        "id": "ev_demo", "similarity": 0.937,
        "person": {"name": "张伟", "cat": "suspect", "code": "F-1001"},
        "history_hits": 3, "snapshot_key": "demo.jpg",
    }
    lcd.state = "detail"
    lcd.compose().save(os.path.join(OUT, "lcd-3-detail.png"))

    print("已生成：")
    for f in ("lcd-1-idle.png", "lcd-2-hit.png", "lcd-3-detail.png"):
        p = os.path.join(OUT, f)
        print("  %s  (%d KB)" % (p, os.path.getsize(p) // 1024))


if __name__ == "__main__":
    main()
