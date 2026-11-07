#!/bin/sh
# ============================================================
# K1 手持巡更 · 把板子"真实的屏幕"镜像到 VNC（物理屏坏了时的替身）
# ------------------------------------------------------------
# 和 run-k1-vnc.sh 的区别：
#   run-k1-vnc.sh   新建一块虚拟屏(:1)，里面只跑我们的程序 —— 适合纯演示
#   run-k1-mirror.sh 镜像板子正在用的那个桌面(:0) —— 你在 VNC 里看到的就是
#                    "板子屏幕上原本显示的东西"，鼠标点击等同于点板子的屏
#
#   sh run-k1-mirror.sh            # 只镜像现有桌面
#   sh run-k1-mirror.sh --app      # 镜像 + 在 :0 上启动巡更程序
#   DISP=:0 PORT=5900 sh run-k1-mirror.sh
#
# 电脑端：VNC 客户端连 板子IP:5900
# 停止：  pkill x11vnc
# ============================================================
cd "$(dirname "$0")" || exit 1

PY="${PY:-python3}"
DISP="${DISP:-:0}"
PORT="${PORT:-5900}"
NUM=$(echo "$DISP" | tr -d ':')

have() { command -v "$1" >/dev/null 2>&1; }

# ---- 1. 板子的桌面到底是 X11 还是 Wayland？----
WAYLAND=0
WL_USER=""
for u in $(loginctl list-users --no-legend 2>/dev/null | awk '{print $2}'); do
    if loginctl show-user "$u" -p State 2>/dev/null | grep -q "State=active"; then
        WL_USER="$u"
    fi
done
if ps -ef 2>/dev/null | grep -E "labwc|wayfire|sway|gnome-shell" | grep -v grep >/dev/null 2>&1; then
    WAYLAND=1
    echo "[检查] 检测到 Wayland 桌面（labwc/wayfire/sway），x11vnc 无法抓取，需要 wayvnc"
    [ -z "$WL_USER" ] && WL_USER=$(ps -eo user,args 2>/dev/null | awk '/labwc|wayfire|sway|gnome-shell/ && !/awk/ {print $1; exit}')
    [ -z "$WL_USER" ] && WL_USER=initer
    WL_UID=$(id -u "$WL_USER" 2>/dev/null)
    XDG_RUN="/run/user/${WL_UID}"
    WL_DISP=$(ls "$XDG_RUN" 2>/dev/null | grep '^wayland-' | head -1)
    [ -z "$WL_DISP" ] && WL_DISP="wayland-0"
    echo "        桌面用户: $WL_USER (uid $WL_UID)   XDG_RUNTIME_DIR=$XDG_RUN   显示: $WL_DISP"
fi

if [ "$WAYLAND" = "0" ] && [ ! -S "/tmp/.X11-unix/X$NUM" ]; then
    echo
    echo "既没找到 $DISP（X11），也没找到 Wayland 桌面。下面看一下当前状态："
    echo "------------------------------------------------------------"
    ps -ef 2>/dev/null | grep -E "Xorg|Xwayland|labwc|wayfire|sway|gnome-shell" | grep -v grep
    loginctl list-sessions 2>/dev/null
    echo "------------------------------------------------------------"
    cat <<'EOF'
桌面上什么都没在跑的话，用 run-k1-vnc.sh 建一块虚拟屏跑我们的程序即可。
EOF
    exit 1
fi

# ---- 2. wayvnc 分支（Wayland）----
if [ "$WAYLAND" = "1" ]; then
    if ! have wayvnc; then
        cat <<EOF
[缺少 wayvnc] 板子联网后执行：

    apt update
    apt install -y wayvnc

