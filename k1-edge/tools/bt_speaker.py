#!/usr/bin/env python3
"""K1 蓝牙音箱配对 / 路由 / 试听 —— 没有 3.5mm 孔时的唯一外放通道。

    python3 tools/bt_speaker.py              体检 + 扫描附近蓝牙设备（列编号）
    python3 tools/bt_speaker.py connect 1    配对上第 1 个设备并设成默认输出 + 试听
    python3 tools/bt_speaker.py connect 蓝牙音箱   按名字连（不用数编号，推荐）
    python3 tools/bt_speaker.py connect AA:BB:CC:DD:EE:FF   直接指定 MAC
    python3 tools/bt_speaker.py test         只播测试音
    python3 tools/bt_speaker.py status       看已配对/已连接设备和 PulseAudio sink

音箱必须先进入配对模式：长按电源或蓝牙键 3~5 秒，蓝灯快闪（有的会语音提示）。
"""
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from k1edge import audio  # noqa: E402

ANSI = re.compile(r"\x1b\[[0-9;]*m")
DEV_RE = re.compile(r"Device\s+([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\s+(.*)")
BAR = "=" * 60


def clean(s):
    return ANSI.sub("", s or "")


def bt(lines, timeout=45):
    """非交互跑一串 bluetoothctl 命令。"""
    script = "\n".join(list(lines) + ["quit"]) + "\n"
    try:
        p = subprocess.run(["bluetoothctl"], input=script.encode(),
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           timeout=timeout)
        return clean(p.stdout.decode("utf-8", "replace"))
    except Exception as e:
        return str(e)


def mac_of_bluez(name):
    """bluez_sink.00_11_22_33_44_55.a2dp_sink → 00:11:22:33:44:55"""
    m = re.search(r"([0-9A-Fa-f]{2}(?:_[0-9A-Fa-f]{2}){5})", name or "")
    return m.group(1).replace("_", ":").upper() if m else ""


def _scan_pty(seconds=12):
    """用伪终端(pty)跑一次交互式扫描 —— 等价于人手敲 bluetoothctl，最可靠。

    为什么非得这样：
      · `timeout 12 bluetoothctl scan on` → 非交互时 scan on 下完进程就退出，只扫零点几秒
      · `bluetoothctl --timeout 12 scan on` → 实测在 Bianbu 这版 bluez 上对 scan on 无效，同样秒退
      · Popen + stdin 管道 → 输出读不回来
    pty 让 bluetoothctl 以为自己连着真终端，会老老实实保持扫描 N 秒，
    输出也全部可读。Linux 专用；不可用时返回 None 由调用方降级。
    """
    try:
        import pty
        import select
    except ImportError:
        return None
    try:
        master, slave = pty.openpty()
    except Exception:
        return None
    out = bytearray()

    def drain(wait):
        end = time.time() + wait
        while time.time() < end:
            try:
                r, _, _ = select.select([master], [], [], 0.3)
            except Exception:
                return
            if not r:
                continue
            try:
                chunk = os.read(master, 4096)
            except OSError:
                return
            if not chunk:
                return
            out.extend(chunk)

    def send(s):
        try:
            os.write(master, s.encode())
        except Exception:
            pass

    try:
        p = subprocess.Popen(["bluetoothctl"], stdin=slave, stdout=slave,
                             stderr=slave, close_fds=True)
    except Exception:
        try:
            os.close(master)
            os.close(slave)
        except Exception:
            pass
        return None
    os.close(slave)
    try:
        send("power on\n")
        drain(0.8)
        send("scan on\n")
        drain(seconds)                 # ← 这里真的停满 N 秒
        send("scan off\n")
        drain(0.5)
        send("quit\n")
        drain(0.5)
    finally:
        try:
            p.kill()
        except Exception:
            pass
        try:
            os.close(master)
        except Exception:
            pass
    return clean(out.decode("utf-8", "replace")).replace("\r", "")


