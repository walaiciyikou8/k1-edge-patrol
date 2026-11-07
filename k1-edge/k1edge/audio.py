# -*- coding: utf-8 -*-
"""音频：麦克风环境音取证 + 播报。

硬件（MUSE Pi Pro / K1）：
    输出  板载 ES8326 → 3.5mm 音频口 → 桌面音箱
          ※ 常见「USB 桌面音箱」的 USB 头只负责供电，声音仍走 3.5mm 圆头，
            所以 ALSA 里通常只有 card 1: sndes8326，不会出现 USB Audio。
    输入  USB-A 阵列麦克风 → arecord 走 ALSA，免驱

设计原则：任何一步失败都不影响主流程（录不到音频就记空，播不出声就打印）。
"""
import array
import os
import re
import shutil
import subprocess
import threading
import wave


def _which(cmd):
    return shutil.which(cmd)


def _run(cmd, timeout=None):
    """执行命令，返回 (rc, 输出)。不抛异常。"""
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           timeout=timeout)
        return p.returncode, p.stdout.decode("utf-8", "replace")
    except Exception as e:
        return -1, str(e)


# ---------------------------------------------------------------- 设备枚举
def _parse_alsa_cards(text):
    """解析 aplay -l / arecord -l 输出，返回 [(card, device, desc)]。"""
    devs = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("card "):
            continue
        try:
            card = line.split("card")[1].split(":")[0].strip()
            dev = line.split("device")[1].split(":")[0].strip()
            # 保留整行：卡名里的 "USB Audio" / "snd-es8326" 不能丢，后面要靠它判断设备类型
            desc = line
            devs.append((card, dev, desc))
        except Exception:
            continue
    return devs


def list_audio_devices():
    """列出 ALSA 录音设备（`arecord -l`）。返回 [(card, device, desc)]。"""
    if not _which("arecord"):
        return []
    rc, out = _run(["arecord", "-l"])
    return _parse_alsa_cards(out) if rc == 0 else []


def list_playback_devices():
    """列出 ALSA 播放设备（`aplay -l`）。返回 [(card, device, desc)]。

    这是解决「没声音」的关键：K1 上真实喇叭挂在 snd-es8326，
    往往是 card 1，而 default / plughw:0,0 是空的或指向别处。
    """
    if not _which("aplay"):
        return []
    rc, out = _run(["aplay", "-l"], timeout=10)
    return _parse_alsa_cards(out) if rc == 0 else []


def pick_mic(cfg):
    """优先 USB 阵列麦；找不到就用 plughw:0,0 兜底。"""
    dev = str(cfg.get("mic_device") or "auto")
    if dev and dev != "auto":
        return dev
    for card, sub, desc in list_audio_devices():
        if "usb" in desc.lower() or "microphone" in desc.lower():
            return "plughw:%s,%s" % (card, sub)
    return "plughw:0,0"


# ---------------------------------------------------------------- 输出设备选择
def detect_output(cfg):
    """返回 (设备名, 卡号, 全部播放卡)。

    audio_out 写成 default / auto / 空 都视为「自动挑真实声卡」，
    这样老 config.json 不用改也能修好。想强制用 ALSA default 请写 force:default。
    """
    cards = list_playback_devices()
    dev = str(cfg.get("audio_out") or "auto").strip()
    if dev.startswith("force:"):
        return dev[6:], (cards[0][0] if cards else "0"), cards
    if dev not in ("", "auto", "default") and not dev.startswith("null"):
        return dev, (cards[0][0] if cards else "0"), cards
    if cards:
        # USB 声卡优先（一线通 USB 音箱就走这条），没有才用板载 ES8326
        pick = cards[0]
        for c, d, desc in cards:
            if "usb" in desc.lower() or "uac" in desc.lower():
                pick = (c, d, desc)
                break
        c, d, _ = pick
        return "plughw:%s,%s" % (c, d), c, cards
    if _which("aplay"):
        # aplay -l 偶发读不到（权限/服务未起）；K1 的 ES8326 固定在 card 1，
        # 直接走 plughw:1,0 比走 ALSA default 可靠得多。Windows 没有 aplay，
        # 会落到下面的 default，走 SAPI 播报。
        return "plughw:1,0", "1", cards
    return "default", "0", cards


