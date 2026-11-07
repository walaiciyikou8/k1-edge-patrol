# -*- coding: utf-8 -*-
"""LCD 三态界面（4.3" 800×480 电容触摸 / OpenCV 窗口）。

    待机 IDLE   中性信息屏：时间、点位、巡更中。没有摄像头预览、没有红框、没有安防字样。
    命中 HIT    仍然中性，只在右上角出现一个小圆点（真正的提醒走喇叭/耳机）。
    调阅 DETAIL 巡逻员主动点击后才显示抓拍照片、相似度、历史命中，以及四个处置按钮。

触摸屏在 X11 下被映射为鼠标事件，因此 cv2.setMouseCallback 即可拿到点击。
中文用 PIL 绘制（cv2.putText 不支持中文）。
"""
import datetime
import os
import time

try:
    import cv2
    import numpy as np
except Exception:                                     # pragma: no cover
    cv2, np = None, None

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:                                     # pragma: no cover
    Image = ImageDraw = ImageFont = None

from . import events as ev_mod

W, H = 800, 480

C_BG = (14, 26, 42)
C_BG2 = (22, 38, 58)
C_TEXT = (232, 240, 250)
C_SUB = (140, 160, 185)
C_ACCENT = (31, 111, 235)
C_DANGER = (223, 71, 77)
C_WARN = (224, 139, 6)
C_OK = (18, 160, 106)
C_INFO = (31, 111, 235)
C_VIOLET = (107, 92, 240)
C_DIM = (139, 156, 177)

RES_BTNS = [
    ("onscene", "现场处置", C_OK),
    ("track", "隐蔽跟踪", C_INFO),
    ("backup", "请求增援", C_VIOLET),
    ("false", "误报归档", C_DIM),
]

# 可切换的巡检点（模块级，方便 tools/gen_voice.py 批量生成各点位的播报语音）
POINTS = [("东门主入口", "P-01"), ("南门车库", "P-02"),
          ("仓库通道", "P-03"), ("办公楼大厅", "P-04")]

_FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
]


def _font(size):
    if ImageFont is None:
        return None
    for p in _FONT_CANDIDATES:
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


_IP_CACHE = {"v": "", "t": 0.0}


def _local_ip():
    """本机局域网 IP，显示在界面上——换热点/IP 变了也能一眼看到，不用连 SSH 才知道。"""
    now = time.time()
    if now - _IP_CACHE["t"] > 10:
        ip = ""
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.connect(("8.8.8.8", 80))       # 不真的发包，只做一次路由查询
                ip = s.getsockname()[0]
            finally:
                s.close()
        except Exception:
            ip = ""
        _IP_CACHE["v"], _IP_CACHE["t"] = ip, now
    return _IP_CACHE["v"]


