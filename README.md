# 基于 RISC-V（SpacemiT K1）的边缘智能人脸巡更系统

一套「端侧识别、云端存储、后台归档」的边缘人脸巡更系统。K1 手持终端通过 MIPI 摄像头实时采集，在板内完成 YuNet 人脸检测与 SFace 特征比对；命中底库后即时抓拍、语音提醒巡逻员，并把结构化事件与抓拍图同步到后台管理平台。

## 特性

- **端侧闭环**：识别与告警全部在板内完成，现场视频流不出设备，低延时、省带宽、保护隐私
- **断网可用**：事件写入本地 JSONL 队列，网络恢复后自动补传
- **端云协同**：人脸照片存于华为云 OBS，后台负责人脸库、告警中心、处置与时间轴归档
- **可交互巡更屏**：实时预览、待查看记录、四类处置、多巡检点切换
- **开箱即用语音**：预生成高质量中文告警语音，按文本 MD5 命中播放，绕开开源 TTS 中文可懂度问题
- **弱算力优化**：缩略图缓存、静止画面 JPEG 签名缓存、MJPEG 自适应降频、点击热区原子发布
- **可复现**：附环境自检、自测套件、匹配诊断、演示前体检与部署脚本

## 目录结构

```
k1-edge/                    端侧工程（部署到 K1 板 ~/k1-edge）
  main.py / go.sh           入口与启动脚本
  config.json               集中配置（点位、采集、检测、冷却、播报、端口）
  k1edge/                   camera / pipeline / vision_real / ui / bridge / audio
                            events / gallery / config 等模块
  tools/                    selftest / check_env / match_check / speak_test
                            usb_audio_check / gen_voice / preflight / voice_ab
  models/                   YuNet 2022mar、SFace 2021dec（ONNX）
  gallery/                  人脸底库（运行时由后台下发，仓库只保留空目录）
  captures/voice/           预生成中文告警语音（wav）
  README.md / 板端运行.md    端侧使用说明
web/                        后台管理平台
  dist/index.html           可直接双击打开的单文件成品（无需构建）
  src/                      可编辑源码（HTML / JS / CSS）
  build.py                  构建脚本
  generate_html.py / template.html / smoke_test.js   生成器与自检
docs/                       说明材料（如适用）
LICENSE                     MIT 许可
```

## 快速开始

### 后台管理平台

直接用浏览器打开 `web/dist/index.html` 即可，无需服务器、无需安装依赖。在页面里配置 K1 的桥接地址（默认 `http://<K1-IP>:8088`），即可管理人脸库、查看告警、执行处置与浏览时间轴。

需要修改源码时编辑 `web/src/`，再运行 `python web/build.py` 重新生成单文件版本。

### K1 端

环境：Bianbu Linux、Python 3、OpenCV 4.6 兼容运行时、GStreamer（spacemitsrc 插件）、espeak-ng、alsa-utils。

```bash
# 1. 生成摄像头配置（确认 IMX219 探测成功）
sudo cam-test

# 2. 部署工程并自检
cp -r k1-edge ~/k1-edge
cd ~/k1-edge
python3 tools/check_env.py
python3 tools/selftest.py

# 3. 生成各点位与人员的告警语音（需联网，可选）
pip3 install edge-tts miniaudio
python3 tools/gen_voice.py --names 大王

# 4. 演示前体检
python3 tools/preflight.py

# 5. 启动巡逻
sh go.sh
```

浏览器打开 `http://<K1-IP>:8088/screen` 查看巡更屏。

## 完整链路复现

1. 后台上传人脸照片 → 自动下发到 `k1-edge/gallery/` 并热重载底库
2. 启动巡逻，巡更屏显示实时画面
3. 登记人员正对镜头 → 终端出现 `[ALERT]`，生成 `时间_地点_人名.jpg` 抓拍并语音播报
4. 在巡更屏点开记录、选择处置方式 → 结果回传后台
5. 后台告警中心查看抓拍图与事件详情，时间轴显示状态流转
6. 切换巡检点后重复，验证地点随动

## 模型与数据说明

- `models/` 内为 OpenCV Zoo 公开的 YuNet 与 SFace ONNX 模型，随仓库提供以便评委直接复现；SFace 约 37 MB。
- `models/fixtures/lena.jpg`、`messi5.jpg` 为 OpenCV 通用测试图，仅用于图像管线自测，不属于人脸底库。
- 仓库**不包含**任何真实人脸底库照片、运行时抓拍图、账户密钥或本机路径。华为云 AK/SK 由使用者在后台界面中自行填写，不写入代码或配置。
- 预生成语音由 `tools/gen_voice.py` 通过 edge-tts 生成，新增人员或点位后重跑该脚本补齐即可。

## 主要配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `capture_w` / `capture_h` | 1920 × 1080 | 采集分辨率 |
| `detect_max_w` | 480 | 检测前缩放宽度 |
| `detect_every` | 3 | 隔帧检测 |
| `yunet_score` | 0.75 | 检测置信度阈值 |
| `min_face_px` | 90 | 最小人脸像素 |
| `sface_thresh` | 0.363 | 同人余弦阈值 |
| `cooldown_sec` | 60 | 同人告警冷却 |
| `bridge_port` | 8088 | 端侧 HTTP 桥接端口 |
| `speak_resolve` | false | 处置确认音开关 |

## 性能与测试

详见方案书第七章。要点：自测套件 36/36 通过；开发环境对照实测抓拍缩略图缓存 13.1 ms → 0.06 ms、静止界面编码 38.7 ms → 0.01 ms、并发点击 300/300 命中。上述计时为开发环境相对量级，K1 板上绝对值更高但未做毫秒级基准，故不作板上绝对数值声明。

## 许可

MIT License。模型文件遵循其原始发布许可。

> 本项目为 RISC-V 高水平创新方向 · 高校赛道参赛作品。