def output_candidates(dev, cards=None):
    """生成 aplay -D 候选设备：真实硬件卡优先，default 放最后兜底。"""
    cards = cards if cards is not None else list_playback_devices()
    out = []
    if dev and dev not in ("default", "auto"):
        out.append(dev)
    for c, d, _ in cards:
        out.append("plughw:%s,%s" % (c, d))     # plughw 自动做采样率/声道转换
    for c, d, _ in cards:
        out.append("hw:%s,%s" % (c, d))
    out += ["pulse", "default", "plughw:0,0", "hw:0,0", "plughw:1,0"]
    seen, uniq = set(), []
    for d in out:
        if d and d not in seen:
            seen.add(d)
            uniq.append(d)
    return uniq


# ---------------------------------------------------------------- PulseAudio / 蓝牙音箱
def detect_pulse_sink():
    """返回 (sink 名, 是否蓝牙 sink)。蓝牙音箱在 PulseAudio 里叫 bluez_sink.XX_XX...。

    K1 上没有 3.5mm 孔、只能用蓝牙音箱时，播报就走这条通道（paplay / aplay -D pulse）。
    """
    if not _which("pactl"):
        return None, False
    rc, out = _run(["pactl", "list", "short", "sinks"], timeout=8)
    if rc != 0:
        return None, False
    first, bluez = None, None
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        name = parts[1].strip()
        if not name:
            continue
        if first is None:
            first = name
        if "bluez" in name.lower():
            bluez = name
            break
    return (bluez or first), bool(bluez)


def pulse_prepare(vol=90):
    """把蓝牙 sink 设为默认、取消静音、拉高音量。返回 sink 名或 None。"""
    sink, is_bt = detect_pulse_sink()
    if not is_bt:
        return None
    for cmd in (["pactl", "set-default-sink", sink],
                ["pactl", "set-sink-mute", sink, "0"],
                ["pactl", "set-sink-volume", sink, "%d%%" % int(vol or 90)]):
        _run(cmd, timeout=6)
    return sink


def _play_pulse(path, sink=None):
    """用 PulseAudio 播放（蓝牙音箱）。优先 paplay，回退 aplay -D pulse。"""
    if _which("paplay"):
        cmd = ["paplay"] + (["--device=%s" % sink] if sink else []) + [path]
        rc, out = _run(cmd, timeout=45)
        if rc == 0:
            return "paplay%s" % (" → 蓝牙" if sink else "")
    rc, out = _run(["aplay", "-D", "pulse", "-q", path], timeout=45)
    if rc == 0:
        return "aplay -D pulse"
    print("[speak:蓝牙] PulseAudio 播放失败：%s" % (out or "").strip()[:160])
    return None


# ---------------------------------------------------------------- 解除静音 / 音量
_MIXER_DONE = {"card": None, "touched": []}


def amixer_controls(card):
    """返回该卡所有简单控件名。"""
    rc, out = _run(["amixer", "-c", str(card), "scontrols"], timeout=8)
    names = []
    if rc == 0:
        for line in out.splitlines():
            m = re.search(r"'([^']+)'", line)
            if m:
                names.append(m.group(1))
    if not names:
        names = ["Master", "PCM", "Speaker", "Headphone", "Playback"]
    return names


