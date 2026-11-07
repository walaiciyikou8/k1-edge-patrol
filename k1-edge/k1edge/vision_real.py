# -*- coding: utf-8 -*-
"""真机人脸后端：OpenCV YuNet（检测）+ SFace（识别/比对）。

只用 opencv-python ≥ 4.5.4 自带的 objdetect 接口，**不需要 opencv-contrib**：

    cv2.FaceDetectorYN_create   人脸检测，输出框 + 5 点关键点
    cv2.FaceRecognizerSF_create 关键点对齐（112×112）+ 128 维特征

为什么用这两个模型：
  * 体积小（检测 232 KB / 识别 37 MB），K1 的 8 核 CPU 就能跑到可用帧率，
    不用等 NPU 的图编译流程也能把整条链路跑通；
  * 检测带关键点 → 识别做仿射对齐，侧脸/低头比 Haar+灰度向量稳得多；
  * 板上装了 onnxruntime + SpacemiT EP 时，OpenCV DNN 之外还可以切 NPU 后端
    （见文末 `npu_status()`，本模块不强制依赖）。

接口与 mock 后端完全一致：
    det.detect(frame)                      -> [(x, y, w, h), ...]
    det.detect_ex(frame)                   -> [((x,y,w,h), landmarks 5×2), ...]
    rec.match(frame, box, landmarks=None)  -> {ok, name, cat, code, level, score}
    rec.add_person(person)                 -> 新加了几张模板
"""
import os

import numpy as np

try:
    import cv2
except Exception:                                    # pragma: no cover
    cv2 = None

from . import vision as _v

MODEL_YUNET = "face_detection_yunet_2023mar.onnx"
MODEL_YUNET_2022 = "face_detection_yunet_2022mar.onnx"   # OpenCV 4.5.4~4.7 用这版
MODEL_SFACE = "face_recognition_sface_2021dec.onnx"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# SFace 官方建议阈值：同人余弦 ≥ 0.363（LFW 上 99.6% 准确率附近）
SFACE_THRESH = 0.363


def _cv_version():
    try:
        parts = cv2.__version__.split(".")
        return int(parts[0]), int(parts[1])
    except Exception:
        return 0, 0


def pick_yunet(model_dir=None):
    """按 OpenCV 版本挑 YuNet 模型。

    face_detection_yunet_**2023mar** 依赖较新的 ONNX 算子，OpenCV < 4.8 会报
    “Layer with requested id=-1 not found”，此时退回 2022mar（4.5.4 即可用）。
    返回找到的模型文件名（优先 2023，旧版优先 2022）。
    """
    maj, minv = _cv_version()
    prefer = [MODEL_YUNET, MODEL_YUNET_2022] if (maj, minv) >= (4, 8) \
        else [MODEL_YUNET_2022, MODEL_YUNET]
    for fname in prefer:
        if find_model(fname, model_dir):
            return fname
    return MODEL_YUNET


def find_model(fname, model_dir=None):
    """在几个常见位置找模型文件，找不到返回 None。"""
    cands = []
    if model_dir:
        cands.append(model_dir)
    cands += [os.path.join(ROOT, "models"),
              os.path.join(os.getcwd(), "models"),
              os.path.expanduser("~/.cache/k1edge/models"),
              os.path.expanduser("~/.cache/models/vision")]
    for d in cands:
        p = os.path.join(d, fname)
        if os.path.isfile(p) and os.path.getsize(p) > 1024:
            return p
    return None


def models_ready(model_dir=None):
    return bool(find_model(pick_yunet(model_dir), model_dir)) and bool(find_model(MODEL_SFACE, model_dir))


def _missing_msg(model_dir=None):
    return ("[vision] 真机模型缺失：需要 YuNet（%s / %s）和 %s\n"
            "  一条命令下载：python3 tools/get_models.py%s\n"
            "  或手工把 opencv_zoo 的这几个 onnx 放到 models/ 目录"
            % (MODEL_YUNET, MODEL_YUNET_2022, MODEL_SFACE,
               ("  --dir %s" % model_dir) if model_dir else ""))


def _miss(score=0.0):
    return {"ok": False, "name": "", "cat": "unknown", "code": "", "level": 0,
            "score": round(float(score), 3)}


