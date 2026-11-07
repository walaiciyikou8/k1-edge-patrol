/* ============================================================
   00 · util —— 通用工具
   ============================================================ */
window.App = window.App || {};
(function (A) {
  var U = {};

  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.pad = function (n, len) { n = String(n); while (n.length < (len || 2)) n = '0' + n; return n; };
  U.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  U.uid = function (p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  U.round = function (v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; };

  U.hash = function (str) {
    var h = 2166136261;
    for (var i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  U.rng = function (seed) {
    var a = typeof seed === 'number' ? seed : U.hash(seed);
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  /* ---- 时间 ---- */
  U.day = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  U.daysAgo = function (d, n) { return new Date(d.getTime() - n * 864e5); };
  U.fmtDate = function (d) { d = new Date(d); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); };
  U.fmtDateShort = function (d) { d = new Date(d); return U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); };
  U.fmtTime = function (d) { d = new Date(d); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()) + ':' + U.pad(d.getSeconds()); };
  U.fmtTimeShort = function (d) { d = new Date(d); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); };
  U.fmtDT = function (d) { d = new Date(d); return U.fmtDate(d) + ' ' + U.fmtTimeShort(d); };
  U.stamp = function (d) {
    d = new Date(d);
    return d.getFullYear() + U.pad(d.getMonth() + 1) + U.pad(d.getDate()) + '_' +
      U.pad(d.getHours()) + U.pad(d.getMinutes()) + U.pad(d.getSeconds());
  };
  U.weekday = function (d) { return '日一二三四五六'[new Date(d).getDay()]; };
  U.dayLabel = function (d) {
    var t = U.day(new Date()), x = U.day(new Date(d)), diff = Math.round((t - x) / 864e5);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    return U.fmtDate(d);
  };
  U.ago = function (d) {
    var s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' 天前';
    return U.fmtDate(d);
  };
  U.hourOf = function (d) { return new Date(d).getHours(); };
  U.isToday = function (d) {
    var a = U.day(new Date()), b = U.day(new Date(d));
    return a.getTime() === b.getTime();
  };
  U.inLastHours = function (d, h) { return Date.now() - new Date(d).getTime() <= h * 3600e3; };

  /* ---- 数字 / 字节 ---- */
  U.fmtBytes = function (b) {
    if (!b && b !== 0) return '—';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0, v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
  };
  U.fmtNum = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  U.fmtPct = function (v, d) { return (v * 100).toFixed(d === undefined ? 0 : d) + '%'; };

  /* ---- DOM ---- */
  U.q = function (sel, root) { return (root || document).querySelector(sel); };
  U.qa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.on = function (root, evt, sel, fn) {
    /* 同一 (root,evt,sel) 只保留一个实际监听，避免多次 render 时监听叠加
       —— 否则点一次人员会触发多次 openDetail，叠出多层遮罩、要连点多次才能退出 */
    var key = '__on_' + evt + '_' + sel;
    (root[key] || []).forEach(function (h) { root.removeEventListener(evt, h); });
    var handler = function (e) {
      var t = e.target.closest(sel);
      if (t && root.contains(t)) fn.call(t, e, t);
    };
    root[key] = [handler];
    root.addEventListener(evt, handler);
  };
  U.node = function (html) {
    var d = document.createElement('div');
    d.innerHTML = String(html).trim();
    return d.firstElementChild;
  };

  /* ---- 函数 ---- */
  U.debounce = function (fn, wait) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, wait || 200); };
  };
  U.throttle = function (fn, wait) {
    var last = 0, t;
    return function () {
      var a = arguments, s = this, now = Date.now();
      if (now - last >= wait) { last = now; fn.apply(s, a); }
      else { clearTimeout(t); t = setTimeout(function () { last = Date.now(); fn.apply(s, a); }, wait - (now - last)); }
    };
  };
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---- 文件 / 剪贴板 ---- */
  U.download = function (name, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  };
  U.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove(); return Promise.resolve();
  };
  U.csv = function (rows) {
    return '\ufeff' + rows.map(function (r) {
      return r.map(function (c) {
        var s = c === null || c === undefined ? '' : String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  };
  U.readFile = function (file, as) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      if (as === 'text') r.readAsText(file, 'utf-8'); else r.readAsDataURL(file);
    });
  };
  /* 把图片缩到 maxDim 以内并转 JPEG，控制 localStorage 体积（现场导入手机照片必备） */
  U.shrinkImage = function (dataUrl, maxDim, quality) {
    maxDim = maxDim || 512; quality = quality || 0.85;
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var k = Math.min(1, maxDim / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k));
          c.height = Math.max(1, Math.round(h * k));
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#f2f5f9';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  };

  U.base64Size = function (dataUrl) {
    if (!dataUrl || dataUrl.indexOf('base64,') < 0) return 0;
    var b = dataUrl.split('base64,')[1];
    return Math.round(b.length * 0.75);
  };

  A.U = U;
})(window.App);