def unmute_card(card, vol=90, force=False):
    """把该卡所有播放相关控件解除静音并拉高音量。

    ES8326 开机默认常常是 [off] / 0%，这是「明明播了却没声」的第二大原因。
    控件名各家镜像都不一样，所以这里全量遍历，失败静默忽略。
    """
    if not _which("amixer") or os.name == "nt":
        return []
    if not force and _MIXER_DONE["card"] == str(card):
        return _MIXER_DONE["touched"]
    _MIXER_DONE["card"] = str(card)
    vol = max(10, min(100, int(vol or 90)))
    names = amixer_controls(card)
    keys = ("volume", "vol", "playback", "master", "pcm", "dac", "headphone",
            "headset", "hp", "speaker", "spk", "output", "line", "mix")
    touched = []
    for n in names:
        low = n.lower()
        _run(["amixer", "-q", "-c", str(card), "sset", n, "unmute"], timeout=3)
        _run(["amixer", "-q", "-c", str(card), "sset", n, "on"], timeout=3)
        if any(k in low for k in keys):
            rc, _ = _run(["amixer", "-q", "-c", str(card), "sset", n,
                          "%d%%" % vol], timeout=3)
            if rc == 0:
                touched.append("%s=%d%%" % (n, vol))
    # 再补一次不带 -c 的全局设置（部分镜像把控件挂在默认卡上）
    for n in ("Master", "PCM", "Speaker", "Headphone", "Playback"):
        _run(["amixer", "-q", "sset", n, "%d%%" % vol, "unmute"], timeout=3)
    _MIXER_DONE["touched"] = touched or names
    return _MIXER_DONE["touched"]


