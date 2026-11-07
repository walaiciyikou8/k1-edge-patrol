#!/bin/sh
# K1 one-click launcher.
# OpenCV native windows are unusable on this image (QT renders garbage), so we
# run the bridge with the web screen and show it in a fullscreen (kiosk) browser.
cd "$(dirname "$0")"

export QT_QPA_PLATFORM=xcb
export LIBGL_ALWAYS_SOFTWARE=1

if [ ! -f cam_config.json ]; then
    echo "[go] first run: probing camera config ..."
    if ! python3 tools/capture_test.py --quiet; then
        echo "[go] probe failed. Try: sudo sh go.sh"
        exit 1
    fi
    sleep 2
fi

# stop any leftover instance holding port 8088
pkill -f "main.py --real" 2>/dev/null
sleep 1

echo "[go] starting patrol bridge (web screen)..."
python3 main.py --real \
    --camera /dev/video50 \
    --camera-backend gstreamer \
    --camera-json "$PWD/cam_config.json" \
    --ui-mode web \
    --no-browser &
BRIDGE=$!

sleep 2

URL="http://127.0.0.1:8088/screen"
BROWSER=""
for b in firefox firefox-esr chromium chromium-browser epiphany-browser epiphany falkon midori; do
    if command -v "$b" >/dev/null 2>&1; then BROWSER="$b"; break; fi
done

if [ -z "$BROWSER" ]; then
    echo "[go] board has no browser. Install one first:"
    echo "        sudo apt install -y firefox-esr"
    echo "[go] bridge is running anyway: $URL"
    wait $BRIDGE
    exit 0
fi

echo "[go] opening browser window: $BROWSER  ->  $URL"
echo "[go] 关闭窗口：点标题栏的 X，或在窗口里按 Alt+F4；全屏/还原按 F11"
case "$BROWSER" in
    # 普通窗口模式（有标题栏和 × 关闭按钮）；需要全屏时在窗口里按 F11
    firefox*)  "$BROWSER" --new-window "$URL" ;;
    chromium*) "$BROWSER" --ozone-platform=x11 --app="$URL" --window-size=820,540 \
                           --noerrdialogs --no-first-run --disable-gpu --disable-extensions ;;
    *)         "$BROWSER" "$URL" ;;
esac

# browser closed -> stop the bridge too
kill $BRIDGE 2>/dev/null
