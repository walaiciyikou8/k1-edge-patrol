#!/bin/sh
# ============================================================
# K1 手持巡更 · 无显示器方案（TigerVNC 虚拟屏，只跑我们的界面）
# ------------------------------------------------------------
# 显示器坏了 / 没有屏也能跑：用 TigerVNC 的 Xvnc 开一个 800×480 虚拟屏，
# 虚拟屏里**只运行巡更程序**（不启动 LXQt 桌面，避免抢资源、也避免桌面自身的问题），
# 电脑端用 VNC 客户端连上看，就是 4.3" 屏原本该显示的画面。
#
#   sh run-k1-vnc.sh                    # 虚拟屏 + 自动摄像头/模型，真机识别
#   sh run-k1-vnc.sh --replay ./frames  # 照片回放彩排
#   sh run-k1-vnc.sh --desktop          # 万一是要完整桌面（不推荐，这版镜像桌面不稳）
#   VNCPASS=abc123 sh run-k1-vnc.sh     # 指定 VNC 密码（默认 k1patrol）
#
# 电脑端：VNC 客户端连  板子IP:5901
# 停止：  vncserver -kill :1
# ============================================================
cd "$(dirname "$0")" || exit 1

PY="${PY:-python3}"
GEOM="${GEOM:-800x480}"
DEPTH="${DEPTH:-24}"
DSP="${DSP:-:1}"
PORT="${PORT:-5901}"
VNCPASS="${VNCPASS:-k1patrol}"
LOG="/tmp/k1-vnc-app.log"
NUM=$(echo "$DSP" | tr -d ':')

have() { command -v "$1" >/dev/null 2>&1; }

# ---- 依赖检查 ----
if ! have vncserver && ! have Xvnc; then
    cat <<EOF
[缺少 TigerVNC 服务端] 板子联网后执行：

    apt update
    apt install -y tigervnc-standalone-server tigervnc-common

装完再跑一次本脚本。板子没网时用 riscv64 的 .deb 离线装。
EOF
    exit 1
fi

# ---- --desktop 选项（要完整桌面时用）----
DESKTOP=0
ARGS=""
for a in "$@"; do
    if [ "$a" = "--desktop" ]; then DESKTOP=1; else ARGS="$ARGS $a"; fi
done

# ---- 模型在就自动 --real ----
case " $ARGS " in
    *" --mock "*|*" --real "*) : ;;
    *) [ -f models/face_recognition_sface_2021dec.onnx ] && ARGS="$ARGS --real" ;;
esac

# ---- 准备 VNC 密码 ----
mkdir -p "$HOME/.vnc"
if [ ! -f "$HOME/.vnc/passwd" ] && have vncpasswd; then
    printf '%s\n' "$VNCPASS" | vncpasswd -f > "$HOME/.vnc/passwd" 2>/dev/null
    chmod 600 "$HOME/.vnc/passwd"
    echo "[vnc] 已生成 VNC 密码：$VNCPASS"
fi

# ---- 写 xstartup：虚拟屏里到底跑什么 ----
APP_DIR=$(pwd)
if [ "$DESKTOP" = "1" ]; then
    cat > "$HOME/.vnc/xstartup" <<EOF
#!/bin/sh
unset SESSION_MANAGER
[ -r \$HOME/.Xresources ] && xrdb \$HOME/.Xresources
exec startlxqt
EOF
    echo "[vnc] xstartup = 完整 LXQt 桌面（不推荐）"
else
    cat > "$HOME/.vnc/xstartup" <<EOF
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
cd "$APP_DIR" || exit 1
exec $PY main.py$ARGS --ui-mode window
EOF
    echo "[vnc] xstartup = 只跑巡更程序：$PY main.py$ARGS --ui-mode window"
fi
chmod +x "$HOME/.vnc/xstartup"

# ---- 重启虚拟屏（旧的先杀掉，避免还挂在旧桌面上）----
if have vncserver; then
    if vncserver -list 2>/dev/null | grep -q "^$DSP"; then
        echo "[vnc] 关掉旧的 $DSP 会话"
        vncserver -kill "$DSP" >/dev/null 2>&1
        sleep 1
    fi
    echo "[vnc] 启动虚拟屏 $DSP  ${GEOM}x${DEPTH}  端口 $PORT"
    vncserver "$DSP" -geometry "$GEOM" -depth "$DEPTH" -rfbport "$PORT" -localhost no 2>&1 | sed 's/^/      /'
else
    Xvnc "$DSP" -geometry "$GEOM" -depth "$DEPTH" -rfbport "$PORT" -AlwaysShared \
         -rfbauth "$HOME/.vnc/passwd" -xstartup "$HOME/.vnc/xstartup" >/tmp/xvnc.log 2>&1 &
    sleep 2
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="<板子IP>"

echo "============================================================"
echo " 虚拟屏 $DSP  ${GEOM}    VNC 端口 $PORT"
echo " 电脑端连：  $IP:$PORT     密码：$VNCPASS"
if [ "$DESKTOP" != "1" ]; then
    echo " 虚拟屏里只有巡更界面（无桌面）。"
fi
echo " 停止：vncserver -kill $DSP"
echo "============================================================"
