# K1 手持巡更 · 端侧程序

巡逻员手持 MUSE Pi Pro（SpacemiT K1），随身摄像头做人脸识别，命中布控人员时
**抓拍 + 录 5 秒环境音 + 外放提示 + 上报后台**，巡逻员在 4.3" LCD 上核对照片并选择处置，
处置人与通道回传后台。

> 旧的单文件脚本 `../k1_patrol.py` 保留作参考，新实现按四层拆分在 `k1edge/`。

## 目录

```
main.py              启动入口（参数见下）
k1edge/
├── config.py        配置（首次运行自动生成 config.json）
├── gallery.py       人脸库扫描（gallery/<分类>/<人名>/）
├── vision.py        检测 + 识别（Mock 与 SpacemiT NPU 同接口）
├── audio.py         环境音录制（USB 麦）+ 播报（3.5mm 喇叭）
├── events.py        事件模型 · 冷却 · JSONL 落盘队列 · 处置指令队列
├── bridge.py        本地 HTTP 桥接（纯标准库）
├── ui.py            LCD 三态界面（OpenCV + PIL 中文）
└── pipeline.py      主循环编排
tools/selftest.py    无摄像头全链路自检
```

## 安装

**笔记本（Windows）**：项目里已带 `.venv`（含 numpy / opencv / Pillow），双击 `启动-LCD网页屏.bat` 即可，不需要自己装 Python 或 pip。
若要重建环境：

```bat
"C://Users//<你>//.workbuddy//binaries//python//versions//3.13.12//python.exe" -m venv .venv
.venv\Scripts\python.exe -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple "opencv-python-headless<5" numpy pillow
```

**板上（Bianbu OS，Debian 系）**：

```bash
sudo apt install -y python3-opencv python3-numpy alsa-utils fonts-noto-cjk
# 桥接服务只用标准库，无需 pip 安装；TTS 用板子自带的 tts_file_demo
```

> 注意 `opencv-python` 要 **< 5**：5.x 移除了 `cv2.CascadeClassifier`（Haar 检测器）。

## 运行

**板上一条命令**（自动选显示方式、自动选摄像头）：

```bash
sh run-k1.sh --real          # 真机识别；--replay ./frames 彩排；--quiet 静默
sh run-k1-vnc.sh             # 没有显示器：TigerVNC 虚拟屏 800×480，电脑连 板子IP:5901
```

Windows 上直接双击 `启动-LCD网页屏.bat`（不接摄像头，最快看到界面）或 `启动-摄像头模式.bat`。

命令行等价写法：

```bash
python main.py --init-config          # 生成 config.json
python main.py --list-audio           # 查看麦克风设备（USB 阵列麦）
python main.py --list-fb              # 查看 framebuffer（板端直写屏用）
python main.py --mock --serve-only    # 只跑 LCD + 桥接（自动打开浏览器屏）
python main.py --mock --camera 0      # 笔记本摄像头
python main.py --real --camera /dev/video0 --gallery ./gallery   # 真机识别
python main.py --real --quiet         # 实战静默：不播报，只上报
python main.py --real --replay ./demo_frames --replay-hold 4     # 照片回放彩排
python tools/selftest.py              # 无摄像头全链路自检
python tools/get_models.py            # 下载真机模型（YuNet + SFace）
python tools/real_check.py            # 离线验证检测+比对
python tools/fb_test.py               # 逐块 fb 亮屏诊断
```

### LCD 四种显示方式（`--ui-mode`）

| 取值 | 说明 |
|---|---|
| `auto`（默认） | 有 GUI 的 opencv 用窗口；否则若存在 800×480 的 fb 就直写 fb，再否则网页屏 |
| `window` | OpenCV 窗口（需要 X/Wayland 桌面） |
| `web` | **浏览器屏**：`http://127.0.0.1:8088/screen`，可用鼠标/触摸直接点击 |
| `fb` | **直写 framebuffer**：`--fb /dev/fb1`，不依赖 X/桌面/GUI 库，裸系统也能亮屏 |
| `none` | 不显示界面，只跑逻辑 |

> 浏览器屏是零依赖方案：画面每 250ms 刷新一张 JPEG，点击坐标回传到 `/api/k1/click`，
> 板子上用 Chromium kiosk 指向这个地址即可当 LCD 用。
>
> fb 模式用于"板上没有桌面/X 起不来"的场合：`python3 main.py --mock --serve-only --ui-mode fb`。
> 先用 `python3 tools/fb_test.py` 判断哪块 `/dev/fbN` 是小屏，再用 `--fb` 指定；
> `python3 main.py --list-fb` 可列出全部 framebuffer。

## 人脸库

```
gallery/
├── suspect/张伟/  a.jpg b.jpg meta.json    ← 重点关注（布控）
├── staff/陈立/    1.jpg                   ← 内部员工（正常通行）
└── vip/郑思远/    1.jpg                   ← 访客白名单
```

`meta.json` 可选：`{"code": "F-1001", "level": 3, "note": "西侧围栏破坏"}`。
平铺目录 `gallery/张三/` 视为 `suspect`。

## 三类分流

| 类别 | 行为 |
|---|---|
| suspect 重点关注 | 抓拍 + 环境音 + 播报 + 上报，LCD 右上角亮小点 |
| staff / vip | 只抓拍 + 上报，**不播报、不亮灯** |
| unknown 陌生人 | 抓拍 + 上报（陌生访客），不播报 |

