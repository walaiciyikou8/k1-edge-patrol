#!/bin/sh
# ============================================================
# K1 手持巡更 · 一键启动（SpacemiT K1 / MUSE Pi Pro / Bianbu）
# ------------------------------------------------------------
#   sh run-k1.sh                    自动选择显示方式 + 自动选摄像头
#   sh run-k1.sh --real             真机识别（YuNet 检测 + SFace 128 维比对）
#   sh run-k1.sh --real --quiet     实战静默（不外放）
#   sh run-k1.sh --replay ./frames  照片回放彩排（不用真人站镜头前）
#   sh run-k1.sh --serve-only       只跑界面 + 桥接（不接摄像头，联调后台用）
#
# 显示方式自动判定（也可以用 --ui-mode 手动指定 window/fb/web/none）：
#   有 DISPLAY（桌面在跑）      → window（OpenCV 窗口，4.3" 屏原生 800×480）
#   无桌面但有 800×480 的 fb    → fb（直接写 /dev/fbN，不需要 X）
#   其它（只有手机/笔记本可用） → web（手机浏览器打开 /screen）
# ============================================================
cd "$(dirname "$0")" || exit 1

PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || { echo "找不到 $PY，请先装 python3"; exit 1; }

# ---- 有没有指定 --ui-mode --fb ----
WANT_MODE=""
WANT_FB=""
prev=""
for a in "$@"; do
    case "$prev" in
        --ui-mode) WANT_MODE="$a" ;;
        --fb)      WANT_FB="$a" ;;
    esac
    prev="$a"
done

# ---- 自动挑 framebuffer ----
pick_fb() {
    for d in /sys/class/graphics/fb*; do
        [ -d "$d" ] || continue
        vs=$(cat "$d/virtual_size" 2>/dev/null)
        bpp=$(cat "$d/bits_per_pixel" 2>/dev/null)
        if [ "$vs" = "800,480" ] && { [ "$bpp" = "32" ] || [ "$bpp" = "16" ]; }; then
            echo "/dev/$(basename "$d")"
            return 0
        fi
    done
    return 1
}

# ---- 决定显示方式 ----
MODE="$WANT_MODE"
FBARG=""
if [ -z "$MODE" ]; then
    if [ -n "$DISPLAY" ]; then
        MODE="window"
    elif FB=$(pick_fb); then
        MODE="fb"
        FBARG="--fb $FB"
    else
        MODE="web"
    fi
fi
[ -n "$WANT_FB" ] && FBARG="--fb $WANT_FB"
[ "$MODE" = "web" ] && case " $* " in *" --no-browser "*) : ;; *) set -- "$@" --no-browser ;; esac

# ---- 模型与摄像头提示 ----
case " $* " in
    *" --mock "*|*" --real "*) : ;;                       # 用户明确指定了就听用户的
    *)
        if [ -f models/face_recognition_sface_2021dec.onnx ] \
           && [ -f models/face_detection_yunet_2023mar.onnx ]; then
            set -- "$@" --real                            # 模型在 → 默认真机识别
        fi ;;
esac
if [ ! -f models/face_recognition_sface_2021dec.onnx ]; then
    echo "[提示] 真机识别模型还没下载：sh run-k1.sh 只能用 mock；"
    echo "       联网后执行  $PY tools/get_models.py  即可（--real 会自动降级，不会崩）"
fi
if [ ! -d gallery ] || [ -z "$(ls -A gallery 2>/dev/null)" ]; then
    echo "[提示] 人脸库为空：先建 gallery/<分类>/<姓名>/照片.jpg"
fi

echo "============================================================"
echo " 显示方式: $MODE $FBARG"
echo " 启动: $PY main.py $* --ui-mode $MODE $FBARG"
echo "============================================================"
exec "$PY" main.py "$@" --ui-mode "$MODE" $FBARG
