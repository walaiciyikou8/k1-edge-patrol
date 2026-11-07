#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""framebuffer 亮屏诊断 —— 不用桌面、不用 X，直接往 /dev/fbN 上画。

用途：判断 4.3" 屏到底能不能显示、它是哪一块 fb。

用法（板上，root）::

    python3 tools/fb_test.py                # 逐块 fb 依次显示 红/绿/蓝/文字
    python3 tools/fb_test.py --dev /dev/fb1 # 只测指定设备
    python3 tools/fb_test.py --ui           # 把我们真正的巡更界面画上去

每块 fb 会显示：纯红 1.5s → 纯绿 1.5s → 纯蓝 1.5s → 白底文字。
你只要盯着小屏，看哪一块的测试出现在屏上即可。
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from k1edge.fbdev import FbDev, list_fbs            # noqa: E402

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    Image = None


def _font(size):
    for p in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
              "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def card(fb, title, rgb, note=""):
    img = Image.new("RGB", (fb.w, fb.h), rgb)
    d = ImageDraw.Draw(img)
    d.text((30, fb.h // 2 - 60), title, font=_font(48), fill=(0, 0, 0))
    d.text((30, fb.h // 2 + 10), "%s  %dx%d  %dbpp" % (fb.dev, fb.w, fb.h, fb.bpp),
           font=_font(22), fill=(0, 0, 0))
    if note:
        d.text((30, fb.h // 2 + 50), note, font=_font(20), fill=(0, 0, 0))
    fb.show(img)


def run_one(path, ui_mode=False, hold=1.5):
    fb = FbDev(dev=path)
    if not fb.ok:
        print("  跳过 %s（打开失败/不支持）" % path)
        return False
    if ui_mode:
        from k1edge import config as cfgmod
        from k1edge.ui import Lcd
        cfg = cfgmod.load(os.path.join(HERE, "config.json"))
        ui = Lcd(cfg, show=False)
        img = ui.compose()
        fb.show(img)
        print("  已把巡更界面画到 %s，保持 6 秒…" % path)
        time.sleep(6)
        fb.close()
        return True

    card(fb, "RED 红", (220, 40, 40), "看到这块 = 这就是我们要的屏")
    time.sleep(hold)
    card(fb, "GREEN 绿", (40, 200, 80))
    time.sleep(hold)
    card(fb, "BLUE 蓝", (40, 90, 220))
    time.sleep(hold)
    card(fb, "FB OK", (240, 240, 240), "如果你能看到这行字，屏是好的")
    time.sleep(hold)
    fb.close()
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dev", default=None, help="只测某个 fb，如 /dev/fb1")
    ap.add_argument("--ui", action="store_true", help="把巡更界面画上去（不跑红绿蓝）")
    ap.add_argument("--hold", type=float, default=1.5, help="每个颜色停留秒数")
    args = ap.parse_args()

    if Image is None:
        print("缺少 Pillow，无法测试")
        return 1

    rows = list_fbs()
    print("=" * 54)
    if not rows:
        print("没有找到任何 framebuffer（/sys/class/graphics/fb* 为空）")
        print("说明这块屏在系统里连 fb 都没有 → 需要从 DRM/KMS 侧点亮")
        return 2
    for name, path, w, h, bpp in rows:
        print("  %-6s %-10s %4dx%-4d %2dbpp" % (name, path, w, h, bpp))
    print("=" * 54)
    print("现在开始逐个 fb 显示测试，请盯着 4.3 寸屏看有没有红/绿/蓝闪过…\n")

    targets = [args.dev] if args.dev else [r[1] for r in rows]
    for p in targets:
        print(">>> 测试 %s" % p)
        ok = run_one(p, ui_mode=args.ui, hold=args.hold)
        if not ok:
            continue
        if not args.dev:
            time.sleep(0.4)
    print("\n完成。哪一块出现在小屏上，就用它：python3 main.py --mock --serve-only --ui-mode fb --fb /dev/fbX")
    return 0


if __name__ == "__main__":
    sys.exit(main())