# ------------------------------------------------------------------ 检测
class YuNetDetector:
    """YuNet 人脸检测。宽画面先缩到 max_w 再检测，框和关键点等比还原。"""

    def __init__(self, model_path=None, model_dir=None, max_w=640,
                 score_thresh=0.6, nms_thresh=0.3, min_face_px=40):
        if cv2 is None:
            raise SystemExit("[vision] 缺少 opencv-python")
        if not hasattr(cv2, "FaceDetectorYN_create"):
            raise SystemExit("[vision] 这个 opencv 版本没有 FaceDetectorYN，"
                             "需要 ≥4.5.4（pip install -U opencv-python）")
        self.max_w = int(max_w or 640)
        self.min_px = int(min_face_px or 40)
        self._score = float(score_thresh)
        self._nms = float(nms_thresh)

        # 候选模型：优先按版本挑，失败时依次试下一个（兼容 OpenCV 4.6 的老算子差异）
        cand_names = [pick_yunet(model_dir)]
        cand_names.append(MODEL_YUNET_2022 if cand_names[0] == MODEL_YUNET else MODEL_YUNET)
        self._cands = []
        if model_path:
            self._cands.append(model_path)
        else:
            for n in cand_names:
                p = find_model(n, model_dir)
                if p and p not in self._cands:
                    self._cands.append(p)
        if not self._cands:
            raise SystemExit(_missing_msg(model_dir))

        self.det = None
        self.model_path = None
        self.last = []                 # 最近一次 detect_ex 的结果，方便外部取关键点
        self._load_next()

    def _load_next(self):
        """逐个候选模型建 FaceDetectorYN，并用一张空帧真跑一次验证可用性。"""
        while self._cands:
            p = self._cands.pop(0)
            try:
                d = cv2.FaceDetectorYN_create(p, "", (320, 320),
                                              self._score, self._nms, 5000)
                probe = np.zeros((320, 320, 3), dtype=np.uint8)
                d.setInputSize((320, 320))
                d.detect(probe)        # 老模型在新 opencv 上会在这一步抛 id=-1
                self.det = d
                self.model_path = p
                print("[vision] 检测模型: %s" % os.path.basename(p))
                return
            except Exception as e:
                print("[vision] 检测模型 %s 不可用（%s），换下一个…"
                      % (os.path.basename(p), e))
        raise SystemExit("[vision] 手头的 YuNet 模型都跑不起来（OpenCV 版本不匹配）。")

    def detect_ex(self, frame):
        h, w = frame.shape[:2]
        scale = min(1.0, self.max_w / float(w)) if w else 1.0
        img = frame if scale >= 0.999 else cv2.resize(
            frame, (max(1, int(w * scale)), max(1, int(h * scale))),
            interpolation=cv2.INTER_AREA)
        ih, iw = img.shape[:2]
        try:
            self.det.setInputSize((iw, ih))
            _, faces = self.det.detect(img)
        except Exception as e:
            print("[vision] YuNet 推理失败:", e)
            if self._cands:                       # 换下一个模型重试一次
                self._load_next()
                return self.detect_ex(frame)
            faces = None
        out = []
        if faces is not None:
            inv = 1.0 / scale if scale else 1.0
            for f in faces:
                x, y, bw, bh = [float(v) * inv for v in f[:4]]
                if bw < 1 or bh < 1:
                    continue
                lm = np.array(f[4:14], dtype=np.float32).reshape(5, 2) * inv
                out.append(((int(x), int(y), int(bw), int(bh)), lm))
        self.last = out
        return out

    def detect(self, frame):
        return [b for b, _ in self.detect_ex(frame)]


