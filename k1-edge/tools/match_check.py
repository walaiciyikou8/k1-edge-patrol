#!/usr/bin/env python3
"""Face match diagnostic: why does this photo come back as a stranger?

Usage:
    python3 tools/match_check.py <photo.jpg> [<photo2.jpg> ...]

It loads the SAME backend as main.py (YuNet + SFace), prints how many
templates are in the gallery, detects faces in each given photo and shows
the best cosine similarity against every person in the gallery.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from k1edge import config, gallery, vision, vision_real  # noqa: E402


def find_photo(p, cfg):
    """路径写错时，在 captures/ 下按文件名递归找一次。"""
    if os.path.isfile(p):
        return p
    base = os.path.basename(p)
    root = os.path.abspath(cfg.get("captures") or "./captures")
    for d, _, files in os.walk(root):
        if base in files:
            return os.path.join(d, base)
    return p


def main():
    paths = sys.argv[1:]
    cfg = config.load(os.path.join(ROOT, "config.json"))
    os.chdir(ROOT)
    cfg["mock"] = False
    people = gallery.scan(cfg.get("gallery") or "./gallery")
    print("底库目录：", os.path.abspath(cfg.get("gallery") or "./gallery"))
    print("底库人数：", len(people), [(p["name"], p["cat"], len(p["files"])) for p in people])
    if not people:
        print("!! 底库是空的 —— 后台上传的人脸还没同步到 K1。")
        print("   在后台人脸库重新保存一次（会提示「已同步到 K1 底库」），或手工放照片：")
        print("   mkdir -p gallery/suspect/人名 && cp 正脸.jpg gallery/suspect/人名/1.jpg")
    if not paths:
        # 不带参数：直接拿底库里的照片自测（同一张图应该 ≈1.0）
        for p in people:
            if p.get("files"):
                paths = [p["files"][0]]
                print("（未指定照片，自动用底库第一张自测：%s）" % paths[0])
                break
        if not paths:
            print("没有可测的照片。用法：python3 tools/match_check.py <photo.jpg>")
            return 2
    det, rec = vision_real.build_real(cfg, people)
    print("模板张数：", len(rec.index), " 阈值：", rec.thresh)
    print("-" * 60)
    for p in paths:
        p = find_photo(p, cfg)
        img = vision.imread(p)
        if img is None:
            print(p, "-> 读不到图片")
            continue
        faces = det.detect_ex(img)
        print("%s  尺寸 %s  检出人脸 %d 张" % (p, img.shape[:2], len(faces)))
        if not faces:
            print("   -> 这张图没检测到人脸（太糊/太偏/脸太小），所以当然不匹配")
            continue
        (x, y, w, h), lm = max(faces, key=lambda f: f[0][2] * f[0][3])
        feat = rec.feature(img, (x, y, w, h), lm)
        if rec.index:
            sims = [(float(feat @ v), person["name"], person["cat"])
                    for v, person in rec.index]
            sims.sort(reverse=True)
            for s, name, cat in sims[:5]:
                print("   %.3f  %s (%s) %s" % (s, name, cat,
                                              "✓ 命中" if s >= rec.thresh else "✗ 未过阈值"))
        else:
            print("   -> 没有模板可比对（底库为空）")
    print("-" * 60)
    print("参考：同人不同照片通常 0.35~0.70；不同人通常 <0.30。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
