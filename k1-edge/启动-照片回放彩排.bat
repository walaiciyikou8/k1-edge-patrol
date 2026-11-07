@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   K1 手持巡更 - 照片回放彩排（不用真人站镜头前）
echo   把演示照片放进 demo_frames 目录即可
echo   真机识别：需要 models 下的 YuNet/SFace 模型
echo   没有模型会自动降级为 mock，流程一样能跑
echo ================================================
echo.
if not exist demo_frames (
    mkdir demo_frames
    echo [提示] 已创建 demo_frames，请把演示照片放进去后重新双击本文件。
    pause
    exit /b
)
".venv\Scripts\python.exe" -u main.py --real --replay ./demo_frames --replay-hold 4 --port 8088
echo.
echo 程序已退出。
pause