def _scan_once(seconds=12):
    """触发一次真正持续 N 秒的扫描，返回原始输出。"""
    raw = _scan_pty(seconds)
    if raw is not None:
        return raw
    # 非 Linux / pty 不可用时的降级路径（可能只扫零点几秒，仅作兜底）
    outs = []
    rc, out = audio._run(["bluetoothctl", "--timeout", str(int(seconds)), "scan", "on"],
                         timeout=int(seconds) + 12)
    outs.append(out or "")
    low = (out or "").lower()
    if rc != 0 or "invalid" in low or "unknown option" in low or "usage:" in low:
        rc2, out2 = audio._run(["timeout", str(int(seconds)), "bluetoothctl", "scan", "on"],
                               timeout=int(seconds) + 12)
        outs.append(out2 or "")
    return "\n".join(outs)


def scan(seconds=12):
    """扫描附近设备，返回 [(mac, name)]。"""
    print("正在扫描 %d 秒…（音箱请保持在配对模式，蓝灯快闪，请稍等）" % seconds)
    t0 = time.time()
    raw = _scan_once(seconds)
    used = time.time() - t0
    print(" 扫描结束（实际用时 %.1f 秒）" % used)
    if used < max(3.0, seconds * 0.6):
        print(" ⚠ 用时明显不足 %d 秒，扫描可能没有真正执行（pty 不可用？）" % seconds)
    if "no default controller" in raw.lower():
        print("  ⚠ bluetoothctl 报：No default controller available（没有蓝牙硬件）")
        return []
    found = {}
    for line in raw.splitlines():
        m = DEV_RE.search(line)
        if m and m.group(2).strip():
            found[m.group(1).upper()] = m.group(2).strip()
    # 兜底：bluetoothctl devices 会列出本次会话发现过的全部设备，
    # 防止扫描输出解析漏掉（有些版本只在 devices 里留记录）
    extra = bt(["devices"], timeout=20)
    for line in extra.splitlines():
        m = DEV_RE.search(line)
        if m and m.group(2).strip():
            found.setdefault(m.group(1).upper(), m.group(2).strip())
    if not found:
        print("  如果音箱明明开着却一直扫不到，手工确认一次（最直观）：")
        print("    bluetoothctl")
        print("    > power on")
        print("    > scan on        ← 停 15 秒，看有没有 [NEW] Device xx:xx...")
        print("    > quit")
    return sorted(found.items())


def controllers():
    """返回 [(mac, name)]。为空 = 这块板子没有可用的蓝牙适配器。

    ⚠ 注意：systemctl is-active bluetooth = active 只说明「服务」在跑，
    不代表硬件存在。没适配器时 scan 会报 'No default controller available'。
    """
    out = bt(["list"], timeout=15)
    rows = []
    for line in out.splitlines():
        m = re.match(r"Controller\s+([0-9A-Fa-f:]{17})\s+(.*)", line)
        if m:
            rows.append((m.group(1).upper(), m.group(2).strip()))
    return rows


def require_controller(verbose=True):
    """有适配器返回 True；没有则打印排查指引并返回 False。"""
    ctrls = controllers()
    if ctrls:
        if verbose:
            print("蓝牙适配器：%s" % ", ".join("%s (%s)" % c for c in ctrls))
        return True
    if verbose:
        print(BAR)
        print("⚠ 没检测到蓝牙适配器（Controller）")
        print("   == systemctl is-active bluetooth 只表示服务在跑，不代表有硬件 ==")
        print("   自查一下（很短）：")
        print("     rfkill list bluetooth")
        print("     ls /sys/class/bluetooth")
        print("     hciconfig -a        # 可能没装：sudo apt install -y bluez")
        print("   三种情况：")
        print("   1) ls /sys/class/bluetooth 是空的 → 板子确实没蓝牙硬件")
        print("      → 插一个 USB 蓝牙 dongle（内核一般自带 btusb 驱动），或换 3.5mm 音箱")
        print("   2) 有 hci0 但被 rfkill 挡住 → sudo rfkill unblock bluetooth")
        print("   3) 有 hci0 但没上电 → sudo hciconfig hci0 up")
        print(BAR)
    return False


def known_devices():
    """bluetoothctl devices + info，返回 [(mac, name, paired, connected)]。"""
    out = bt(["devices"], timeout=20)
    macs = []
    for line in out.splitlines():
        m = DEV_RE.search(line)
        if m:
            macs.append((m.group(1).upper(), m.group(2).strip() or "(无名)"))
    rows = []
    for mac, name in macs:
        info = bt(["info %s" % mac], timeout=20)
        paired = re.search(r"Paired:\s*yes", info) is not None
        conn = re.search(r"Connected:\s*yes", info) is not None
        rows.append((mac, name, paired, conn))
    return rows


