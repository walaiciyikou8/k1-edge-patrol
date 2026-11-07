# -*- coding: utf-8 -*-
"""直接写 Linux framebuffer（/dev/fbN）的极简显示后端。

用途：板上没有桌面、X 起不来、或者 OpenCV 是 headless 版时，
把 800×480 的界面直接怼到面板上，不依赖 X / Wayland / 任何 GUI 库。

用法::

    from k1edge.fbdev import FbDev
    fb = FbDev()                 # 自动挑一块 800×480 的 fb
    fb.show(pil_image)           # PIL "RGB" 图

支持 32bpp（XRGB8888/BGRA）与 16bpp（RGB565），会自动按 line_length 处理行对齐。
"""
import glob
import mmap
import os
import struct

try:
    import numpy as np
except Exception:                                     # pragma: no cover
    np = None

SYS = "/sys/class/graphics"


def list_fbs():
    """列出所有 fb 的概要：[(name, path, w, h, bpp)]。"""
    out = []
    for d in sorted(glob.glob(os.path.join(SYS, "fb*"))):
        name = os.path.basename(d)
        try:
            with open(os.path.join(d, "virtual_size")) as f:
                vw, vh = [int(x) for x in f.read().strip().split(",")[:2]]
        except Exception:
            vw = vh = 0
        try:
            with open(os.path.join(d, "bits_per_pixel")) as f:
                bpp = int(f.read().strip())
        except Exception:
            bpp = 0
        out.append((name, "/dev/" + name, vw, vh, bpp))
    return out


def pick_fb(prefer_w=800, prefer_h=480):
    """挑一块最可能是小屏的 fb：优先尺寸匹配，其次 bpp 合理。"""
    cands = list_fbs()
    if not cands:
        return None
    exact = [c for c in cands if c[2] == prefer_w and c[3] == prefer_h and c[4] in (16, 32)]
    if exact:
        return exact[0]
    big = [c for c in cands if c[2] >= prefer_w * prefer_h // 4 and c[4] in (16, 32)]
    pool = big or [c for c in cands if c[4] in (16, 32)] or cands
    # 选面积最小的一块（小屏通常分辨率最低）
    pool.sort(key=lambda c: c[2] * c[3])
    return pool[0]


def _to_bgra(img):
    """PIL RGB -> 32bpp 小端 BGRA 字节（XRGB8888 常见布局）。"""
    a = np.array(img.convert("RGB"), dtype=np.uint8)      # H,W,3  (R,G,B)
    h, w = a.shape[:2]
    out = np.empty((h, w, 4), dtype=np.uint8)
    out[..., 0] = a[..., 2]                                # B
    out[..., 1] = a[..., 1]                                # G
    out[..., 2] = a[..., 0]                                # R
    out[..., 3] = 255                                      # X
    return out.tobytes(), w * 4


def _to_rgb565(img):
    """PIL RGB -> 16bpp RGB565 小端字节。"""
    a = np.array(img.convert("RGB"), dtype=np.uint16)
    r = (a[..., 0] >> 3) & 0x1F
    g = (a[..., 1] >> 2) & 0x3F
    b = (a[..., 2] >> 3) & 0x1F
    v = ((r << 11) | (g << 5) | b).astype("<u2")
    h, w = v.shape[:2]
    return v.tobytes(), w * 2


class FbDev:
    """一个 framebuffer 设备。失败时 ok=False，调用方降级即可。"""

    def __init__(self, dev=None, width=800, height=480, verbose=True):
        self.ok = False
        self.dev = None
        self.w = self.h = 0
        self.bpp = 0
        self.stride = 0
        self._fd = None
        self._map = None
        if np is None:
            if verbose:
                print("[fb] 缺少 numpy，无法使用 framebuffer 模式")
            return

        info = None
        if dev:
            name = os.path.basename(dev)
            for c in list_fbs():
                if c[0] == name:
                    info = c
                    break
            if info is None:
                info = (name, dev, width, height, 32)
        else:
            info = pick_fb(width, height)

        if not info:
            if verbose:
                print("[fb] 未找到任何 framebuffer（/sys/class/graphics 里没有 fb*）")
            return

        name, path, vw, vh, bpp = info
        try:
            with open(os.path.join(SYS, name, "stride")) as f:
                self.stride = int(f.read().strip())
        except Exception:
            self.stride = vw * (bpp // 8 if bpp else 4)
        try:
            with open(os.path.join(SYS, name, "size")) as f:
                self.size = int(f.read().strip(), 16)
        except Exception:
            self.size = self.stride * vh

        if bpp not in (16, 32):
            if verbose:
                print("[fb] %s 是 %dbpp，暂不支持（只支持 16/32）" % (path, bpp))
            return

        try:
            self._fd = os.open(path, os.O_RDWR)
            self._map = mmap.mmap(self._fd, self.size, mmap.MAP_SHARED,
                                  mmap.PROT_READ | mmap.PROT_WRITE)
        except Exception as e:
            if verbose:
                print("[fb] 打开 %s 失败: %s" % (path, e))
            return

        self.dev, self.w, self.h, self.bpp = path, vw, vh, bpp
        self.ok = True
        if verbose:
            print("[fb] 使用 %s  %dx%d  %dbpp  stride=%d  总 %d 字节"
                  % (path, vw, vh, bpp, self.stride, self.size))

    # ------------------------------------------------------------------
    def _fit(self, img):
        """把任意尺寸的图贴到 fb 尺寸（等比缩放 + 居中留黑）。"""
        from PIL import Image
        if img.size == (self.w, self.h):
            return img.convert("RGB")
        canvas = Image.new("RGB", (self.w, self.h), (0, 0, 0))
        s = min(self.w / float(img.size[0]), self.h / float(img.size[1]))
        nw, nh = max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s))
        canvas.paste(img.convert("RGB").resize((nw, nh), Image.LANCZOS),
                     ((self.w - nw) // 2, (self.h - nh) // 2))
        return canvas

    def show(self, img):
        if not self.ok or img is None:
            return False
        try:
            img = self._fit(img)
            raw, row = (_to_bgra(img) if self.bpp == 32 else _to_rgb565(img))
            if row == self.stride:
                self._map.seek(0)
                self._map.write(raw)
            else:                                    # 逐行写，处理行对齐
                for y in range(self.h):
                    off = y * self.stride
                    self._map[off:off + row] = raw[y * row:(y + 1) * row]
            return True
        except Exception as e:
            print("[fb] 写屏失败:", e)
            return False

    def fill(self, rgb=(0, 0, 0)):
        from PIL import Image
        return self.show(Image.new("RGB", (self.w, self.h), rgb))

    def close(self):
        try:
            if self._map:
                self._map.close()
        except Exception:
            pass
        try:
            if self._fd is not None:
                os.close(self._fd)
        except Exception:
            pass
        self._map = None
        self._fd = None
        self.ok = False

    def __repr__(self):
        return "<FbDev %s %dx%d %dbpp ok=%s>" % (self.dev, self.w, self.h, self.bpp, self.ok)
