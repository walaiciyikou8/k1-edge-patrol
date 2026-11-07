# -*- coding: utf-8 -*-
"""人脸检测 / 识别。Mock 与真 NPU 同接口，主循环不关心后端。

接口：
    det.detect(frame_bgr)              -> [(x, y, w, h), ...]
    rec.match(frame_bgr, box)          -> {ok, name, cat, code, level, score}
    rec.add_person(person)             -> 热加载新人

Mock 后端只依赖 opencv-python + numpy（不需要 opencv-contrib 的 cv2.face），
用 32×32 灰度归一化向量做余弦比对 —— 够跑通逻辑与演示，精度交给板上 NPU。
"""
import os

import numpy as np

try:
    import cv2
except Exception:                                    # pragma: no cover
    cv2 = None


# ---------------------------------------------------------------- 通用工具
def require_cv2():
    if cv2 is None:
        raise SystemExit("[vision] 缺少 opencv-python：pip install opencv-python numpy")


def imread(path, flags=None):
    """读图。cv2.imread 在 Windows 上不支持中文路径，统一走 fromfile + imdecode。"""
    require_cv2()
    flags = cv2.IMREAD_COLOR if flags is None else flags
    try:
        buf = np.fromfile(path, dtype=np.uint8)
        if buf.size:
            img = cv2.imdecode(buf, flags)
            if img is not None:
                return img
    except Exception:
        pass
    return cv2.imread(path, flags)


def imwrite(path, img, quality=92):
    """写图。同理走 imencode + tofile，兼容中文路径。"""
    require_cv2()
    ext = os.path.splitext(path)[1] or ".jpg"
    try:
        params = [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)] if ext.lower() in (".jpg", ".jpeg") else []
        ok, buf = cv2.imencode(ext, img, params)
        if ok:
            buf.tofile(path)
            return True
    except Exception as e:
        print("[vision] 写图失败，回退 imwrite:", e)
    return bool(cv2.imwrite(path, img))


def center_crop(frame, ratio):
    """130° 广角边缘畸变大、人脸小：ratio<1 时只取中心区域做检测。"""
    if not ratio or ratio >= 1.0:
        return frame, (0, 0)
    h, w = frame.shape[:2]
    cw, ch = int(w * ratio), int(h * ratio)
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    return frame[y0:y0 + ch, x0:x0 + cw], (x0, y0)


def crop_face(frame, box, pad=0.15):
    h, w = frame.shape[:2]
    x, y, bw, bh = box
    px, py = int(bw * pad), int(bh * pad)
    x0, y0 = max(0, x - px), max(0, y - py)
    x1, y1 = min(w, x + bw + px), min(h, y + bh + py)
    return frame[y0:y1, x0:x1]


def _norm_vec(gray_img, size=48):
    """灰度人脸 → 直方图均衡 → 缩放到固定尺寸 → 零均值单位向量。

    均衡化能消掉曝光/距离带来的整体亮度差异，mock 模式下命中率明显更稳。
    """
    g = cv2.equalizeHist(gray_img)
    g = cv2.resize(g, (size, size), interpolation=cv2.INTER_AREA).astype(np.float32)
    g = g - g.mean()
    n = np.linalg.norm(g)
    return g.ravel() / (n if n > 1e-6 else 1.0)