def find_by_name(kw):
    """按名字关键字找设备：先查已知设备，再扫描。返回 (mac, name) 或 (None, None)。

    国产蓝牙音箱默认名常见：蓝牙音箱 / BT-Speaker / Bluetooth Speaker / 10052 / M10 …
    """
    kw = (kw or "").lower()
    if not kw:
        return None, None
    for mac, name, _p, _c in known_devices():
        if kw in name.lower():
            return mac, name
    for mac, name in scan():
        if kw in name.lower():
            return mac, name
    return None, None


def pulse_sinks():
    rc, out = audio._run(["pactl", "list", "short", "sinks"], timeout=8)
    return [l.split("\t")[1] for l in out.splitlines()
            if len(l.split("\t")) > 1] if rc == 0 else []


def route_to_bluetooth(mac, wait=4):
    """让 PulseAudio 认到蓝牙音箱并设为默认输出。返回 sink 名或 None。"""
    # bluez5 发现模块（已加载会报错，忽略）
    audio._run(["pactl", "load-module", "module-bluez5-discover"], timeout=8)
    want = "bluez_sink." + mac.replace(":", "_").lower()
    sink = None
    for _ in range(int(wait * 2)):
        for s in pulse_sinks():
            if s.lower().startswith(want) or "bluez_sink" in s.lower():
                sink = s
                break
        if sink:
            break
        time.sleep(0.5)
    if not sink:
        # 有些镜像要先切 A2DP profile 才出 sink
        rc, out = audio._run(["pactl", "list", "short", "cards"], timeout=8)
        for line in (out or "").splitlines():
            f = line.split("\t")
            if len(f) > 1 and "bluez_card" in f[1].lower():
                audio._run(["pactl", "set-card-profile", f[1], "a2dp-sink"], timeout=8)
                break
        time.sleep(1.5)
        for s in pulse_sinks():
            if "bluez_sink" in s.lower():
                sink = s
                break
    if sink:
        audio._run(["pactl", "set-default-sink", sink], timeout=6)
        audio._run(["pactl", "set-sink-mute", sink, "0"], timeout=6)
        audio._run(["pactl", "set-sink-volume", sink, "90%"], timeout=6)
    return sink


def cmd_status():
    print(BAR)
    print("蓝牙服务：", end="")
    rc, out = audio._run(["systemctl", "is-active", "bluetooth"], timeout=6)
    print((out or "").strip() or "未知")
    require_controller()
    rows = known_devices()
    print("\n已知设备（配对/连接状态）：")
    if not rows:
        print("  (没有已知设备，先跑一次 scan)")
    for mac, name, paired, conn in rows:
        print("  %-18s %-26s paired=%-3s connected=%s"
              % (mac, name[:26], "yes" if paired else "no", "yes" if conn else "no"))
    sinks = pulse_sinks()
    print("\nPulseAudio 输出（sinks）：")
    print("\n".join("  " + s for s in sinks) if sinks else "  (无)")
    bt_sinks = [s for s in sinks if "bluez" in s.lower()]
    if bt_sinks:
        print("\n→ 蓝牙输出已就绪：%s" % bt_sinks[0])
        print("  试听： python3 tools/bt_speaker.py test")
    else:
        print("\n→ 还没有蓝牙输出。若下面显示 connected=yes，")
        print("  再跑： python3 tools/bt_speaker.py connect <上面的 MAC>")
    print(BAR)


def cmd_scan():
    if not require_controller():
        return []
    rows = scan()
    print("\n附近发现的设备：")
    if not rows:
        print("  (什么都没扫到)")
        print("  · 确认音箱处于配对模式（指示灯快闪）")
        print("  · 确认音箱没连在手机上（先断掉手机的连接）")
        print("  · 再跑一次本命令，或延长扫描：python3 tools/bt_speaker.py scan 25")
        return []
    for i, (mac, name) in enumerate(rows, 1):
        print("  [%d] %-18s %s" % (i, mac, name))
    print("\n连第几个就填几： python3 tools/bt_speaker.py connect 1")
    return rows


