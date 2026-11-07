# -*- coding: utf-8 -*-
"""本地人脸库扫描。

支持两种目录布局（可混用）：
    gallery/<分类>/<人名>/  分类 = suspect | staff | vip
    gallery/<人名>/          平铺，默认视为 suspect（布控）

每个人可放一个 meta.json：
    {"code": "F-1001", "level": 3, "note": "西侧围栏破坏"}
"""
import json
import os

CATS = ("suspect", "staff", "vip")
IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp")


def _images(d):
    out = []
    for f in sorted(os.listdir(d)):
        if f.lower().endswith(IMG_EXT):
            p = os.path.join(d, f)
            if os.path.isfile(p):
                out.append(p)
    return out


def _meta(person_dir, name):
    meta = {"code": "", "level": 0, "note": ""}
    p = os.path.join(person_dir, "meta.json")
    if os.path.isfile(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                meta.update(json.load(f) or {})
        except Exception as e:
            print("[gallery] meta 解析失败 %s: %s" % (p, e))
    meta["name"] = name
    return meta


def scan(gallery_dir):
    """返回 [{name, cat, code, level, note, files:[...]}]，按 suspect→staff→vip 排序。"""
    people = []
    if not os.path.isdir(gallery_dir):
        print("[gallery] 目录不存在: %s" % gallery_dir)
        return people

    for top in sorted(os.listdir(gallery_dir)):
        tp = os.path.join(gallery_dir, top)
        if not os.path.isdir(tp):
            continue
        if top in CATS:
            for name in sorted(os.listdir(tp)):
                pp = os.path.join(tp, name)
                if not os.path.isdir(pp):
                    continue
                files = _images(pp)
                if not files:
                    continue
                m = _meta(pp, name)
                people.append({"name": name, "cat": top, "code": m.get("code") or name,
                               "level": int(m.get("level") or 0), "note": m.get("note", ""),
                               "files": files})
        else:
            files = _images(tp)
            if not files:
                continue
            m = _meta(tp, top)
            people.append({"name": top, "cat": "suspect", "code": m.get("code") or top,
                           "level": int(m.get("level") or 0), "note": m.get("note", ""),
                           "files": files})

    order = {c: i for i, c in enumerate(CATS)}
    people.sort(key=lambda p: (order.get(p["cat"], 9), p["name"]))
    print("[gallery] 载入 %d 人：%s" % (
        len(people), "、".join("%s(%s/%d张)" % (p["name"], p["cat"], len(p["files"])) for p in people)))
    return people


def counts(people):
    out = {c: 0 for c in CATS}
    for p in people:
        out[p["cat"]] = out.get(p["cat"], 0) + 1
    return out