装完再跑一次本脚本。
EOF
        exit 1
    fi
    if pgrep -f "wayvnc" >/dev/null 2>&1; then
        echo "[vnc] wayvnc 已在运行，复用"
    else
        echo "[vnc] 启动 wayvnc 镜像 Wayland 桌面 → 端口 $PORT"
        runuser -u "$WL_USER" -- env XDG_RUNTIME_DIR="$XDG_RUN" WAYLAND_DISPLAY="$WL_DISP" \
            wayvnc 0.0.0.0 "$PORT" >/tmp/wayvnc.log 2>&1 &
        sleep 3
        if pgrep -f wayvnc >/dev/null 2>&1; then
            echo "      OK"
        else
            echo "      ✗ wayvnc 起不来，日志如下："
            sed 's/^/      /' /tmp/wayvnc.log | tail -15
            cat <<'EOF'

      wayvnc 报 “does not support” 之类的协议错误时，说明这个合成器不支持截屏协议。
      那就改用 X11 虚拟屏方案（不需要镜像桌面）：
          sh run-k1-vnc.sh            # 虚拟屏 800×480，只跑巡更程序，端口 5901
      或者直接用网页屏：
          python3 main.py --real --ui-mode web --no-browser   # 浏览器开 http://板子IP:8088/screen
EOF
            exit 1
        fi
    fi

    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$IP" ] && IP="<板子IP>"
    echo "============================================================"
    echo " 已镜像 Wayland 桌面 → $IP:$PORT   （用户 $WL_USER）"
    echo " 日志：/tmp/wayvnc.log      停止：pkill wayvnc"
    echo " 提示：wayvnc 的鼠标/键盘需要合成器支持虚拟输入协议，"
    echo "       若只能看不能点，用 run-k1-vnc.sh 的虚拟屏方案（能点）。"
    echo "============================================================"

    case " $* " in
        *" --app "*)
            echo "[app] 在 $DISP 上启动巡更程序（会作为 Wayland 窗口出现在 VNC 里）"
            ARGS=$(echo "$*" | sed 's/--app//g')
            case " $ARGS " in
                *" --mock "*|*" --real "*) : ;;
                *) [ -f models/face_recognition_sface_2021dec.onnx ] && ARGS="$ARGS --real" ;;
            esac
            runuser -u "$WL_USER" -- env XDG_RUNTIME_DIR="$XDG_RUN" WAYLAND_DISPLAY="$WL_DISP" DISPLAY="$DISP" \
                "$PY" main.py $ARGS --ui-mode window
            ;;
    esac
    exit 0
fi

# ---- 3. x11vnc 在不在 ----
if ! have x11vnc; then
    cat <<EOF
[缺少 x11vnc] 板子联网后执行：

    apt update
    apt install -y x11vnc

装完再跑一次本脚本。
EOF
    exit 1
fi

# ---- 3. 起 x11vnc 镜像 :0 ----
if pgrep -f "x11vnc -display $DISP" >/dev/null 2>&1; then
    echo "[vnc] 已经在镜像 $DISP，复用"
else
    echo "[vnc] 开始镜像 $DISP → 端口 $PORT"
    x11vnc -display "$DISP" -auth guess -forever -shared -repeat \
           -rfbport "$PORT" -noxdamage -bg -o /tmp/x11vnc.log 2>&1 | sed 's/^/      /'
    sleep 1
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="<板子IP>"

echo "============================================================"
echo " 已镜像板子真实桌面 $DISP  →  $IP:$PORT"
echo " 电脑端 VNC 客户端连上面的地址，看到的就是板子屏幕的内容"
echo " 日志：/tmp/x11vnc.log      停止：pkill x11vnc"
echo "============================================================"

# ---- 4. 可选：在 :0 上启动巡更程序 ----
case " $* " in
    *" --app "*)
        echo "[app] 在 $DISP 上启动巡更程序（界面会出现在 VNC 里）"
        case " $* " in
            *" --mock "*|*" --real "*) ARGS="$*" ;;
            *) if [ -f models/face_recognition_sface_2021dec.onnx ]; then
                   ARGS="$* --real"
               else
                   ARGS="$* --mock"
               fi ;;
        esac
        ARGS=$(echo "$ARGS" | sed 's/--app//g')
        DISPLAY="$DISP" "$PY" main.py $ARGS --ui-mode window
        ;;
esac
