#!/usr/bin/env python3
"""用 edge-tts 生成高质量中文播报语音，存进 captures/voice/，绕开 espeak-ng。

espeak-ng 的中文质量很差（听着像念字母），edge-tts 走微软在线合成，
中文接近真人，音质和 espeak 完全不是一个档次。

用法（任选其一）：

  # A. 直接在 K1 上跑（需要联网，会自动读取 gallery 里的所有人名）
  pip3 install edge-tts miniaudio
  python3 tools/gen_voice.py

  # B. 在电脑上跑，手动指定人名
  python tools/gen_voice.py --names 大王,小李,张三

  # 换个音色 / 换地点
  python3 tools/gen_voice.py --voice zh-CN-YunxiNeural --location 东门

生成的文件名是整句文本的 md5，k1edge/audio.py 的 speak() 会优先播放它们，
命中就完全不用 espeak-ng；没有命中才回退。
"""
import argparse
import asyncio
import hashlib
import os
import sys
import wave

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"      # 女声，清晰；男声可用 zh-CN-YunxiNeural
DEFAULT_POINTS = ["东门主入口", "南门车库", "仓库通道", "办公楼大厅"]
FIXED_TEXTS = [
    "测试播报，发现重点关注人员，请立即核实",
]
FALLBACK_RESOLUTIONS = ["现场处置", "隐蔽跟踪", "请求增援", "误报归档"]


def resolution_names():
    """真实处置名称：以 k1edge/events.py 的 RESOLUTIONS 为准。

    之前这里手写了一份「已处置/已核实放行/通知保安…」，跟界面上真正的
    四个按钮（现场处置/隐蔽跟踪/请求增援/误报归档）完全对不上，
    所以点按钮时语音总是回退到 espeak。现在直接从 events.py 读。
    """
    try:
        from k1edge.events import RESOLUTIONS
        names = [v.get("name") for v in RESOLUTIONS.values() if v.get("name")]
        return names or list(FALLBACK_RESOLUTIONS)
    except Exception:
        return list(FALLBACK_RESOLUTIONS)


def all_locations(cfg, extra=""):
    """所有巡检点：ui.POINTS 优先，读不到就用内置默认，再合并命令行指定的。"""
    locs = []
    try:
        from k1edge.ui import POINTS       # 需要 cv2/numpy，K1 上有；电脑上可能没有
        locs = [n for n, _ in POINTS]
    except Exception:
        locs = list(DEFAULT_POINTS)
    for x in [s.strip() for s in (extra or "").split(",") if s.strip()]:
        if x not in locs:
            locs.append(x)
    cur = cfg.get("location")
    if cur and cur not in locs:
        locs.append(cur)
    return locs


def safe_wav_path(text, voice_dir):
    key = hashlib.md5(text.encode("utf-8")).hexdigest()
    return os.path.join(voice_dir, key + ".wav")


def mp3_to_wav(mp3_bytes, out_path):
    """edge-tts 的 mp3 → 24kHz 单声道 16bit wav（体积小，plughw 会自动重采样）。"""
    import miniaudio
    decoded = miniaudio.decode(mp3_bytes,
                              output_format=miniaudio.SampleFormat.SIGNED16,
                              nchannels=1, sample_rate=24000)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(decoded.samples.tobytes())
    return out_path


async def synth(text, voice, out_path, rate="+8%"):
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate)
    chunks = bytearray()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            chunks.extend(chunk["data"])
    if not chunks:
        return None
    return mp3_to_wav(bytes(chunks), out_path)


def collect_texts(cfg, names, locations):
    from k1edge import audio  # 复用同一套文案，保证 md5 能对上
    texts = list(FIXED_TEXTS)
    # 处置确认语按模板直接构造：resolve_text() 默认返回空串（开关关着），
    # 但这里仍要把音频预生成好，将来打开开关就能直接用。
    for r in resolution_names():
        t = "处置已提交，%s" % r
        if t not in texts:
            texts.append(t)
    # 每个点位 × 每个人名都要有，否则切点位后告警会回退到 espeak（听不清）
    for loc in locations:
        c = dict(cfg)
        c["location"] = loc
        for n in names:
            t = audio.alert_text(c, n)
            if t not in texts:
                texts.append(t)
    return texts


def names_from_gallery():
    try:
        from k1edge import gallery
        people = gallery.scan(os.path.join(HERE, "gallery"))
        return [p.get("name") for p in people if p.get("name")]
    except Exception as e:
        print("  读取底库失败（不影响其它文本）:", e)
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", default="", help="逗号分隔的人名；留空则从 gallery 读")
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--locations", default="", help="逗号分隔的巡检点；留空=用内置的全部点位")
    ap.add_argument("--rate", default="+8%", help="语速，例如 +8%% 或 -5%%")
    args = ap.parse_args()

    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("缺 edge-tts，先装：")
        print("  pip3 install edge-tts miniaudio")
        print("（电脑上： pip install edge-tts miniaudio）")
        return 2
    try:
        import miniaudio  # noqa: F401
    except ImportError:
        print("缺 miniaudio，先装： pip3 install miniaudio")
        return 2

    os.chdir(HERE)
    from k1edge import config
    cfg = config.load(os.path.join(HERE, "config.json"))

    names = [n.strip() for n in args.names.split(",") if n.strip()] or names_from_gallery()
    locs = all_locations(cfg, args.locations)
    voice_dir = os.path.join(cfg.get("captures") or "./captures", "voice")
    os.makedirs(voice_dir, exist_ok=True)

    print("=" * 60)
    print("生成高质量中文播报语音")
    print("=" * 60)
    print("音色：%s   语速：%s" % (args.voice, args.rate))
    print("巡检点（%d 个）：%s" % (len(locs), "、".join(locs)))
    print("人名：%s" % ("、".join(names) if names else "(没有，只生成固定语)"))
    print("输出：%s" % voice_dir)
    print("-" * 60)

    texts = collect_texts(cfg, names, locs)
    print("共 %d 条，其中告警语 %d 条（%d 点位 × %d 人）\n"
          % (len(texts), len(locs) * max(1, len(names)), len(locs), len(names)))
    ok = fail = 0
    for i, t in enumerate(texts, 1):
        out = safe_wav_path(t, voice_dir)
        if os.path.isfile(out) and os.path.getsize(out) > 1000:
            print("[%d/%d] 已存在，跳过：%s" % (i, len(texts), t[:28]))
            ok += 1
            continue
        try:
            r = asyncio.run(synth(t, args.voice, out, args.rate))
        except Exception as e:
            print("[%d/%d] 失败：%s → %s" % (i, len(texts), t[:24], e))
            fail += 1
            continue
        if r:
            size = os.path.getsize(out) // 1024
            print("[%d/%d] OK  %3dKB  %s" % (i, len(texts), size, t[:30]))
            ok += 1
        else:
            print("[%d/%d] 空音频：%s" % (i, len(texts), t[:24]))
            fail += 1

    print("-" * 60)
    print("完成：成功 %d，失败 %d" % (ok, fail))
    print("现在直接跑 python3 tools/speak_test.py，会优先播放这些语音。")
    print("日志里应出现：[speak:外放 via ... · 预生成语音]")
    if fail:
        print("失败的多半是没联网或音色名写错（可用 zh-CN-XiaoxiaoNeural / zh-CN-YunxiNeural）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
