# -*- coding: utf-8 -*-
"""K1 边缘端巡检应用（手持版）。

分层：
    config   配置
    gallery  本地人脸库
    vision   检测 / 识别（Mock 与 SpacemiT NPU 同接口）
    audio    环境音录制 + 播报
    events   事件模型 + 冷却 + 断网落盘队列 + 处置指令队列
    bridge   本地 HTTP 桥接（零依赖，stdlib）
    ui       LCD 三态界面（OpenCV）
    pipeline 主循环编排
"""
__version__ = "1.0.0"
