#!/usr/bin/env python3
"""K1 扬声器一条命令体检：python3 tools/speak_test.py ["要说的话"]

会依次检查：依赖 → 播放声卡 → 是否被静音 → 纯音能不能出去 → TTS 播报。
最后给一段人话结论，告诉用户下一步该做什么。
"""
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from k1edge import audio, config  # noqa: E402

BAR = "=" * 64


def dump_mixer(card):
    """返回 [(控件名, 音量%, on/off)]，用于显示谁被静音了。"""
    rc, out = audio._run(["amixer", "-c", str(card), "scontents"], timeout=10)
    if rc != 0:
        return []
    items, cur = [], None
    for ln in out.splitlines():
        if ln.startswith("Simple mixer control"):
            m = re.search(r"'([^']+)'", ln)
            cur = {"name": m.group(1) if m else ln.strip(), "pct": None, "sw": None}
            items.append(cur)
        elif cur is not None:
            if cur["pct"] is None:
                m = re.search(r"\[(\d+)%\]", ln)
                if m:
                    cur["pct"] = int(m.group(1))
            if cur["sw"] is None:
                m = re.search(r"\[(on|off)\]", ln, re.I)
                if m:
                    cur["sw"] = m.group(1).lower()
    return [(i["name"], i["pct"], i["sw"]) for i in items]


def show_mixer(card, title):
    items = dump_mixer(card)
    print(title)
    if not items:
        print("  (读不到混音控件，amixer 或权限有问题)")
        return
    for name, pct, sw in items:
        flag = ""
        if sw == "off":
            flag = "   <<< 被静音了"
        elif pct == 0:
            flag = "   <<< 音量是 0"
        print("  %-30s %6s  %-5s%s"
              % (name[:30], ("%s%%" % pct) if pct is not None else "-",
                 ("[%s]" % sw) if sw else "-", flag))