# ---------------------------------------------------------------- WAV 归一化
def normalize_wav(src, dst, rate=48000):
    """把 TTS 的 wav（常为 22050Hz 单声道）转成 48000Hz / 16bit / 双声道。

    ES8326 只认 48k 立体声的情况很常见；plughw 虽能转换，但先归一化更稳。
    纯标准库实现，不依赖 audioop / numpy / sox。失败返回 None，调用方用原文件。
    """
    try:
        with wave.open(src, "rb") as w:
            nch, sw, fr, nframes = (w.getnchannels(), w.getsampwidth(),
                                    w.getframerate(), w.getnframes())
            raw = w.readframes(nframes)
        if sw != 2 or not raw or nch < 1 or fr < 1000:
            return None
        a = array.array("h")
        if a.itemsize != 2:
            return None
        a.frombytes(raw[:len(raw) // 2 * 2])
        if not a:
            return None
        if nch == 1:
            mono = list(a)
        else:
            mono = []
            for i in range(0, len(a) - nch + 1, nch):
                mono.append(sum(a[i:i + nch]) // nch)
        if fr == rate:
            out = mono
        else:
            total = int(len(mono) * rate / fr)
            out = []
            last = len(mono) - 1
            for i in range(total):
                pos = i * fr / rate
                i0 = int(pos)
                if i0 >= last:
                    out.append(mono[last])
                else:
                    f = pos - i0
                    out.append(int(mono[i0] * (1 - f) + mono[i0 + 1] * f))
        st = array.array("h")
        for v in out:
            v = -32768 if v < -32768 else (32767 if v > 32767 else v)
            st.append(v)
            st.append(v)
        with wave.open(dst, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(st.tobytes())
        return dst
    except Exception:
        return None


def make_beep(path, freq=1000, seconds=0.6, rate=48000):
    """生成一段 1kHz 纯音，用于不依赖 TTS 的硬件通道测试。"""
    import math
    st = array.array("h")
    for i in range(int(rate * seconds)):
        env = min(1.0, i / (rate * 0.01), (rate * seconds - i) / (rate * 0.01))
        v = int(12000 * env * math.sin(2 * math.pi * freq * i / rate))
        st.append(v)
        st.append(v)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(st.tobytes())
    return path


# ---------------------------------------------------------------- 环境音取证
def record_ambient(cfg, out_path, seconds=None):
    """录一段环境音（默认 5 秒）。成功返回路径，失败返回 None。

    阻塞调用，主循环里请放到后台线程执行。
    """
    if not cfg.get("record_ambient", True):
        return None
    seconds = int(seconds or cfg.get("record_sec") or 5)
    if not _which("arecord"):                      # Windows 调试环境
        print("[audio] 无 arecord，跳过录音（事件仍会带截图）")
        return None
    dev = pick_mic(cfg)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    cmd = ["arecord", "-D", dev, "-f", "S16_LE", "-r", "16000", "-c", "1",
           "-d", str(seconds), "-q", out_path]
    rc, out = _run(cmd, timeout=seconds + 8)
    if rc == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 1024:
        print("[audio] 环境音已录 %.1fs → %s" % (seconds, os.path.basename(out_path)))
        return out_path
    print("[audio] 录音失败（忽略）:", (out or "").strip()[:120])
    return None


def record_async(cfg, out_path, seconds=None):
    """后台录制，返回 Thread。"""
    t = threading.Thread(target=record_ambient, args=(cfg, out_path, seconds), daemon=True)
    t.start()
    return t


# ---------------------------------------------------------------- 播报
_SPEAK_LOCK = threading.Lock()
_OUTPUT_HINT = {"done": False}


def _apply_volume(cfg):
    """兼容旧调用：现在统一由 unmute_card 完成。"""
    dev, card, cards = detect_output(cfg)
    unmute_card(card, cfg.get("speaker_volume") or 90)
    return dev


def _play_wav(tmp, dev, cards=None):
    """播放 wav；按「真实硬件卡 → default」顺序尝试，返回首个成功的设备名。"""
    cands = output_candidates(dev, cards)
    seen, last = set(), ""
    for d in cands:
        if not d or d in seen:
            continue
        seen.add(d)
        rc, out = _run(["aplay", "-D", d, "-q", tmp], timeout=30)
        if rc == 0:
            return d, seen
        last = out.strip()[:160]
    print("[speak] aplay 播放失败（试过 %s）：%s" % (",".join(seen), last))
    # 最后兜底：K1 上有 PipeWire/PulseAudio 时，alsa 直连常被占用（Device busy），
    # 走 paplay 交给音频服务器反而更可靠（mpv 的 AO: [pipewire] 就是这么走的）。
    if _which("paplay"):
        rc, out = _run(["paplay", tmp], timeout=45)
        if rc == 0:
            return "paplay(系统默认输出)", seen
        print("[speak] paplay 也失败：%s" % (out or "").strip()[:160])
    return None, seen


_ESPEAK_VOICES = ("cmn", "zh-cn", "zh")


def _synth_espeak(text, tmp):
    """用 espeak-ng 合成中文 wav，返回实际用的 voice 或 None。

    ⚠ 发音「很乱」的常见原因：espeak-ng 的 `-v zh` 走通用中文规则，
      普通话听起来含糊、像念拼音。换成 `-v cmn`（Mandarin）并放慢语速
      （-s 145）、加词间停顿（-g 4）会清楚很多，依次尝试直到合成出有效文件。
    """
    for v in _ESPEAK_VOICES:
        rc, out = _run(["espeak-ng", "-v", v, "-s", "145", "-p", "48", "-g", "4",
                        "-w", tmp, text], timeout=25)
        if rc == 0 and os.path.isfile(tmp) and os.path.getsize(tmp) > 1000:
            return v
    return None


def _pregenerated(text, cfg):
    """预生成语音：captures/voice/<md5>.wav 或 <文本前40字>.wav，没有则返回 None。

    用途：espeak-ng 的中文实在听不清时，用手机 App / 在线 TTS 生成高质量 wav
    丢进 captures/voice/，脚本会优先播放它，完全绕开 TTS。
    文件名 = 整句文本的 md5，或者去掉非法字符后的文本本身。
    """
    import hashlib
    d = os.path.join(cfg.get("captures") or "./captures", "voice")
    if not os.path.isdir(d):
        return None
    key = hashlib.md5(text.encode("utf-8")).hexdigest()
    safe = re.sub(r'[\\/:*?"<>|\s]+', "_", text).strip("_")[:40]
    for name in (key, safe):
        if not name:
            continue
        p = os.path.join(d, name + ".wav")
        if os.path.isfile(p) and os.path.getsize(p) > 1000:
            return p
    return None


def speak(text, cfg, force=False):
    """播报一句话。quiet 时直接返回 False（实战静默模式）。

    优先级：tts_file_demo(K1 自带) → espeak-ng → Windows SAPI → 仅打印
    """
    if not text:
        return False
    if not force and (cfg.get("quiet") or not cfg.get("speak", True)):
        print("[speak:静默] %s" % text)
        return False

    tmp = os.path.join(cfg.get("captures") or ".", "_tts.wav")
    os.makedirs(os.path.dirname(tmp) or ".", exist_ok=True)

    # ---- 选设备 + 解除静音（每次进程只提示一次，日志里能看到）----
    dev, card, cards = detect_output(cfg)
    bt_sink = None
    if os.name != "nt":
        if not _which("aplay"):
            print("[speak:缺依赖] 找不到 aplay → sudo apt install -y alsa-utils")
            print("[speak:文本] %s" % text)
            return False
        if not (_which("tts_file_demo") or _which("espeak-ng")):
            print("[speak:缺依赖] 找不到 TTS → sudo apt install -y espeak-ng")
            print("[speak:文本] %s" % text)
            return False
        # 蓝牙音箱（PulseAudio bluez_sink）优先：没有 3.5mm 孔时唯一的出声通道
        bt_sink = pulse_prepare(cfg.get("speaker_volume") or 90)
        if not _OUTPUT_HINT["done"]:
            _OUTPUT_HINT["done"] = True
            if bt_sink:
                print("[speak:蓝牙] 输出 = 蓝牙音箱（PulseAudio sink=%s）" % bt_sink)
            else:
                desc = cards[0][2] if cards else "(未识别到播放卡)"
                print("[speak:声卡] card %s %s → %s" % (card, desc, dev))
                touched = unmute_card(card, cfg.get("speaker_volume") or 90)
                print("[speak:混音] 已解除静音/设音量：%s"
                      % (", ".join(touched[:6]) if touched else "无 amixer"))
    else:
        dev = "default"

    def _out(wav_path):
        if not os.path.isfile(wav_path) or os.path.getsize(wav_path) < 44:
            return None
        norm = normalize_wav(wav_path, wav_path.replace(".wav", "_48k.wav"))
        src = norm or wav_path
        if bt_sink:
            d = _play_pulse(src, bt_sink)
            if d:
                return d
        d, _ = _play_wav(src, dev, cards)
        return d

    with _SPEAK_LOCK:
        # 0) 预生成语音优先（captures/voice/ 下有对应 wav 就直接播，绕开 TTS）
        pre = _pregenerated(text, cfg)
        if pre:
            d = _out(pre)
            if d:
                print("[speak:外放 via %s · 预生成语音] %s" % (d, text))
                return True

        # 1) K1 自带 TTS
        if _which("tts_file_demo"):
            rc, out = _run(["tts_file_demo", "-p", text, "-l", "matcha:zh", "-f", tmp], timeout=20)
            if rc == 0:
                d = _out(tmp)
                if d:
                    print("[speak:外放 via %s] %s" % (d, text))
                    return True

        # 2) espeak-ng（普通话 voice + 放慢语速，明显更清楚）
        if _which("espeak-ng"):
            v = _synth_espeak(text, tmp)
            if v:
                d = _out(tmp)
                if d:
                    print("[speak:外放 via %s · espeak %s] %s" % (d, v, text))
                    return True
            else:
                print("[speak] espeak-ng 合成失败（试过 %s）" % ",".join(_ESPEAK_VOICES))

        # 3) Windows（笔记本调试）
        if os.name == "nt":
            ps = ('(New-Object -ComObject SAPI.SpVoice).Speak("%s")' % text.replace('"', ' '))
            rc, _ = _run(["powershell", "-NoProfile", "-c", ps], timeout=30)
            if rc == 0:
                print("[speak:外放] %s" % text)
                return True

        print("[speak:文本] %s" % text)
        return False


def alert_text(cfg, name, score=None):
    """关注人员告警播报词（外放/演示用）。

    ⚠ 故意不带「相似度百分之X」：一是句子越短越听得清（espeak-ng 尤其明显），
      二是文本固定后才能用 tools/gen_voice.py 预生成高质量语音——
      带百分比每次都不一样，md5 对不上就命中不了预生成音频。
    """
    return "请注意，%s发现重点关注人员，%s，请立即核实。" % (
        cfg.get("location") or "本区", name)


def resolve_text(cfg, resolution_name):
    """处置完成后的确认播报（端侧执行完后台指令时用）。

    默认不播报：处置确认音在演示里价值不大，而且少一句话就少一个出错点。
    想开启就在 config.json 里设 "speak_resolve": true（并跑一次 gen_voice.py
    生成对应语音，否则会回退到 espeak，中文听不清）。
    """
    if not cfg.get("speak_resolve", False):
        return ""
    return "处置已提交，%s" % resolution_name
