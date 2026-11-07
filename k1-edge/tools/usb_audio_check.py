#!/usr/bin/env python3
"""K1 USB 音箱 / USB 声卡 是否存在？一条命令查清楚。

    python3 tools/usb_audio_check.py

回答一个问题：插在 USB 口上的音箱，到底有没有被系统当成「USB 声卡」认出来。
（K1 的 aplay -l 里只有 snd-es8326 就说明没认出来。）
"""
import glob
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from k1edge import audio  # noqa: E402

BAR = "=" * 64
AUDIO_CLASS = "01"          # USB Audio Class
HID_CLASS = "03"
HUB_CLASS = "09"

KNOWN_AUDIO_CHIPS = (
    "c-media", "cmedia", "generalplus", "jieli", "sonix", "tenx", "jmt",
    "usb audio", "audio device", "headset", "speaker", "sound", "dac",
    "hynitron", "realtek", "fii", "uac",
)


def read(p):
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            return f.read().strip()
    except Exception:
        return ""


def usb_tree():
    """不依赖 root 扫 sysfs，返回 [(端口, vid:pid, 产品名, [接口类], 是否音频)]。"""
    rows = []
    for d in sorted(glob.glob("/sys/bus/usb/devices/*")):
        base = os.path.basename(d)
        if ":" in base:                       # 接口目录，跳过
            continue
        vid = read(os.path.join(d, "idVendor"))
        if not vid:
            continue
        pid = read(os.path.join(d, "idProduct"))
        name = (read(os.path.join(d, "product"))
                or read(os.path.join(d, "manufacturer"))
                or "(未命名)")
        classes = []
        for i in glob.glob(os.path.join(d, "*:*")):
            c = read(os.path.join(i, "bInterfaceClass")).lower()
            if c and c not in classes:
                classes.append(c)
        rows.append((base, "%s:%s" % (vid, pid), name, classes,
                     AUDIO_CLASS in classes))
    return rows


def lsmod_has(name):
    rc, out = audio._run(["lsmod"], timeout=8)
    if rc != 0:
        return None
    for line in out.splitlines():
        if line.split(" ")[0] == name:
            return line.strip()
    return False


def main():
    os.chdir(HERE)
    print(BAR)
    print("K1 USB 音箱体检（判断：这条 USB 线到底是不是声卡）")
    print(BAR)

    # ---- 1. ALSA 里的播放卡 ----
    rc, out = audio._run(["aplay", "-l"], timeout=10)
    print("[1] ALSA 播放卡（aplay -l）")
    print("\n".join("   " + l for l in (out.strip() or "(无)").splitlines()[:16]))

    cards_txt = read("/proc/asound/cards")
    print("\n[2] 内核认到的所有声卡（/proc/asound/cards）")
    print("\n".join("   " + l for l in (cards_txt or "(读不到)").splitlines()[:16]))

    modules_txt = read("/proc/asound/modules")
    print("\n[3] 声卡↔驱动映射（/proc/asound/modules）")
    print("\n".join("   " + l for l in (modules_txt or "(读不到)").splitlines()[:12]))

    # ---- 4. USB 树 ----
    print("\n[4] USB 设备清单（sysfs，不需要 sudo）")
    rows = usb_tree()
    audio_rows = [r for r in rows if r[4]]
    for port, idv, name, classes, is_audio in rows:
        tag = "★USB音频" if is_audio else ("hub" if HUB_CLASS in classes else "")
        print("   %-8s %-10s %-28s class=%-14s %s"
              % (port, idv, name[:28], ",".join(classes) or "-", tag))
    if not rows:
        print("   (读不到 /sys/bus/usb/devices)")

    # ---- 5. lsusb ----
    rc, out = audio._run(["lsusb"], timeout=8)
    print("\n[5] lsusb")
    print("\n".join("   " + l for l in (out.strip() or "(未安装 usbutils)").splitlines()[:16]))

    # ---- 6. 驱动模块 ----
    print("\n[6] USB 音频驱动")
    mod = lsmod_has("snd_usb_audio")
    if mod is False:
        print("   snd_usb_audio  未加载  <<< 这是没声音的关键之一")
    elif mod:
        print("   " + mod)
    else:
        print("   (读不到 lsmod)")

    # ---- 7. dmesg ----
    rc, out = audio._run(["dmesg"], timeout=9)
    print("\n[7] 内核日志里的 USB / 音频报错")
    if rc != 0:
        print("   普通用户无权读 dmesg，改用： sudo dmesg | grep -Ei 'usb|audio|snd' | tail -30")
    else:
        hits = [l for l in out.splitlines()
                if any(k in l.lower() for k in
                       ("usb", "audio", "snd", "over-current", "error -71"))][-18:]
        print("\n".join("   " + l[:150] for l in hits) if hits else "   (没有相关日志)")

    # ---- 8. 结论 ----
    print("\n" + BAR)
    usb_cards = [c for c in audio.list_playback_devices()
                 if "usb" in c[2].lower() or "uac" in c[2].lower()]
    if usb_cards:
        c, d, desc = usb_cards[0]
        print("结论 A ✅：系统已经把音箱当成 USB 声卡认出来了 → card %s" % c)
        print("   直接把 config.json 的 audio_out 改成 \"plughw:%s,%s\"，或保持 auto（新版会自动优先 USB 卡）" % (c, d))
        print("   手工试听： aplay -D plughw:%s,%s captures/_beep.wav" % (c, d))
    elif audio_rows:
        print("结论 B ⚠：USB 口上确实插着一个「音频类」设备，但 ALSA 没给它建卡。")
        print("   先加载驱动： sudo modprobe snd-usb-audio")
        print("   再查：       aplay -l")
        print("   如果 modprobe 报 'module not found' → 这版内核没编 USB 音频，只能用 3.5mm 或蓝牙。")
        print("   如果加载后出现 card 2: Device [USB Audio] → 重跑本脚本，会走结论 A。")
    else:
        print("结论 C ❌：USB 总线上没有任何音频设备。")
        print("   说明这条 USB 线只是「供电线」，它不传声音。请确认音箱靠什么收声音：")
        print("   1) 音箱机身/背面找一个 3.5mm 圆孔（写着 AUX / LINE IN）→ 用 AUX 线接 K1 板载音频口")
        print("   2) 没有 AUX 孔 → 它多半是蓝牙音箱，USB 只充电，需要在 K1 上配蓝牙")
        print("   3) 换个 USB 口再插一次（板上有的口是 USB2，有的供电弱）")
        print("   4) 插到电脑上试：电脑里如果冒出新的「扬声器 / USB Audio」，说明它确实是 UAC 声卡，")
        print("      那问题就在 K1 这版内核/驱动，而不是音箱。")

    # 供电类报错单独提醒
    if rc == 0 and ("over-current" in out.lower() or "error -71" in out):
        print("\n⚠ 内核日志里有 over-current / error -71：USB 供电不足或接触不良，")
        print("   换一个 USB 口，或用带独立供电的 USB Hub。")
    print(BAR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