def main():
    os.chdir(ROOT)
    cfg = config.load(os.path.join(ROOT, "config.json"))
    text = sys.argv[1] if len(sys.argv) > 1 else "测试播报，发现重点关注人员，请立即核实"

    print(BAR)
    print("K1 扬声器体检")
    print(BAR)
    print("配置：speak=%s quiet=%s audio_out=%s volume=%s"
          % (cfg.get("speak"), cfg.get("quiet"), cfg.get("audio_out"),
             cfg.get("speaker_volume")))
    print("-" * 64)
    for cmd in ("tts_file_demo", "espeak-ng", "aplay", "amixer"):
        print("  %-14s %s" % (cmd, shutil.which(cmd) or "缺失"))

    # espeak-ng 的中文语音：有 cmn 就用 cmn，发音比 zh 清楚得多
    rc, out = audio._run(["espeak-ng", "--voices"], timeout=10)
    if rc == 0:
        zh = [l.strip() for l in out.splitlines()
              if ("cmn" in l or "zh" in l or "yue" in l)]
        print("-" * 64)
        print("espeak-ng 可用的中文语音（合成时优先 cmn）：")
        print("\n".join("   " + l[:78] for l in zh[:8])
              or "   (没有中文语音 → sudo apt install -y espeak-ng-data)")

    # ---- 1. 播放设备 ----
    print("-" * 64)
    rc, out = audio._run(["aplay", "-l"], timeout=10)
    print("ALSA 播放设备（aplay -l）：")
    print(out.strip() or "  (无输出 / aplay 不可用)")
    cards = audio.list_playback_devices()
    dev, card, cards = audio.detect_output(cfg)
    if cards:
        print("\n自动选中的输出设备： %s   (card %s: %s)" % (dev, card, cards[0][2][:70]))
    else:
        print("\n⚠ 没识别到任何播放设备，检查 alsa-utils 是否装好 / 用户是否在 audio 组")

    usb_card = [c for c in cards
                if "usb" in c[2].lower() or "usb audio" in c[2].lower()]
    if usb_card:
        print("检测到 USB 声卡：card %s %s（如果音箱走 USB，把 config.json 的"
              % (usb_card[0][0], usb_card[0][2]))
        print("  audio_out 改成 \"plughw:%s,%s\"）" % (usb_card[0][0], usb_card[0][1]))
    else:
        print("⚠ 没检测到 USB 声卡 → 你这个音箱属于「USB 只供电 + 3.5mm 圆头传声」")
        print("   USB 那根线只负责给音箱供电，不出声音；")
        print("   另一根圆形 3.5mm 插头必须插到 K1 板子上的耳机/音频孔。")
        print("   开机「咚」一声只是通电冲击声，不代表音频线有信号。")

    # ---- 2. default 被谁劫持了 ----
    for f in ("/etc/asound.conf", os.path.expanduser("~/.asoundrc")):
        if os.path.isfile(f):
            try:
                with open(f, "r", encoding="utf-8", errors="replace") as fp:
                    body = fp.read().strip()
                if body:
                    print("-" * 64)
                    print("%s 改写了 default（这就是为什么 aplay -D default 没声音）：" % f)
                    print("\n".join("  " + l for l in body.splitlines()[:12]))
            except Exception:
                pass

    # ---- 3. 静音状态 ----
    print("-" * 64)
    show_mixer(card, "解除静音【之前】的混音控件：")
    touched = audio.unmute_card(card, cfg.get("speaker_volume") or 90, force=True)
    print("已尝试解除静音并设音量：%s"
          % (", ".join(touched[:8]) if touched else "(无 amixer)"))
    show_mixer(card, "解除静音【之后】的混音控件：")

    # ---- 4. 纯音逐设备测试（不依赖 TTS）----
    print("-" * 64)
    beep = os.path.join(cfg.get("captures") or "./captures", "_beep.wav")
    audio.make_beep(beep)
    print("纯音测试：会连续响几声短「嘀」，属正常。逐个设备试：")
    cands = audio.output_candidates(dev, cards)
    ok_devs = []
    for d in cands:
        rc, out = audio._run(["aplay", "-D", d, "-q", beep], timeout=15)
        ok = (rc == 0)
        if ok:
            ok_devs.append(d)
        print("  %-16s %s" % (d, "OK" if ok else "失败: " + out.strip().replace("\n", " ")[:80]))
    print("\n最短手工复测命令（可直接手打）：")
    print("  aplay -D %s captures/_beep.wav" % dev)

    # ---- 5. 真正播报 ----
    print("-" * 64)
    print("尝试播报：", text)
    spoken = audio.speak(text, cfg, force=True)
    print("-" * 64)

    # ---- 6. 人话结论 ----
    if not ok_devs:
        print("结论 ❌：连纯音都放不出去。")
        print("  1) sudo apt install -y alsa-utils espeak-ng")
        print("  2) 把 3.5mm 圆头插紧；音箱自带音量旋钮拧到一半以上")
        print("  3) 把上面整段输出发给我，看 amixer 里哪个控件还是 [off]")
    elif not spoken:
        print("结论 ⚠：硬件通道通了，但 TTS 没合成出来（espeak-ng 缺失或失败）。")
        print("  sudo apt install -y espeak-ng")
    else:
        print("结论 ✅：软件这边已经把声音送到 %s。" % dev)
        print("  如果耳朵还是听不到，就不是脚本问题了，按顺序查：")
        print("  ① 3.5mm 圆头有没有插到 K1 板子的音频孔（USB 头只是供电，不出声）")
        print("  ② 音箱自己的音量旋钮 / 开关 / 电源指示灯")
        print("  ③ 换一副耳机插同一个孔，确认板子音频口正常")
        print("  ④ 把上面「解除静音之后」的控件列表发我，确认没有还是 [off] 的输出开关")
    return 0 if (ok_devs and spoken) else 1


if __name__ == "__main__":
    sys.exit(main())
