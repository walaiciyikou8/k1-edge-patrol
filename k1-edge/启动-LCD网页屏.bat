@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   K1 手持巡更 - LCD 网页屏模式（不接摄像头）
echo   LCD 画面会在浏览器里打开，可直接点击操作
echo   关闭本窗口 = 退出程序
echo ================================================
echo.
".venv\Scripts\python.exe" main.py --mock --serve-only --port 8088
echo.
echo 程序已退出。
pause
