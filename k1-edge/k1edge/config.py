# -*- coding: utf-8 -*-
"""配置：JSON 文件 + 默认值。板上首次运行会生成 config.json。"""
import json
import os

DEFAULTS = {
    # ---- 设备身份（上报与处置署名都要用）----
    "device_id": "K1S-2601-A01",
    "point_code": "P-01",
    "location": "东门主入口",
    "operator": {"id": "patrol", "name": "王巡逻"},

    # ---- 采集 ----
    "camera": "auto",           # auto=优先 /dev/video50，否则首个 video*，电脑 0；也可写死
    "camera_backend": "auto",   # auto | gstreamer(spacemitsrc) | v4l2
    "camera_json": "",          # spacemitsrc 配置；空=自动找 /tmp/csi3(或 csi1)_camera_auto.json、/root/svivi_cam1.json
    "capture_w": 1920,          # IMX219 原生 1080p，人脸像素更足
    "capture_h": 1080,
    "replay": "",               # 非空=用照片目录代替摄像头（演示/联调）
    "replay_hold": 3.0,         # 每张照片停留秒数
    "replay_shuffle": False,
    "center_crop": 1.0,         # 广角畸变严重时可设 0.75，只检测中心区域
    "detect_every": 3,          # 每 N 帧做一次检测（省 NPU）
    "min_face_px": 90,          # 人脸框小于该像素不识别（防误判：太小的框多半是误检）

    # ---- 识别 ----
    "mock": True,               # True=Haar+灰度向量调试；False=真机（YuNet+SFace）
    "match_thresh": 70.0,       # mock: 灰度向量置信度阈值
    "sim_thresh": 0.72,         # mock: 灰度向量余弦映射阈值
    "gallery": "./gallery",

    # ---- 真机（YuNet + SFace，见 k1edge/vision_real.py）----
    "models_dir": "",           # 空=自动找 ./models、~/.cache/k1edge/models
    "detect_max_w": 480,        # 检测前把画面缩到这个宽度，省算力（K1 上 480 明显更快）
    "yunet_score": 0.75,        # YuNet 置信度阈值（0.6 太松会空环境误检，0.75 更稳）
    "sface_thresh": 0.363,      # SFace 同人余弦阈值（官方推荐 0.363）
    "strict_real": False,       # True=真机后端起不来就报错；False=降级 mock 继续跑

    # ---- 去重 / 冷却（同一人在这段时间内只报一次，避免刷屏）----
    "cooldown_sec": 60,         # 库里的人（含白名单）
    "stranger_cooldown_sec": 20,  # 陌生访客

    # ---- 存档 / 队列 ----
    "captures": "./captures",
    "queue_file": "./captures/_events.jsonl",
    "actions_file": "./captures/_actions.jsonl",
    "capture_keep_days": 3,     # 抓拍保留天数，超期自动清理
    "capture_max_files": 400,   # 抓拍最多保留张数，超量删最旧的
    "stranger_snapshot": True,  # 陌生访客是否落盘（演示建议 true，长期值守可关掉省空间）

    # ---- 播报（演示默认外放；实战用 --quiet 静默）----
    "speak": True,
    "quiet": False,
    "speak_resolve": False,     # 处置确认音：默认关（少一个出错点）；要开先跑 gen_voice.py
    "audio_out": "auto",        # auto=自动挑 aplay -l 里的真实声卡(K1 上是 ES8326/card 1)
                                # 也可写死 "plughw:1,0"；"force:default" 才强制走 ALSA default
    "speaker_volume": 90,       # 每次启动自动解除 ES8326 静音并拉到该音量

    # ---- 麦克风（USB 阵列麦）----
    "mic_device": "auto",       # auto / hw:1,0
    "record_sec": 5,
    "record_ambient": False,    # 没有麦克风时 arecord 会反复报错刷屏；要环境音再开

    # ---- 桥接服务 ----
    "bridge_port": 8088,
    "backend_url": "",          # 非空则额外把事件 POST 到外部后台
}


def load(path=None):
    """读配置；文件不存在时返回默认值（不落盘）。"""
    cfg = json.loads(json.dumps(DEFAULTS))
    if path and os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                user = json.load(f)
            _merge(cfg, user)
            cfg["_source"] = path
        except Exception as e:
            print("[config] 读取失败，使用默认值:", e)
    return cfg


def save(cfg, path):
    clean = {k: v for k, v in cfg.items() if not k.startswith("_")}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    return path


def _merge(base, extra):
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _merge(base[k], v)
        else:
            base[k] = v
    return base


def ensure_dirs(cfg):
    for key in ("captures",):
        d = cfg.get(key)
        if d:
            os.makedirs(d, exist_ok=True)
    for key in ("queue_file", "actions_file"):
        d = os.path.dirname(cfg.get(key) or "")
        if d:
            os.makedirs(d, exist_ok=True)


def summary(cfg):
    return ("设备 {device_id} · 点位 {location}({point_code}) · 模式 {mode} · "
            "桥接 :{port} · 播报 {speak}").format(
        device_id=cfg["device_id"], location=cfg["location"], point_code=cfg["point_code"],
        mode="Mock(本机)" if cfg["mock"] else "真机 YuNet+SFace",
        port=cfg["bridge_port"],
        speak="静默" if (cfg["quiet"] or not cfg["speak"]) else "外放(%s)" % cfg["audio_out"],
    )