# ---------------------------------------------------------------- Mock 后端
class HaarDetector:
    """OpenCV Haar 级联检测（本机调试用）。"""

    def __init__(self, min_face_px=60, scale=1.15, neighbors=5):
        require_cv2()
        self.min_px = int(min_face_px)
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.det = cv2.CascadeClassifier(path)
        self.scale, self.neighbors = scale, neighbors

    def detect(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        boxes = self.det.detectMultiScale(gray, self.scale, self.neighbors,
                                          minSize=(self.min_px, self.min_px))
        return [tuple(int(v) for v in b) for b in boxes]


class VectorRecognizer:
    """灰度向量余弦比对。self.match 命中返回 >= thresh 的最近邻。

    注册模板时也走人脸检测裁切（和人脸库照片整张图比对是不对的：照片是全身/半身，
    比的是脸），这样 mock 模式下的命中率才接近真机表现。
    """

    def __init__(self, people, sim_thresh=0.72, detector=None):
        require_cv2()
        self.people = []
        self.vecs = []
        self.thresh = float(sim_thresh)
        self.detector = detector
        for p in people:
            self.add_person(p)

    def _face_vec(self, img):
        """从一张图里取"最大人脸"的归一化向量；没人脸时退化为中心正方区域。"""
        box = None
        if self.detector is not None:
            try:
                faces = self.detector.detect(img)
                if faces:
                    box = max(faces, key=lambda b: b[2] * b[3])
            except Exception:
                box = None
        if box is None:
            h, w = img.shape[:2]
            side = int(min(w, h) * 0.9)
            box = ((w - side) // 2, (h - side) // 2, side, side)
        crop = crop_face(img, box) if box[2] < img.shape[1] else img
        if crop.size == 0:
            crop = img
        return _norm_vec(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY))

    def add_person(self, person):
        ok = 0
        for f in person.get("files", []):
            img = imread(f)
            if img is None:
                continue
            self.vecs.append(self._face_vec(img))
            self.people.append(person)
            ok += 1
        return ok

    def match(self, frame, box, landmarks=None):
        if not self.vecs:
            return _miss()
        crop = crop_face(frame, box)
        if crop.size == 0:
            return _miss()
        v = _norm_vec(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY))
        sims = np.array([float(np.dot(v, g)) for g in self.vecs])
        i = int(np.argmax(sims))
        score = float(sims[i])
        # 32×32 向量较粗，把余弦相似度线性映射到 0~1 的可读分数
        conf = max(0.0, min(1.0, (score - 0.3) / 0.7))
        if conf < self.thresh:
            return _miss(conf)
        p = self.people[i]
        return {"ok": True, "name": p["name"], "cat": p["cat"], "code": p["code"],
                "level": p.get("level", 0), "score": round(conf, 3)}


# ---------------------------------------------------------------- 真机后端
# 真机实现见 vision_real.py（YuNet 检测 + SFace 128 维特征，CPU/NPU 均可跑）。
# 这里保留旧的类名做兼容，内部直接委托给真机后端。
class SpacemitDetector:                              # pragma: no cover - 兼容旧引用
    """真机检测（转向 vision_real.YuNetDetector）。"""

    def __init__(self, min_face_px=60, model_dir=None, **kw):
        from .vision_real import YuNetDetector
        self._impl = YuNetDetector(model_dir=model_dir, min_face_px=min_face_px, **kw)

    def detect(self, frame):
        return self._impl.detect(frame)

    def detect_ex(self, frame):
        return self._impl.detect_ex(frame)


class SpacemitRecognizer:                            # pragma: no cover - 兼容旧引用
    """真机识别（转向 vision_real.SFaceRecognizer）。"""

    def __init__(self, people, sim_thresh=0.363, model_dir=None, detector=None, **kw):
        from .vision_real import SFaceRecognizer
        self._impl = SFaceRecognizer(people, sim_thresh=sim_thresh,
                                     model_dir=model_dir, detector=detector, **kw)

    def add_person(self, person):
        return self._impl.add_person(person)

    def match(self, frame, box, landmarks=None):
        return self._impl.match(frame, box, landmarks)


def _miss(score=0.0):
    return {"ok": False, "name": "", "cat": "unknown", "code": "", "level": 0,
            "score": round(float(score), 3)}


# ---------------------------------------------------------------- 工厂
def build(cfg, people):
    """按 cfg 建后端。mock=Haar+灰度向量；真机=YuNet+SFace（vision_real）。"""
    require_cv2()
    if cfg.get("mock", True):
        det = HaarDetector(cfg["min_face_px"])
        return det, VectorRecognizer(people, cfg["sim_thresh"], detector=det)
    try:
        from .vision_real import build_real
        return build_real(cfg, people)
    except SystemExit as e:
        if cfg.get("strict_real"):
            raise
        print(e)
        print("[vision] ⚠ 真机后端不可用 → 本次降级为 mock（流程不变，精度较低）")
        det = HaarDetector(cfg["min_face_px"])
        return det, VectorRecognizer(people, cfg["sim_thresh"], detector=det)
    except Exception as e:
        if cfg.get("strict_real"):
            raise
        print("[vision] ⚠ 真机后端初始化异常（%s）→ 降级为 mock" % e)
        det = HaarDetector(cfg["min_face_px"])
        return det, VectorRecognizer(people, cfg["sim_thresh"], detector=det)


def draw_boxes(frame, faces, hint=None):
    """调试用：把检测结果画回画面（LCD 只显示照片，不显示摄像头预览）。"""
    for (x, y, w, h), m in faces:
        color = (60, 60, 220) if m["ok"] else (150, 150, 150)
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
        if m["ok"]:
            cv2.putText(frame, "%s %.2f" % (m["name"], m["score"]), (x, max(14, y - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
    return frame