def cmd_connect(target):
    if not require_controller():
        return 1
    target = (target or "").strip()
    mac, name = "", ""
    if re.fullmatch(r"[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}", target):
        mac = target.upper()
    elif re.fullmatch(r"\d+", target):
        rows = scan()
        idx = int(target) - 1
        if idx < 0 or idx >= len(rows):
            print("编号超出范围（只扫到 %d 个设备）" % len(rows))
            return 1
        mac, name = rows[idx]
    else:
        print("按名字查找「%s」…" % target)
        mac, name = find_by_name(target)
        if not mac:
            print("没找到名字里含「%s」的设备。" % target)
            print("先跑一次扫描看完整清单： python3 tools/bt_speaker.py")
            print("然后把清单里疑似音箱的那行名字/编号告诉我。")
            return 1
    print(BAR)
    print("目标设备：%s %s" % (mac, name))

    print("\n[1/4] 打开适配器并注册 agent")
    out = bt(["power on", "agent on", "default-agent"], timeout=20)
    print("   " + ("ok" if "Failed" not in out else out.strip()[:120]))

    print("[2/4] 配对")
    out = bt(["pair %s" % mac], timeout=60)
    if "Failed" in out and "AlreadyExists" not in out:
        print("   " + out.strip()[:200])
        print("   → 失败常见原因：音箱已被手机占着 / 没进配对模式 / 距离太远")
    else:
        print("   ok")

    print("[3/4] 信任 + 连接")
    out = bt(["trust %s" % mac], timeout=20)
    out = bt(["connect %s" % mac], timeout=60)
    if "Failed" in out:
        print("   " + out.strip()[:200])
    else:
        print("   ok")

    print("[4/4] 交给 PulseAudio 做默认输出")
    sink = route_to_bluetooth(mac)
    if sink:
        print("   sink = %s" % sink)
    else:
        print("   ⚠ 没拿到 bluez sink。先跑 status 看看连接状态：")
        print("     python3 tools/bt_speaker.py status")
        print("     若 connected=yes 但仍无 sink，手打一次：")
        print("     sudo apt install -y pulseaudio-module-bluetooth && pactl load-module module-bluez5-discover")

    print(BAR)
    if sink:
        print("现在试听（应该从音箱出声）：")
        return cmd_test()
    return 1


def cmd_test():
    beep = os.path.join(HERE, "captures", "_beep_bt.wav")
    audio.make_beep(beep, freq=880, seconds=1.2)
    sink, is_bt = audio.detect_pulse_sink()
    print("蓝牙 sink：%s" % (sink if is_bt else "(未就绪，将回退到板载 ALSA)"))
    if is_bt:
        d = audio._play_pulse(beep, sink)
        if d:
            print("✅ 已送到蓝牙音箱（%s）" % d)
            print("   听到声音 = 链路打通。之后跑 tools/speak_test.py 和 sh go.sh 即可。")
            return 0
        print("❌ PulseAudio 播放失败，看上面的报错")
        return 1
    print("当前没有蓝牙 sink，用板载声卡试一下：")
    d, _ = audio._play_wav(beep, "auto")
    print("结果：", d or "失败")
    return 0 if d else 1


def main():
    os.chdir(HERE)
    sub = (sys.argv[1] if len(sys.argv) > 1 else "scan").lower()
    if sub == "scan":
        if len(sys.argv) > 2 and sys.argv[2].isdigit():
            rows = []
            print(BAR)
            print("扫描 %s 秒" % sys.argv[2])
            rows = scan(int(sys.argv[2]))
            for i, (mac, name) in enumerate(rows, 1):
                print("  [%d] %-18s %s" % (i, mac, name))
            if not rows:
                print("  (没扫到设备)")
            print(BAR)
            return 0
        print(BAR)
        print("K1 蓝牙音箱配对")
        print(BAR)
        cmd_scan()
        return 0
    if sub == "status":
        cmd_status()
        return 0
    if sub == "connect":
        if len(sys.argv) < 3:
            print("用法：python3 tools/bt_speaker.py connect 1")
            print("   或：python3 tools/bt_speaker.py connect 蓝牙音箱")
            print("   或：python3 tools/bt_speaker.py connect AA:BB:CC:DD:EE:FF")
            return 2
        return cmd_connect(sys.argv[2])
    if sub == "test":
        return cmd_test()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
