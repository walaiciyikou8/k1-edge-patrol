#!/usr/bin/env python3
"""演示前一体检：摄像头 / 模型 / 底库 / 语音包 / 音频输出 / 桥接端口，一次看清还缺什么。

    python3 tools/preflight.py            # 体检（会试播一声）
    python3 tools/preflight.py --no-play  # 只检查，不发声

重点看「语音包」那一节：底库里每个人都要有对应的预生成 wav，
否则告警时会回退到 espeak-ng（中文会念成乱码一样的声音）。
缺了就补：python3 tools/gen_voice.py
"""
import glob
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from k1edge import audio, config  # noqa: E402

ROWS = []


def add(name, ok, detail, required=True):
    ROWS.append((name, ok, required, detail))


def _locations(cfg):
    """所有巡检点，用于逐个检查告警语音是否就绪。"""
    locs = []
    try:
        from k1edge.ui import POINTS
        locs = [n for n, _ in POINTS]
    except Exception:
        locs = ["东门主入口", "南门车库", "仓库通道", "办公楼大厅"]
    cur = cfg.get("location")
    if cur and cur not in locs:
        locs.append(cur)
    return locs


def main():
    os.chdir(HERE)
    no_play = "--no-play" in sys.argv
    cfg = config.load(os.path.join(HERE, "config.json"))
    print("=" * 64)
    print("演示前体检")
    print("=" * 64)

    # ---- 摄像头 ----
    devs = sorted(glob.glob("/dev/video*"))
    add("摄像头节点", bool(devs), ", ".join(devs[:4]) or "无 /dev/video*", required=False)
    add("MIPI 虚拟相机 /dev/video50", "/dev/video50" in devs,
        "存在" if "/dev/video50" in devs else "缺失（先 cam-test 生成）", required=False)
    js = "/usr/share/camera_json/csi3_camera_auto.json"
    add("spacemitsrc 配置", os.path.isfile(js),
        js if os.path.isfile(js) else "缺失，摄像头可能起不来", required=False)

    # ---- 模型 ----
    models = os.path.join(HERE, "models")
    need = ["face_detection_yunet_2022mar.onnx", "face_recognition_sface_2021dec.onnx",
            "face_detection_yunet_2023mar.onnx"]
    have = [f for f in need if os.path.isfile(os.path.join(models, f))]
    add("识别模型", len(have) >= 2, "有 %d 个：%s" % (len(have), ", ".join(have[:2])))

    # ---- 底库 + 语音包 ----
    names, cats = [], {}
    try:
        from k1edge import gallery
        people = gallery.scan(os.path.join(HERE, "gallery"))
        for p in people:
            n = p.get("name")
            if n:
                names.append(n)
                cats[p.get("cat") or "?"] = cats.get(p.get("cat") or "?", 0) + 1
    except Exception as e:
        add("底库", False, "读取失败：%s" % e)
    add("底库人数", bool(names),
        "%d 人（%s）" % (len(names), "，".join("%s %d" % kv for kv in cats.items()))
        if names else "0 人 → 后台上传人脸后会自动同步")

    missing_voice = []
    total_voice = 0
    if names:
        for loc in _locations(cfg):
            c = dict(cfg)
            c["location"] = loc
            for n in names:
                total_voice += 1
                if not audio._pregenerated(audio.alert_text(c, n), cfg):
                    missing_voice.append("%s/%s" % (loc, n))
        add("告警语音包", not missing_voice,
            "全部就绪（%d 条 = %d 点位 × %d 人）" % (
                total_voice, len(_locations(cfg)), len(names))
            if not missing_voice else
            "缺 %d/%d 条：%s → python3 tools/gen_voice.py" % (
                len(missing_voice), total_voice, "、".join(missing_voice[:4])),
            required=False)
    fix_ok = audio._pregenerated("测试播报，发现重点关注人员，请立即核实", cfg)
    add("固定语音包", bool(fix_ok), "已就绪" if fix_ok else "缺 → python3 tools/gen_voice.py",
        required=False)

    # ---- 音频输出 ----
    cards = audio.list_playback_devices()
    dev, card, _ = audio.detect_output(cfg)
    add("播放设备", bool(cards),
        "%s（card %s：%s）" % (dev, card, cards[0][2][:46]) if cards else "没识别到声卡")
    sink, is_bt = audio.detect_pulse_sink()
    if sink:
        add("PulseAudio sink", True, "%s%s" % (sink[:52], "（蓝牙）" if is_bt else ""),
            required=False)

    # ---- 桥接 ----
    import socket
    port = int(cfg.get("bridge_port") or 8088)
    s = socket.socket()
    s.settimeout(0.6)
    busy = s.connect_ex(("127.0.0.1", port)) == 0
    s.close()
    add("桥接端口 %d" % port, True,
        "已在监听（程序可能已在跑）" if busy else "空闲（启动 go.sh 后会占用）", required=False)
    add("go.sh", os.path.isfile(os.path.join(HERE, "go.sh")), "存在" if os.path.isfile(
        os.path.join(HERE, "go.sh")) else "缺失")

    # ---- 试播 ----
    if not no_play and cards:
        print("\n试播一声（应该听到清晰的中文）…")
        audio.speak("测试播报，发现重点关注人员，请立即核实", cfg, force=True)

    # ---- 汇总 ----
    print("\n" + "-" * 64)
    for name, ok, required, detail in ROWS:
        mark = "OK  " if ok else ("WARN" if not required else "FAIL")
        print("  [%-4s] %-18s %s" % (mark, name, detail))
    fails = [n for n, ok, r, _ in ROWS if r and not ok]
    warns = [n for n, ok, r, _ in ROWS if not r and not ok]
    print("-" * 64)
    if fails:
        print("必须项未通过：%s" % "、".join(fails))
    if warns:
        print("建议处理：%s" % "、".join(warns))
    if not fails and not warns:
        print("全部就绪，可以开始演示： sh go.sh")
    elif not fails:
        print("关键项都过了，可以直接演示： sh go.sh")
    print("=" * 64)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
