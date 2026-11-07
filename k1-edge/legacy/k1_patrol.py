#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
k1_patrol.py —— K1 边缘端人脸巡检主程序（SpacemiT K1 / Bianbu OS）
================================================================
巡检闭环：摄像头取流 → 人脸检测(NPU) → 识别(arcface/NPU) → 本地人脸库(嫌疑人库)比对
        → 命中 → 抓拍(时间_地点_人名.jpg) → 扬声器TTS提醒 → 屏幕弹图
              → 照片传华为云OBS + 告警JSON推后台值班端

两种运行模式：
  --mock          本机用 OpenCV+LBPH 跑通整套逻辑（无 K1 / 无 SDK 也能演示、调试）
  (默认, 不带--mock)  调用 spacemit_vision 真 NPU 推理（需在 K1 上、已装 AI SDK）

本机 dry-run 示例（笔记本摄像头，gallery 下放嫌疑人照片，每人一个子目录）：
  pip install opencv-contrib-python numpy requests
  python3 k1_patrol.py --mock --camera 0 --gallery ./gallery --location 北门

K1 板上运行示例：
  python3 k1_patrol.py --camera /dev/video0 --location 北门 \
      --backend-url http://192.168.1.100:8899/api/alert
"""
import argparse, os, sys, time, json, datetime, threading
import cv2, numpy as np

# ---------- 1. 配置 ----------
DEFAULTS = dict(
    camera_index=0,            # mock 用 0/1；真机用 /dev/video0
    gallery="./gallery",       # 嫌疑人人脸库目录（每人一个子目录，目录名=人名）
    location="默认点位",        # 巡检点名称，写入文件名与告警
    detect_thresh=0.6,         # 人脸检测/识别相似度阈值（arcface 余弦相似度默认 0.6）
    backend_url="",            # 后台桥接服务告警接口，空则不上传后台
    obs=None,                  # OBS 配置 dict，空则不上传云
    save_dir="./captures",     # 本地时间轴抓拍目录
    mock=False,
)

# ---------- 2. 人脸库（gallery）加载 ----------
def load_gallery(gallery_dir):
    """读取 gallery。支持两种布局：
        gallery/<分类>/<人名>/  （分类 = suspect 黑名单 / staff 白名单 / vip 访客）
        gallery/<人名>/          （默认视作 suspect 布控人员）
    返回 {label: {'name','cat','samples'}}，并训练 LBPH（mock 用）。"""
    people = {}
    if not os.path.isdir(gallery_dir):
        print(f"[warn] 人脸库目录不存在: {gallery_dir}")
        return people
    label = 0
    for top in sorted(os.listdir(gallery_dir)):
        tp = os.path.join(gallery_dir, top)
        if not os.path.isdir(tp):
            continue
        if top in ('suspect', 'staff', 'vip'):
            cat = top
            for name in sorted(os.listdir(tp)):
                pp = os.path.join(tp, name)
                if not os.path.isdir(pp):
                    continue
                samples = [cv2.imread(os.path.join(pp, f), cv2.IMREAD_GRAYSCALE) for f in os.listdir(pp)]
                samples = [s for s in samples if s is not None]
                if samples:
                    people[label] = {"name": name, "cat": cat, "samples": samples}
                    label += 1
        else:
            name = top
            samples = [cv2.imread(os.path.join(tp, f), cv2.IMREAD_GRAYSCALE) for f in os.listdir(tp)]
            samples = [s for s in samples if s is not None]
            if samples:
                people[label] = {"name": name, "cat": "suspect", "samples": samples}
                label += 1
    print(f"[gallery] 载入 {len(people)} 人: " +
          ", ".join(f"{v['name']}({v['cat']})" for v in people.values()))
    return people

class MockRecognizer:
    """本机 mock 识别：Haar 检测 + LBPH 识别，不依赖 NPU，用于 dry-run。"""
    def __init__(self, gallery):
        self.det = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        self.people = gallery
        self.labels, self.faces = [], []
        for lab, v in gallery.items():
            for s in v["samples"]:
                self.labels.append(lab); self.faces.append(s)
        if self.faces:
            self.rec = cv2.face.LBPHFaceRecognizer_create()
            self.rec.train(self.faces, np.array(self.labels))
        else:
            self.rec = None

    def detect(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        boxes = self.det.detectMultiScale(gray, 1.2, 4, minSize=(60, 60))
        return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in boxes]

    def recognize(self, face_gray):
        if self.rec is None:
            return None, "unknown", 0.0
        lab, conf = self.rec.predict(face_gray)        # conf 越小越像
        if conf < 70 and lab in self.people:
            p = self.people[lab]
            return p["name"], p["cat"], max(0.0, 1 - conf / 100)
        return None, "unknown", 0.0   # 未匹配人脸库 → 陌生人

class SpacemitRecognizer:
    """真机 NPU 识别适配位（按官方 spacemit_vision 文档填）。
    参考：spacemit-demo/components/model_zoo/vision/examples/{yolov5-face,arcface}/python/*.py
    官方模型路径默认 ~/.cache/models/vision/{yolov5-face,arcface}/。"""
    def __init__(self, gallery):
        from spacemit_vision import VisionServiceNative
        self.vs = VisionServiceNative()
        # TODO: 按官方示例初始化检测/识别模型，加载 gallery 图片算 512 维特征向量
        # self.det_model = self.vs.load_model("yolov5-face", ...)
        # self.rec_model = self.vs.load_model("arcface", ...)
        # self.gallery_vecs = {name: self.extract(img) for ...}
        self.gallery = gallery
        print("[spacemit] 请按官方示例实现 detect/recognize 的 NPU 调用")

    def detect(self, frame):
        # TODO: 调用 yolov5-face 返回人脸框
        raise NotImplementedError("实现 SpacemiT 检测调用")

    def recognize(self, face_crop):
        # TODO: 调用 arcface 提 512 维特征，与 gallery_vecs 余弦比对，返回 (name, score)
        raise NotImplementedError("实现 SpacemiT 识别调用")

# ---------- 3. 抓取/展示/播报/上传 ----------
def capture_source(use_mock, cam):
    if use_mock:
        cap = cv2.VideoCapture(int(cam) if str(cam).isdigit() else cam)
    else:
        # K1 上优先用 GStreamer 硬解（OpenCV 直接 v4l2 也行，但 GStreamer 更稳）
        cap = cv2.VideoCapture(
            "v4l2src device=/dev/video0 ! video/x-raw,width=640,height=480 ! "
            "videoconvert ! appsink", cv2.CAP_GSTREAMER)
    if not cap.isOpened():
        raise SystemExit(f"[error] 打不开摄像头: {cam}")
    return cap

def tts(text, use_mock):
    """扬声器播报。本机 mock 用 espeak/pyttsx3；K1 用 spacemit_tts。"""
    try:
        if use_mock:
            os.system(f'powershell -c "(New-Object -ComObject SAPI.SpVoice).Speak('
                      f'\\\"{text}\\\")" >nul 2>&1' if os.name == "nt"
                      else f'espeak "{text}" >/dev/null 2>&1')
        else:
            # K1: tts_file_demo -p "文本" -l matcha:zh
            os.system(f'tts_file_demo -p "{text}" -l matcha:zh >/dev/null 2>&1')
    except Exception as e:
        print("[tts] 失败:", e)

def upload_obs(path, obs_cfg):
    """华为云 OBS 上传（SigV4），依赖 huaweicloudsdkobs。失败不影响主流程。"""
    if not obs_cfg:
        return
    try:
        from huaweicloudsdkobs import ObsClient
        ak, sk, bucket, endpoint = obs_cfg["ak"], obs_cfg["sk"], obs_cfg["bucket"], obs_cfg["endpoint"]
        client = ObsClient(access_key_id=ak, secret_access_key=sk, server=endpoint)
        key = obs_cfg.get("prefix", "k1-patrol/") + os.path.basename(path)
        client.putFile(bucket, key, path)
        print(f"[obs] 上传成功: {key}")
    except Exception as e:
        print("[obs] 上传失败(忽略):", e)

def push_alert(backend_url, payload):
    """把告警(时间/地点/人名/分数/照片URL)推给后台桥接服务。"""
    if not backend_url:
        return
    try:
        import requests
        requests.post(backend_url, json=payload, timeout=5)
        print(f"[alert] 已推后台: {payload['name']} @ {payload['location']}")
    except Exception as e:
        print("[alert] 推送失败(忽略):", e)

# ---------- 4. 主循环 ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true", help="本机 dry-run（OpenCV，无需 K1）")
    ap.add_argument("--camera", default="0")
    ap.add_argument("--gallery", default=DEFAULTS["gallery"])
    ap.add_argument("--location", default=DEFAULTS["location"])
    ap.add_argument("--backend-url", default="")
    ap.add_argument("--save-dir", default=DEFAULTS["save_dir"])
    args = ap.parse_args()

    os.makedirs(args.save_dir, exist_ok=True)
    gallery = load_gallery(args.gallery)
    rec = MockRecognizer(gallery) if args.mock else SpacemitRecognizer(gallery)
    cap = capture_source(args.mock, args.camera)

    last_alert = {}      # 同名冷却，避免同一人连续刷屏
    print(">>> 巡检开始，按 q 退出。命中嫌疑人会自动抓拍+播报+上传。")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        for (x, y, w, h) in rec.detect(frame):
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            face = cv2.cvtColor(frame[y:y + h, x:x + w], cv2.COLOR_BGR2GRAY)
            name, cat, score = rec.recognize(face)
            if name:
                cv2.putText(frame, f"{name} {cat} {score:.2f}", (x, y - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                cool = time.time() - last_alert.get(name, 0)
                if cool > 8:                  # 同名 8 秒内只报一次
                    last_alert[name] = time.time()
                    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    fname = f"{ts}_{args.location}_{name}.jpg"
                    fpath = os.path.join(args.save_dir, fname)
                    cv2.imwrite(fpath, frame)
                    if cat == "suspect":
                        # 重点关注（黑名单）→ 危险告警：扬声器播报 + 上云 + 推后台
                        tts(f"警告，发现嫌疑人{name}", args.mock)
                        push_alert(args.backend_url, {"kind": "alert", "time": ts, "location": args.location,
                                    "name": name, "cat": cat, "score": round(score, 3), "photo": fname})
                        upload_obs(fpath, DEFAULTS["obs"])
                        print(f"[ALERT] 危险告警抓拍: {fname}")
                    else:
                        # staff / vip 白名单 → 正常通行，不告警（可记录）
                        print(f"[PASS] 白名单识别: {name} ({cat}) 正常通行")
                        push_alert(args.backend_url, {"kind": "pass", "time": ts, "location": args.location,
                                    "name": name, "cat": cat, "score": round(score, 3), "photo": fname})
            else:
                # 陌生人（未匹配人脸库）→ 抓拍记录，不告警
                cool = time.time() - last_alert.get("__stranger__", 0)
                if cool > 15:
                    last_alert["__stranger__"] = time.time()
                    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    fname = f"{ts}_{args.location}_陌生人.jpg"
                    fpath = os.path.join(args.save_dir, fname)
                    cv2.imwrite(fpath, frame)
                    print(f"[STRANGER] 陌生访客抓拍: {fname}")
                    push_alert(args.backend_url, {"kind": "stranger", "time": ts, "location": args.location,
                                "name": "陌生访客", "cat": "unknown", "score": 0.0, "photo": fname})
        cv2.imshow("K1 巡检 - 巡逻人员屏", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release(); cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