同一人冷却 `cooldown_sec`（默认 8 秒）内不重复告警，陌生人为 `stranger_cooldown_sec`。

## LCD 三态

| 状态 | 显示 |
|---|---|
| 待机 IDLE | 时间 / 日期 / 点位 / “巡更中”，无摄像头预览、无红框、无安防字样 |
| 命中 HIT | 维持中性，仅右上角一个橙色小点 |
| 调阅 DETAIL | 巡逻员点击后显示抓拍图、相似度、累计命中、四个处置按钮 |

触摸屏在 X11 下映射为鼠标事件，`cv2.setMouseCallback` 直接接收点击；
中文用 PIL 绘制（`cv2.putText` 不支持中文）。

## 与后台对接

桥接服务默认 `0.0.0.0:8088`，接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/k1/health` | 健康检查 + 事件统计 |
| GET | `/api/k1/events?since=<ms>` | 后台轮询拉事件 |
| POST | `/api/k1/events` | 上报事件（也可外部脚本模拟） |
| POST | `/api/k1/resolve` | 后台处置写回 → 自动给端侧下发播报动作 |
| GET | `/api/k1/actions` | 端侧领取待执行动作 |
| GET | `/api/k1/watchlist` | 布控名单 |
| GET | `/screen` | **LCD 网页屏**（浏览器打开即可操作） |
| GET | `/api/k1/screen.jpg` | 当前 LCD 画面（JPEG 帧） |
| POST | `/api/k1/click` | 网页屏点击回传（`{x,y}`，按 800×480 坐标） |
| GET | `/captures/<file>` | 抓拍图 / 环境音 |

演示时手机连 K1 热点打开后台网页即可看到事件；端侧处置（LCD）记为 `source=device`，
后台处置记为 `source=console`，处置人取各自登录账号。

## 硬件对接要点

| 项 | 说明 |
|---|---|
| 摄像头 | **IMX219（MIPI CSI）**，经 `cam-test` 识别后生成虚拟相机 `/dev/video50`；取流走 `spacemitsrc`（NV12 非连续平面，v4l2src 会报错）——本项目 `--camera /dev/video50 --camera-backend gstreamer` 已内置该管线，默认 1920×1080 |
| NPU | SpaceMiT ONNXRuntime（`python3-spacemit-ort`，provider `SpaceMITExecutionProvider`），依赖 `/dev/tcm`（需 udev 规则 `KERNEL=="tcm" GROUP="plugdev" MODE="0660"`）；本项目 YuNet+SFace 走 OpenCV DNN（CPU 已够用），`npu_status()` 会探测 NPU/`/dev/tcm` 状态 |
| 触摸屏 | 4.3" 800×480 MIPI DSI，X11 下即鼠标；窗口全屏用 `WND_PROP_FULLSCREEN` |
| 喇叭 | 3.5mm 音频口输出，`aplay` 默认设备即是；演示直接外放，`--quiet` 可静默 |
| 麦克风 | USB-A 阵列麦，`arecord -l` 枚举，自动优先 USB 设备，录 16k/mono/5s WAV |
| 帧率 | 每 3 帧检测一次（`detect_every`），人脸框 < 60px 不识别 |

## 真机识别后端（YuNet + SFace）

`k1edge/vision_real.py` 是**已实现可跑**的真机后端，只用 opencv-python ≥4.5.4 自带的
`cv2.FaceDetectorYN_create` + `cv2.FaceRecognizerSF_create`，不需要 opencv-contrib、不需要 NPU SDK：

| 环节 | 模型 | 大小 | 说明 |
|---|---|---|---|
| 检测 | `face_detection_yunet_2023mar.onnx` | 227 KB | 输出框 + 5 点关键点 |
| 识别 | `face_recognition_sface_2021dec.onnx` | ~37 MB | 关键点对齐到 112×112，128 维特征，余弦比对 |

```bash
python3 tools/get_models.py            # 下载模型到 ./models（带断点续传）
python3 tools/real_check.py            # 不接摄像头，离线验证检测+比对
python3 main.py --real --camera /dev/video0
```

- 同人余弦阈值 `sface_thresh=0.363`（官方推荐），低于即判"陌生访客"；
- 检测前把画面缩到 `detect_max_w=640`，K1 的 8 核 CPU 即可跑到可用帧率；
- 装了 onnxruntime + SpaceMiT EP 时启动日志会提示 `检测到 NPU provider`，没有也不影响；
- 模型缺失时 `--real` **自动降级为 mock** 继续跑（不中断演示），想强制报错就设 `strict_real=true`。

Mock 模式（Haar + 32×32 灰度余弦）只用于跑通逻辑，精度交给真机后端。

## 真机 NPU（yolov5-face + arcface，可选）

如果比赛要求明确写"用 NPU"，可按 SpaceMiT 官方 `spacemit-demo` 的
`components/model_zoo/vision/examples/yolov5_face/python/` 示例，把 `vision.build()` 里
真机分支换成 NPU 版本即可，接口保持 `det.detect()` / `det.detect_ex()` / `rec.match(frame, box, landmarks)`；
现有 `YuNetDetector` / `SFaceRecognizer` 可作为精度与速度的对照基线。
