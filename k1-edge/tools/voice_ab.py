#!/usr/bin/env python3
"""中文播报 A/B 试听：几组参数挨个播，哪个听得清就用哪个。

    python3 tools/voice_ab.py

espeak-ng 的中文质量天生一般（sit 合成器），但语速、停顿、句子长短影响很大。
听完把「最好懂的那一组编号」告诉我，我把它设成默认。
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from k1edge import audio, config  # noqa: E402

BAR = "=" * 62

TEXT_FULL = "请注意，东门主入口发现重点关注人员，大王，相似度百分之八十六，请立即核实。"
TEXT_MID = "发现重点人员，大王，请立即核实。"
TEXT_SHORT = "发现重点人员，大王。"
TEXT_TINY = "注意，发现重点人员。"

# (编号, 说明, espeak 参数, 文本)
CASES = [
    ("A", "当前设置 145 词分 + 停顿", ["-v", "cmn", "-s", "145", "-p", "48", "-g", "4"], TEXT_FULL),
    ("B", "放慢 120 词分 + 无停顿", ["-v", "cmn", "-s", "120", "-p", "48", "-g", "0"], TEXT_FULL),
    ("C", "很慢 100 词分", ["-v", "cmn", "-s", "100", "-p", "50", "-g", "2"], TEXT_FULL),
    ("D", "中句 + 130 词分", ["-v", "cmn", "-s", "130", "-p", "48", "-g", "0"], TEXT_MID),
    ("E", "短句 + 120 词分", ["-v", "cmn", "-s", "120", "-p", "48", "-g", "0"], TEXT_SHORT),
    ("F", "极短句（最清楚）", ["-v", "cmn", "-s", "115", "-p", "50", "-g", "0"], TEXT_TINY),
]


def main():
    os.chdir(HERE)
    cfg = config.load(os.path.join(HERE, "config.json"))
    if not shutil.which("espeak-ng"):
        print("缺 espeak-ng → sudo apt install -y espeak-ng")
        return 1
    if not shutil.which("aplay"):
        print("缺 aplay → sudo apt install -y alsa-utils")
        return 1

    dev, card, cards = audio.detect_output(cfg)
    print(BAR)
    print("中文播报 A/B 试听")
    print(BAR)
    print("输出设备：%s（card %s）" % (dev, card))

    # USB 音箱常见只有 PCM 控件，先拉满
    for ctl in ("PCM", "Master", "Speaker"):
        audio._run(["amixer", "-q", "-c", card, "sset", ctl, "100%", "unmute"], timeout=5)
    print("音量已拉到 100%")
    print("-" * 62)
    print("会依次播 6 段，每段前面先「嘀」一声做分隔。")
    print("听完记住哪一组最听得清。\n")

    tmp = os.path.join(cfg.get("captures") or "./captures", "_ab.wav")
    beep = os.path.join(cfg.get("captures") or "./captures", "_ab_beep.wav")
    audio.make_beep(beep, freq=1200, seconds=0.35)
    os.makedirs(os.path.dirname(tmp) or ".", exist_ok=True)

    played = []
    for tag, desc, args, text in CASES:
        print("[%s] %s" % (tag, desc))
        audio._play_wav(beep, dev, cards)
        cmd = ["espeak-ng"] + args + ["-w", tmp, text]
        rc, out = audio._run(cmd, timeout=25)
        if rc != 0 or not os.path.isfile(tmp) or os.path.getsize(tmp) < 1000:
            print("    合成失败：%s" % (out or "").strip()[:120])
            continue
        norm = audio.normalize_wav(tmp, tmp.replace(".wav", "_48k.wav"))
        d, _ = audio._play_wav(norm or tmp, dev, cards)
        if d:
            played.append(tag)
            print("    已播放（%s）" % d)
        else:
            print("    播放失败")
            # 蓝牙/其它通道兜底
            p = audio._play_pulse(norm or tmp)
            if p:
                played.append(tag)
                print("    已通过 %s 播放" % p)

    print("\n" + BAR)
    print("播完 %d 组：%s" % (len(played), "、".join(played)))
    print("哪一组最听得清？告诉我编号（比如 E），我把它设成默认。")
    print("如果全都听不清，说明 espeak-ng 的中文不行，我给你换方案（预生成语音）。")
    print(BAR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
