# -*- coding: utf-8 -*-
"""本地 HTTP 桥接服务（仅标准库，板上无需额外 pip 安装）。

端侧（本进程）与后台网页（同机浏览器 / 手机连 K1 热点）通过它交换数据：

    GET  /api/k1/health              健康检查
    GET  /api/k1/events?since=<ms>   后台轮询拉事件
    POST /api/k1/events              端侧上报（也可外部脚本模拟）
    POST /api/k1/resolve             后台处置写回（会同时给端侧下发播报动作）
    GET  /api/k1/actions             端侧取走待执行动作
    GET  /api/k1/watchlist           布控名单（网页维护底库时用）
    GET  /captures/<file>            抓拍图 / 环境音静态文件
    GET  /                           若指定了后台目录，直接托管 index.html
"""
import base64
import json
import os
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 4 * 1024 * 1024


class _Handler(BaseHTTPRequestHandler):
    server_version = "K1Bridge/1.0"
    store = None
    cfg = None
    html_dir = None
    captures = None
    ui = None

    # ---------------- 工具 ----------------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _err(self, code, msg):
        self._json({"ok": False, "error": msg}, code)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception as e:
            print("[bridge] JSON 解析失败:", e)
            return {}

    def _file(self, rel):
        rel = urllib.parse.unquote(rel)          # 浏览器传来的中文路径是百分号编码
        base = self.captures or "."
        p = os.path.normpath(os.path.join(base, rel))
        if not p.startswith(os.path.abspath(base)):
            return self._err(403, "forbidden")
        if not os.path.isfile(p):
            return self._err(404, "not found")
        ext = os.path.splitext(p)[1].lower()
        ctype = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                 ".wav": "audio/wav", ".mp3": "audio/mpeg"}.get(ext, "application/octet-stream")
        with open(p, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    # ---------------- 路由 ----------------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path, _, query = self.path.partition("?")
        q = {}
        for kv in query.split("&"):
            if "=" in kv:
                k, v = kv.split("=", 1)
                q[k] = v

        if path == "/api/k1/health":
            return self._json({"ok": True, "device_id": self.cfg.get("device_id"),
                               "location": self.cfg.get("location"),
                               "stats": self.store.stats()})
        if path == "/api/k1/events":
            return self._json({"ok": True, "events": self.store.since(q.get("since", 0))})
        if path == "/api/k1/actions":
            return self._json({"ok": True, "actions": self.store.drain_actions()})
        if path == "/api/k1/watchlist":
            return self._json({"ok": True, "people": _watchlist(self.cfg)})
        if path == "/api/k1/screen.jpg":
            return self._screen()
        if path == "/api/k1/screen.mjpg":
            return self._mjpeg()
        if path == "/screen":
            return self._screen_page()
        if path.startswith("/captures/"):
            return self._file(path[len("/captures/"):])
        if path in ("/", "/index.html") and self.html_dir:
            return self._static("index.html")
        if self.html_dir:
            return self._static(path.lstrip("/"))
        return self._err(404, "not found")

    def do_POST(self):
        path, _, _ = self.path.partition("?")
        data = self._body()

        if path == "/api/k1/events":
            ev = self.store.add(data or {})
            print("[bridge] 收到事件 %s %s(%s)" % (
                ev.get("kind"), (ev.get("person") or {}).get("name"),
                (ev.get("person") or {}).get("cat")))
            return self._json({"ok": True, "id": ev.get("id")})

        if path == "/api/k1/resolve":
            eid = data.get("event_id") or data.get("id")
            res = data.get("resolution") or "onscene"
            ev = self.store.resolve(eid, res, data.get("unit", ""),
                                    data.get("operator") or {}, data.get("note", ""),
                                    source=data.get("source") or "console")
            if not ev:
                return self._err(404, "event not found: %s" % eid)
            # 下发动作给端侧：播报确认 + LCD 状态收尾
            self.store.push_action({"type": "resolved", "event_id": eid,
                                    "resolution": res,
                                    "resolution_name": ev.get("resolution_name"),
                                    "operator": ev.get("handler")})
            return self._json({"ok": True, "event": ev})

        if path == "/api/k1/actions":                    # 允许后台主动下发任意动作
            act = self.store.push_action(data or {})
            return self._json({"ok": True, "id": act.get("id")})

        if path == "/api/k1/click":
            if not self.ui:
                return self._err(503, "ui not ready")
            act = self.ui.click_at(data.get("x", 0), data.get("y", 0))
            return self._json({"ok": True, "action": act})

        if path == "/api/k1/gallery":
            return self._gallery_push(data or {})

        if path == "/api/k1/gallery/remove":
            return self._gallery_remove(data or {})

        return self._err(404, "not found")

    # ---------------- 底库（后台上传的人脸） ----------------
    def _gallery_push(self, data):
        """后台把人脸照片推进端侧底库：{name, cat, code, level, photo}。

        photo 支持 dataURL 或裸 base64。写入 gallery/<cat>/<name>/，端侧 3 秒内自动热重载。
        """
        name = (data.get("name") or "").strip()
        cat = (data.get("cat") or "suspect").strip()
        photo = data.get("photo") or data.get("image") or ""
        if not name or not photo:
            return self._err(400, "name and photo required")
        if cat not in ("suspect", "staff", "vip"):
            cat = "suspect"
        if photo.startswith("data:"):
            photo = photo.split(",", 1)[-1]
        try:
            raw = base64.b64decode(photo)
        except Exception as e:
            return self._err(400, "bad base64: %s" % e)
        if len(raw) < 512:
            return self._err(400, "photo too small")

        root = os.path.abspath(self.cfg.get("gallery") or "./gallery")
        pdir = os.path.join(root, cat, name)
        os.makedirs(pdir, exist_ok=True)
        fname = os.path.basename(data.get("filename") or "1.jpg")
        if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".bmp")):
            fname = "1.jpg"
        with open(os.path.join(pdir, fname), "wb") as f:
            f.write(raw)
        meta = {"code": data.get("code") or "",
                "level": int(data.get("level") or 0),
                "note": data.get("note") or ""}
        try:
            with open(os.path.join(pdir, "meta.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        print("[bridge] 底库已更新：%s/%s (%d 字节)" % (cat, name, len(raw)))
        return self._json({"ok": True, "saved": "%s/%s/%s" % (cat, name, fname),
                           "people": len(_watchlist(self.cfg)),
                           "note": "端侧 3 秒内自动热重载"})

    def _gallery_remove(self, data):
        """删除底库里的某个人（后台删人脸时同步）。"""
        import shutil
        name = (data.get("name") or "").strip()
        cat = (data.get("cat") or "").strip()
        if not name:
            return self._err(400, "name required")
        root = os.path.abspath(self.cfg.get("gallery") or "./gallery")
        targets = []
        if cat in ("suspect", "staff", "vip"):
            targets.append(os.path.join(root, cat, name))
        else:
            for c in ("suspect", "staff", "vip"):
                targets.append(os.path.join(root, c, name))
        removed = 0
        for p in targets:
            if os.path.isdir(p) and os.path.abspath(p).startswith(root):
                shutil.rmtree(p, ignore_errors=True)
                removed += 1
        print("[bridge] 底库删除：%s %s（%d 处）" % (cat or "任意分类", name, removed))
        return self._json({"ok": True, "removed": removed,
                           "people": len(_watchlist(self.cfg))})

    # ---------------- LCD 网页屏 ----------------
    def _screen(self):
        if not self.ui:
            return self._err(503, "ui not ready")
        try:
            data = self.ui.compose_jpeg()
        except Exception as e:
            return self._err(500, "render failed: %s" % e)
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _screen_page(self):
        html = SCREEN_HTML.replace("__LOC__", str(self.cfg.get("location") or ""))
        data = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _mjpeg(self, fps=6, quality=55):
        """MJPEG 实时流：一个连接持续推帧，浏览器 <img> 直接显示，比轮询流畅。

        K1 的 CPU 很紧（1080p 检测 + PIL 绘制 + JPEG 编码），所以 fps/quality
        都调低了；画面没变化时进一步降频发送，把 CPU 让给检测和点击响应。
        """
        if self.ui is None:
            return self._err(404, "no screen")
        self.send_response(200)
        self.send_header("Content-Type",
                         "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        last = b""
        try:
            while True:
                try:
                    jpg = self.ui.compose_jpeg(quality=quality)
                except Exception:
                    jpg = b""
                if not jpg:
                    time.sleep(0.2)
                    continue
                same = (jpg == last)
                try:
                    self.wfile.write(
                        b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                        + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n")
                    self.wfile.flush()
                except Exception:
                    return                            # 客户端断开，正常退出
                last = jpg
                time.sleep(0.35 if same else 1.0 / fps)
        except Exception:
            pass

    def _static(self, rel):
        p = os.path.normpath(os.path.join(self.html_dir, rel))
        if not p.startswith(os.path.abspath(self.html_dir)) or not os.path.isfile(p):
            return self._err(404, "not found")
        ext = os.path.splitext(p)[1].lower()
        ctype = {".html": "text/html; charset=utf-8", ".js": "text/javascript",
                 ".css": "text/css", ".json": "application/json",
                 ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml"}.get(
                     ext, "application/octet-stream")
        with open(p, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass                                          # 静默，避免刷屏


def _watchlist(cfg):
    from . import gallery
    people = gallery.scan(cfg.get("gallery") or "./gallery")
    return [{"name": p["name"], "cat": p["cat"], "code": p["code"],
             "level": p["level"], "samples": len(p["files"])} for p in people]


def serve(store, cfg, html_dir=None, port=None, ui=None):
    """启动桥接服务（后台线程）。返回 (server, thread)。"""
    _Handler.store = store
    _Handler.cfg = cfg
    _Handler.html_dir = html_dir
    _Handler.ui = ui
    _Handler.captures = os.path.abspath(cfg.get("captures") or ".")
    port = int(port or cfg.get("bridge_port") or 8088)
    server = ThreadingHTTPServer(("0.0.0.0", port), _Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print("[bridge] 已启动 http://0.0.0.0:%d" % port)
    print("         健康检查 http://127.0.0.1:%d/api/k1/health" % port)
    if ui is not None:
        print("         LCD 网页屏 http://127.0.0.1:%d/screen  （浏览器打开即可，800×480 自适应）" % port)
    return server, t


SCREEN_HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>K1 巡更屏</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;height:100%;background:#0a1420;display:flex;align-items:center;justify-content:center;font-family:system-ui,"Microsoft YaHei",sans-serif}
#wrap{position:relative;border-radius:10px;overflow:hidden;box-shadow:0 18px 50px -18px #000;max-width:100vw}
img{display:block;width:min(96vw,960px);height:auto;user-select:none;-webkit-user-select:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
</style></head>
<body>
<div id="wrap"><img id="s" src="/api/k1/screen.mjpg" alt="K1 LCD"></div>
<script>
var img = document.getElementById('s');
img.onerror = function(){
  setTimeout(function(){ img.src = '/api/k1/screen.mjpg?t=' + Date.now(); }, 800);
};
img.addEventListener('click', function(e){
  var r = img.getBoundingClientRect();
  var x = Math.round((e.clientX - r.left) / r.width * 800);
  var y = Math.round((e.clientY - r.top) / r.height * 480);
  fetch('/api/k1/click', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({x:x, y:y})});
});
</script>
</body></html>
"""