class Lcd:
    def __init__(self, cfg, on_resolve=None, fullscreen=True, show=True,
                 window="K1 巡更", fb=None):
        self.cfg = cfg
        self.on_resolve = on_resolve
        self.state = "idle"                # idle | hit | detail
        self.current = None                # 正在展示的事件
        self.pending = []                  # 未查看的命中事件
        self.fb = fb                       # FbDev：直接写 /dev/fbN，无需 X
        self.show = bool(show and cv2 is not None and Image is not None)
        self.window = window
        self._rects = []                   # [(x0,y0,x1,y1,action)]
        self._ready = False
        self._fullscreen = fullscreen
        self._slide = 0
        self._last = None                  # 最近一帧 BGR，渲染失败时保留，避免黑屏
        self.preview = None                # 摄像头实时帧（BGR 引用），idle 界面作预览
        self.allowed = {"onscene", "track", "backup", "false"}
        self.POINTS = POINTS

    # ---------------- 实时预览 ----------------
    def set_frame(self, frame):
        """主循环喂帧：缩到预览尺寸并转 RGB 缓存（每次 compose 直接 paste）。

        预览最多约 8fps 更新——1080p 缩放比较贵，没必要跟着 30fps 采集跑，
        否则会把 CPU 全吃掉，导致点击/切点位反应迟钝。

        注意：先把小图算好再整体赋值，绝不提前置 None。否则 MJPEG 线程在
        「刚清空、还没赋值」的几十毫秒里画图，会拿不到预览而退回钟面 —— 表现为闪屏。
        """
        now = time.time()
        if now - getattr(self, "_frame_at", 0) < 0.12:
            return
        if frame is None or cv2 is None:
            return
        try:
            small = cv2.resize(frame, (480, 270), interpolation=cv2.INTER_LINEAR)
            small_rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        except Exception:
            return                      # 这一帧缩放失败就沿用上一张，不闪
        self._frame_at = now
        self.preview = frame
        self._preview_small = small_rgb

    # ---------------- 生命周期 ----------------
    def _init_window(self):
        """创建 OpenCV 窗口。

        注意：先 WINDOW_NORMAL 再切 WND_PROP_FULLSCREEN 在部分 ARM/GTK 版 OpenCV
        上会导致整窗纯黑（内容不重绘）。这里改为：普通窗口固定 800×480（K1 面板
        原生分辨率，不依赖全屏即可铺满），除非显式要求全屏才尝试该属性，且失败不影响显示。
        """
        if not self.show or self._ready:
            return
        try:
            flags = cv2.WINDOW_NORMAL
            try:
                flags = cv2.WINDOW_GUI_NORMAL   # 无默认装饰，更干净
            except Exception:
                pass
            cv2.namedWindow(self.window, flags)
            cv2.resizeWindow(self.window, W, H)
            if self._fullscreen:
                try:
                    cv2.setWindowProperty(self.window, cv2.WND_PROP_FULLSCREEN,
                                          cv2.WINDOW_FULLSCREEN)
                except Exception as e:
                    print("[lcd] 全屏属性设置失败（忽略，仍可显示）:", e)
            cv2.setMouseCallback(self.window, self._on_mouse)
            # 用一张测试帧真正调用一次 imshow，验证 GUI 是否可用
            # （headless 构建的 imshow 会在此抛 "not implemented"）
            test = np.zeros((H, W, 3), dtype=np.uint8)
            cv2.imshow(self.window, test)
            cv2.waitKey(1)
            self._last = test
            self._ready = True
        except Exception as e:
            port = int(self.cfg.get("bridge_port") or 8088)
            print("[lcd] 无法创建/绘制窗口（cv2 无 GUI 或显示异常），自动降级为网页屏：", e)
            print("       请在本机浏览器打开  http://127.0.0.1:%d/screen  （物理 LCD 同样可显示）" % port)
            self.show = False
            self._ready = False

    # ---------------- 事件入口 ----------------
    def push(self, event):
        """有新事件：只亮一个小点，不弹图。"""
        if not event:
            return
        self.pending.append(event)
        if self.state == "idle":
            self.state = "hit"

    def open_detail(self, event=None):
        ev = event or (self.pending.pop(0) if self.pending else None)
        if not ev:
            return False
        self.current = ev
        self.state = "detail"
        return True

    def mark_resolved(self, event_id, resolution_name):
        if self.current and self.current.get("id") == event_id:
            self.current["status"] = "confirmed"
            self.current["resolution_name"] = resolution_name
        self.state = "hit" if self.pending else "idle"
        self.current = None

    def pending_count(self):
        return len(self.pending)

    # ---------------- 鼠标 ----------------
    def _on_mouse(self, event, x, y, flags, param):
        if event != cv2.EVENT_LBUTTONDOWN:
            return
        try:
            rect = cv2.getWindowImageRect(self.window)
            if rect and rect[2] > 0 and rect[3] > 0:
                sx, sy = W / float(rect[2]), H / float(rect[3])
                x, y = int(x * sx), int(y * sy)
        except Exception:
            pass
        for (x0, y0, x1, y1, action) in self._rects:
            if x0 <= x <= x1 and y0 <= y <= y1:
                self._click(action)
                return

    def _click(self, action):
        if action == "open":
            self.open_detail()
        elif action == "close":
            self.state = "hit" if self.pending else "idle"
            self.current = None
        elif action == "menu":
            self.state = "menu"
        elif action == "back":
            self.state = "hit" if self.pending else "idle"
        elif action.startswith("pt:"):
            loc, _, code = action[3:].partition("|")
            self.cfg["location"] = loc
            self.cfg["point_code"] = code
            self.state = "hit" if self.pending else "idle"
            print("[lcd] 切换巡检点 -> %s (%s)" % (loc, code))
        elif action in self.allowed and self.current:
            ev = self.current
            self.mark_resolved(ev.get("id"), ev_mod.RESOLUTIONS[action]["name"])
            if self.on_resolve:
                try:
                    self.on_resolve(ev, action)
                except Exception as e:
                    print("[lcd] on_resolve 回调异常:", e)

    # ---------------- 绘制 ----------------
    def compose(self):
        """把当前状态画成一张 PIL 图（无显示环境也能出图，便于预览/截图）。"""
        img = Image.new("RGB", (W, H), C_BG)
        d = ImageDraw.Draw(img)
        self._rects = []

        if self.state == "menu":
            self._draw_menu(img, d)
        elif self.state == "detail" and self.current:
            self._draw_detail(img, d, self.current)
        else:
            self._draw_idle(img, d)

        # 底部提示条
        d.rectangle([0, H - 34, W, H], fill=C_BG2)
        if self.state == "idle":
            hint = ("有 %d 条待查看记录 · 点击屏幕查看" % len(self.pending)
                    if self.pending else "巡更中 · 右下角「切换点位」可模拟不同巡检点")
        else:
            hint = {"hit": "有 %d 条待查看记录 · 点击查看" % max(1, len(self.pending)),
                    "menu": "点击选择巡检点",
                    "detail": "核对照片特征后选择处置方式"}[self.state]
        d.text((16, H - 26), hint, font=_font(13), fill=C_SUB)
        if self.state in ("idle", "hit"):
            # 右下角「切换点位」按钮（演示时模拟不同巡检点）
            x0, x1 = W - 108, W - 12
            d.rectangle([x0, H - 28, x1, H - 6], fill=(30, 50, 75),
                        outline=(70, 100, 140))
            d.text((x0 + 12, H - 26), "切换点位", font=_font(13), fill=C_SUB)
            self._rects.append((x0, H - 34, W, H, "menu"))
        self._publish_rects()
        return img

    # ---------------- 外部入口（网页屏 / 远程调试） ----------------
    def click_at(self, x, y):
        """按 800×480 画布坐标模拟一次点击（网页屏用）。

        ⚠ 读的是 `_rects_pub`（compose 完成后才发布的完整副本），不能直接读
        `_rects` —— MJPEG 线程每帧都会把 `_rects` 清空再逐个 append，
        点击正好落在这个窗口里时热区是半空的，表现就是「点很多次才反应」。
        """
        x, y = int(x), int(y)
        rects = getattr(self, "_rects_pub", None)
        if rects is None:
            rects = getattr(self, "_rects", [])
        for (x0, y0, x1, y1, action) in rects:
            if x0 <= x <= x1 and y0 <= y <= y1:
                self._click(action)
                return action
        # 兜底：待机/命中界面且有待查看记录时，点哪儿都算「查看记录」，
        # 避免热区没同步上时用户点了完全没反应。
        if self.state in ("idle", "hit") and self.pending:
            self._click("open")
            return "open"
        return None

    def compose_jpeg(self, quality=82):
        """当前画面转 JPEG 字节，供 /api/k1/screen.jpg 使用。

        detail / menu 这两种界面内容基本静止，2 秒内复用上一帧 JPEG，
        省掉重复的 PIL 绘制 + 编码（K1 上一次 60~120ms，白烧 CPU）。
        idle 界面有实时预览在动，必须每帧重绘。
        """
        from io import BytesIO
        static = self.state in ("detail", "menu")
        sig = None
        if static:
            sig = (self.state, id(self.current), len(self.pending),
                   self.cfg.get("location"), int(time.time()) // 2, quality)
            if getattr(self, "_jpeg_sig", None) == sig and getattr(self, "_jpeg_buf", None):
                return self._jpeg_buf
        buf = BytesIO()
        self.compose().save(buf, format="JPEG", quality=quality)
        data = buf.getvalue()
        if static:
            self._jpeg_sig, self._jpeg_buf = sig, data
        else:
            self._jpeg_sig, self._jpeg_buf = None, None
        return data

    def render(self):
        # framebuffer 直写模式：不经过 X/Wayland，直接把画布怼到面板上
        if self.fb is not None and getattr(self.fb, "ok", False):
            try:
                self.fb.show(self.compose())
            except Exception as e:
                print("[lcd] 写 framebuffer 失败:", e)
            return True
        if not self.show:
            # 网页屏：画面由 MJPEG 线程持续 compose，这里每秒只补一次热区，
            # 避免主循环每帧都白画一遍（板上 30~50ms/次，白白拖慢检测与点击响应）
            now = time.time()
            if now - getattr(self, "_web_compose_at", 0) > 1.0:
                self._web_compose_at = now
                self.compose()
            return True
        self._init_window()
        if not self._ready:
            return True
        try:
            pil = self.compose()
            frame = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
            self._last = frame
            cv2.imshow(self.window, frame)
        except Exception as e:
            # 单帧渲染失败：保留上一帧，避免窗口停在黑屏；继续跑主循环
            print("[lcd] 渲染帧失败（保留上一帧）:", e)
            if self._last is not None:
                try:
                    cv2.imshow(self.window, self._last)
                except Exception:
                    pass
        return True

    def _draw_idle(self, img, d):
        now = datetime.datetime.now()
        f_big, f_mid, f_sm = _font(84), _font(22), _font(14)
        fr = getattr(self, "_preview_small", None)
        if fr is None:
            fr = getattr(self, "_last_preview", None)   # 兜底：沿用上一张，避免闪钟面
        else:
            self._last_preview = fr
        has_preview = False
        if fr is not None:
            try:
                pw, ph = 480, 270
                px, py = (W - pw) // 2, 52
                img.paste(Image.fromarray(fr), (px, py))
                d.rectangle([px, py, px + pw - 1, py + ph - 1], outline=(70, 100, 140))
                has_preview = True
            except Exception:
                has_preview = False
        if has_preview:
            # 预览下方：点位 + 日期时间（小字）
            loc = self.cfg.get("location", "本点位")
            lw = d.textlength(loc, font=f_mid) if hasattr(d, "textlength") else 120
            d.text(((W - lw) / 2, 342), loc, font=f_mid, fill=C_SUB)
            d.text((16, 16), now.strftime("%H:%M:%S"), font=_font(20), fill=C_SUB)
            d.text((16, 44), now.strftime("%Y-%m-%d %A"), font=f_sm, fill=C_SUB)
            ip = _local_ip()
            if ip:
                d.text((16, 70), ip, font=_font(13), fill=(90, 120, 150))
        else:
            # 无摄像头时保持原待机钟面
            txt = now.strftime("%H:%M")
            tw = d.textlength(txt, font=f_big) if hasattr(d, "textlength") else 220
            d.text(((W - tw) / 2, 110), txt, font=f_big, fill=C_TEXT)
            sub = now.strftime("%Y-%m-%d  %A")
            sw = d.textlength(sub, font=f_sm) if hasattr(d, "textlength") else 180
            d.text(((W - sw) / 2, 214), sub, font=f_sm, fill=C_SUB)
            loc = self.cfg.get("location", "本点位")
            lw = d.textlength(loc, font=f_mid) if hasattr(d, "textlength") else 120
            d.text(((W - lw) / 2, 250), loc, font=f_mid, fill=C_SUB)

        # 右上小圆点：命中提示（不含任何人员信息）
        if self.state == "hit" and self.pending:
            cx, cy, r = W - 30, 30, 7
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=C_WARN)
            self._rects.append((0, 0, W, H - 40, "open"))

        # 点击整个屏幕可打开（有待查看记录时）
        if self.pending:
            self._rects.append((0, 0, W, H - 40, "open"))

    def _publish_rects(self):
        """绘制结束后一次性发布完整热区副本，避免点击线程读到半空的列表。"""
        self._rects_pub = list(self._rects)

    def _draw_menu(self, img, d):
        """巡检点选择（演示：手动切换模拟不同点位）。"""
        d.text((16, 16), "选择巡检点", font=_font(24), fill=C_TEXT)
        d.text((16, 52), "当前：%s (%s)" % (self.cfg.get("location", "—"),
                                            self.cfg.get("point_code", "—")),
               font=_font(13), fill=C_SUB)
        y = 84
        for loc, code in self.POINTS:
            cur = loc == self.cfg.get("location")
            d.rectangle([16, y, W - 16, y + 56], fill=C_BG2,
                        outline=(90, 130, 180) if cur else (60, 90, 130))
            d.text((28, y + 16), ("● " if cur else "○ ") + "%s (%s)" % (loc, code),
                   font=_font(18), fill=C_TEXT if cur else C_SUB)
            self._rects.append((16, y, W - 16, y + 56, "pt:%s|%s" % (loc, code)))
            y += 64
        d.rectangle([16, y + 2, W - 16, y + 44], fill=(45, 35, 50), outline=(100, 70, 100))
        d.text((28, y + 12), "取消", font=_font(16), fill=C_SUB)
        self._rects.append((16, y, W - 16, y + 48, "back"))

    def _draw_detail(self, img, d, ev):
        person = ev.get("person") or {}
        snap = self._load_snapshot(ev)
        box = (16, 16, 440, 400)
        if snap is not None:
            img.paste(snap, (box[0], box[1]))
        else:
            d.rectangle(list(box), fill=C_BG2)
            d.text((box[0] + 12, box[1] + 12), "抓拍图片缺失", font=_font(14), fill=C_SUB)
        d.rectangle([box[0], box[1], box[2] - 1, box[3] - 1], outline=(60, 90, 130))

        x = 470
        cat_name = {"suspect": "重点关注", "staff": "内部员工", "vip": "访客白名单"}.get(
            person.get("cat"), "陌生访客")
        d.text((x, 18), person.get("name") or "陌生访客", font=_font(26), fill=C_TEXT)
        d.text((x, 54), "%s · %s" % (cat_name, person.get("code") or "—"),
               font=_font(13), fill=C_SUB)
        sim = ev.get("similarity") or 0
        d.text((x, 78), "相似度 %.1f%%" % (sim * 100), font=_font(15), fill=C_WARN)
        hits = ev.get("history_hits") or 0
        if hits:
            d.text((x, 100), "累计命中 %d 次" % hits, font=_font(13), fill=C_DANGER)

        # 四个处置按钮（底部留出提示条空间）
        y = 122
        for rid, label, color in RES_BTNS:
            r = [x, y, W - 16, y + 56]
            d.rounded_rectangle(r, radius=10, fill=color, outline=None)
            d.text((x + 16, y + 17), label, font=_font(18), fill=(255, 255, 255))
            d.text((W - 42, y + 17), "›", font=_font(20), fill=(255, 255, 255))
            self._rects.append((r[0], r[1], r[2], r[3], rid))
            y += 64

        # 关闭
        r = [x, y + 2, W - 16, y + 36]
        d.rounded_rectangle(r, radius=8, outline=(70, 100, 140), width=1)
        d.text((x + 16, y + 12), "稍后处理", font=_font(13), fill=C_SUB)
        self._rects.append((r[0], r[1], r[2], r[3], "close"))

    def _load_snapshot(self, ev):
        """加载抓拍缩略图。**带缓存**：同一张图只解码一次。

        K1 上一次 1080p 的 Image.open+thumbnail 要 150~300ms，而 detail 界面
        每秒要重画好几次 —— 不去缓存的话「点查看记录」会卡半秒以上才出画面。
        另外用 JPEG draft 让解码器直接按 1/2、1/4 分辨率出图，快 3~5 倍。
        """
        key = ev.get("snapshot_key") or ""
        path = key if os.path.isabs(key) else os.path.join(self.cfg.get("captures", "."), key)
        cache = getattr(self, "_snap_cache", None)
        if cache is None:
            cache = self._snap_cache = {}
        if path in cache:
            return cache[path]
        if not os.path.isfile(path):
            return None
        try:
            tw, th = 440 - 24, 400 - 24
            im = Image.open(path)
            try:
                im.draft("RGB", (tw * 2, th * 2))   # JPEG 快速降采样解码
            except Exception:
                pass
            im = im.convert("RGB")
            im.thumbnail((tw, th))
            canvas = Image.new("RGB", (tw, th), C_BG2)
            canvas.paste(im, ((tw - im.width) // 2, (th - im.height) // 2))
            cache.clear()                # 只保留最近一张，内存可控
            cache[path] = canvas
            return canvas
        except Exception as e:
            print("[lcd] 读取抓拍失败:", e)
            return None

    # ---------------- 按键 ----------------
    def tick(self, key=None):
        """返回 False 表示请求退出主循环。"""
        if self.fb is not None and getattr(self.fb, "ok", False):
            self.render()
            return True
        if not self.show:
            return True
        self.render()
        k = cv2.waitKey(1) & 0xFF if key is None else (key & 0xFF)
        if k in (ord("q"), 27):
            return False
        if k == ord(" ") and self.pending:
            self.open_detail()
        return True

    def close(self):
        if self.show and cv2 is not None:
            try:
                cv2.destroyWindow(self.window)
            except Exception:
                pass
        if self.fb is not None:
            try:
                self.fb.close()
            except Exception:
                pass
