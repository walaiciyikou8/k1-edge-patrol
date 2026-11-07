#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 src/ 下的 CSS 与 JS 内联成单文件 dist/index.html（方便直接静态部署）。"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

CSS_FILES = [
    "styles/base.css",
    "styles/components.css",
    "styles/views.css",
]
JS_FILES = [
    "js/00-util.js",
    "js/01-mock.js",
    "js/02-store.js",
    "js/03-cloud.js",
    "js/04-auth.js",
    "js/05-chart.js",
    "js/06-ui.js",
    "js/07-shell.js",
    "js/08-view-dashboard.js",
    "js/09-view-faces.js",
    "js/10-view-points.js",
    "js/11-view-alerts.js",
    "js/12-view-timeline.js",
    "js/13-view-cloud.js",
    "js/14-view-settings.js",
    "js/15-app.js",
    "js/16-live.js",
]


def read(rel):
    p = SRC / rel
    if not p.exists():
        sys.exit("缺少源文件: %s" % p)
    return p.read_text(encoding="utf-8")


def main():
    css = []
    for f in CSS_FILES:
        css.append("/* ===== %s ===== */\n%s" % (f, read(f)))
    js = []
    for f in JS_FILES:
        body = read(f)
        if "</script" in body.lower():
            sys.exit("%s 含有 </script>，无法内联" % f)
        js.append("/* ===== %s ===== */\n%s" % (f, body))

    html = read("index.html")
    html = html.replace("/*__STYLES__*/", "\n".join(css))
    html = html.replace("/*__SCRIPTS__*/", "\n".join(js))

    DIST.mkdir(exist_ok=True)
    out = DIST / "index.html"
    out.write_text(html, encoding="utf-8")
    size = out.stat().st_size
    print("构建完成: %s  (%.1f KB)" % (out, size / 1024))
    print("  CSS %d 文件 / JS %d 文件" % (len(CSS_FILES), len(JS_FILES)))


if __name__ == "__main__":
    main()