# ------------------------------------------------------------------ 识别
class SFaceRecognizer:
    """SFace 128 维特征 + 余弦比对；模板来自人脸库目录里的照片。"""

    def __init__(self, people, sim_thresh=SFACE_THRESH, model_path=None,
                 model_dir=None, detector=None):
        if cv2 is None:
            raise SystemExit("[vision] 缺少 opencv-python")
        if not hasattr(cv2, "FaceRecognizerSF_create"):
            raise SystemExit("[vision] 这个 opencv 版本没有 FaceRecognizerSF，需要 ≥4.5.4")
        self.model_path = model_path or find_model(MODEL_SFACE, model_dir)
        if not self.model_path:
            raise SystemExit(_missing_msg(model_dir))
        self.rec = cv2.FaceRecognizerSF_create(self.model_path, "")
        self.thresh = float(sim_thresh or SFACE_THRESH)
        self.detector = detector        # 注册模板时用同一套检测，保证口径一致
        self.index = []                 # [(normalized_vec, person)]
        self.people = []
        for p in people:
            self.add_person(p)

    # ---------------- 特征 ----------------
    @staticmethod
    def _row(box, landmarks=None):
        """拼成 SFace 需要的 15 维 [x,y,w,h,5×(x,y)]。

        没有关键点时用五点人脸的平均比例合成（SFace 内部会仿射到 112×112，
        合成点足够用；有真关键点时精度更高）。
        """
        x, y, w, h = [float(v) for v in box]
        if landmarks is None:
            lm = np.array([[x + 0.30 * w, y + 0.38 * h],
                           [x + 0.70 * w, y + 0.38 * h],
                           [x + 0.50 * w, y + 0.58 * h],
                           [x + 0.36 * w, y + 0.76 * h],
                           [x + 0.64 * w, y + 0.76 * h]], dtype=np.float32)
        else:
            lm = np.asarray(landmarks, dtype=np.float32).reshape(5, 2)
        return np.concatenate([[x, y, w, h], lm.ravel()]).astype(np.float32)

    def feature(self, frame, box, landmarks=None):
        row = self._row(box, landmarks)
        try:
            aligned = self.rec.alignCrop(frame, row)
        except Exception:
            aligned = cv2.resize(_v.crop_face(frame, box), (112, 112))
        feat = self.rec.feature(aligned).ravel().astype(np.float32)
        n = float(np.linalg.norm(feat))
        return feat / (n if n > 1e-6 else 1.0)

    # ---------------- 建库 ----------------
    def add_person(self, person):
        cnt = 0
        for path in person.get("files", []):
            img = _v.imread(path)
            if img is None:
                print("[vision] 模板读不到：%s" % path)
                continue
            box, lm = None, None
            if self.detector is not None:
                try:
                    # 关键：注册必须和运行时一样拿 detect_ex 的真实 5 点关键点。
                    # 之前注册用合成点、运行时用真实点，alignCrop 对齐口径不一致，
                    # 会把余弦压到阈值以下（拿同一张照片当底库也认不出）。
                    if hasattr(self.detector, "detect_ex"):
                        faces = self.detector.detect_ex(img)
                        if faces:
                            box, lm = max(faces, key=lambda f: f[0][2] * f[0][3])
                    if box is None:
                        boxes = self.detector.detect(img)
                        if boxes:
                            box = max(boxes, key=lambda b: b[2] * b[3])
                except Exception as e:
                    print("[vision] 模板人脸检测失败 %s: %s" % (path, e))
            if box is None:
                # 检测不到就当整张图是正脸照：取中间最大的正方形
                h, w = img.shape[:2]
                side = int(min(w, h) * 0.92)
                box = ((w - side) // 2, (h - side) // 2, side, side)
            self.index.append((self.feature(img, box, lm), person))
            self.people.append(person)
            cnt += 1
        if not cnt:
            print("[vision] %s 的模板一张都没入库（照片读不到或没人脸）" % person.get("name"))
        else:
            print("[vision] 模板入库：%s（%d 张）" % (person.get("name"), cnt))
        return cnt

    # ---------------- 比对 ----------------
    def match(self, frame, box, landmarks=None):
        if not self.index:
            return _miss()
        feat = self.feature(frame, box, landmarks)
        mat = np.stack([v for v, _ in self.index])
        sims = mat @ feat                       # 都是单位向量，点积即余弦
        i = int(np.argmax(sims))
        score = float(sims[i])
        if score < self.thresh:
            if score > 0.20:
                self._near = getattr(self, "_near", 0) + 1
                if self._near <= 3 or self._near % 20 == 0:
                    print("[vision] 差一点命中：最高相似度 %.3f < 阈值 %.3f"
                          "（若确为同一人，把 sface_thresh 调到 0.30 左右）"
                          % (score, self.thresh))
            return _miss(score)
        p = self.index[i][1]
        return {"ok": True, "name": p["name"], "cat": p["cat"], "code": p["code"],
                "level": p.get("level", 0), "score": round(score, 3)}


# ------------------------------------------------------------------ 工厂
def build_real(cfg, people):
    """按 cfg 建真机后端。返回 (detector, recognizer)。"""
    model_dir = cfg.get("models_dir") or None
    det = YuNetDetector(model_dir=model_dir,
                        max_w=cfg.get("detect_max_w") or 640,
                        score_thresh=cfg.get("yunet_score") or 0.6,
                        min_face_px=cfg.get("min_face_px") or 40)
    rec = SFaceRecognizer(people,
                          sim_thresh=cfg.get("sface_thresh") or SFACE_THRESH,
                          model_dir=model_dir, detector=det)
    print("[vision] 真机后端：YuNet + SFace（OpenCV %s，模板 %d 张）%s"
          % (getattr(cv2, "__version__", "?"), len(rec.index), npu_status()))
    if not rec.index:
        print("[vision] ⚠ 底库为空！现在任何人都会被判成「陌生访客」。")
        print("[vision]   请在后台人脸库上传照片并看到「已同步到 K1 底库」，或手工放到 "
              "%s/suspect/<人名>/1.jpg" % (cfg.get("gallery") or "./gallery"))
    return det, rec


def npu_status():
    """看看有没有可用的加速后端，仅用于打印提示，不影响功能。

    K1 的 NPU 走 spacemit-ort（onnxruntime 的 SpaceMITExecutionProvider），
    需要 /dev/tcm 权限（udev 规则：KERNEL=="tcm" GROUP="plugdev" MODE="0660"）。
    """
    parts = []
    try:
        import onnxruntime as ort
        eps = ort.get_available_providers()
        hits = [e for e in eps if "spacemit" in e.lower() or "npu" in e.lower()]
        if hits:
            parts.append("NPU provider 可用: %s" % ",".join(hits))
        else:
            parts.append("无 NPU provider（%s），走 CPU" % ",".join(eps))
    except Exception as e:
        parts.append("未装 onnxruntime（%s）" % e)
    if os.path.exists("/dev/tcm"):
        import stat
        try:
            mode = oct(stat.S_IMODE(os.stat("/dev/tcm").st_mode))
            parts.append("/dev/tcm 存在（权限 %s）" % mode)
        except Exception:
            parts.append("/dev/tcm 存在")
    else:
        parts.append("/dev/tcm 缺失（NPU 推理会报 tcm buffer acquire failed）")
    return "· " + "；".join(parts)
