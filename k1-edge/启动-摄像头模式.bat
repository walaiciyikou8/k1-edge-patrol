@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   K1 手持巡更 - 摄像头模式
echo   摄像头 0 = 笔记本自带 / 1 = 外接 USB 摄像头
echo   如需换摄像头：把下面的 0 改成 1
echo ================================================
echo.
".venv\Scripts\python.exe" main.py --mock --camera 0 --port 8088
echo.
echo 程序已退出。
pause
