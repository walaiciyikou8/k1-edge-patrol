/* ============================================================
   05 · chart —— 轻量 SVG 图表（无第三方依赖）
   ============================================================ */
(function (A) {
  var U = A.U;
  var tipEl = null;

  function tip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'chart-tip';
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(e, html) {
    var t = tip();
    t.innerHTML = html;
    t.classList.add('on');
    var x = e.clientX + 12, y = e.clientY - 34;
    var w = t.offsetWidth || 120;
    if (x + w > window.innerWidth - 10) x = e.clientX - w - 12;
    t.style.left = x + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('on'); }

  /* 取整刻度：保证 4 条网格线都是整数 */
  function yScale(v) {
    if (!(v > 0)) return 4;
    var rough = v / 4;
    var exp = Math.floor(Math.log10(rough));
    var base = Math.pow(10, exp);
    var n = rough / base;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    step = step * base;
    if (step < 1) step = 1;
    return Math.ceil(step) * 4;
  }

  /* ---------- 折线 / 面积图 ---------- */
  function line(host, opts) {
    var w = Math.max(260, host.clientWidth || 600);
    var h = opts.height || 208;
    var pad = { l: 38, r: 14, t: 16, b: 26 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var series = opts.series || [];
    var labels = opts.labels || [];
    var n = labels.length || (series[0] ? series[0].values.length : 0);
    var allVals = [];
    series.forEach(function (s) { allVals = allVals.concat(s.values); });
    var max = opts.yMax || yScale(Math.max.apply(null, allVals.concat([1])) * 1.1);
    var xOf = function (i) { return pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw); };
    var yOf = function (v) { return pad.t + ih - (v / max) * ih; };

    var s = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img">';
    s += '<defs>';
    series.forEach(function (sr, si) {
      s += '<linearGradient id="lg' + si + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + sr.color + '" stop-opacity=".26"/>' +
        '<stop offset="1" stop-color="' + sr.color + '" stop-opacity="0"/></linearGradient>';
    });
    s += '</defs>';
    /* 网格 */
    for (var g = 0; g <= 4; g++) {
      var gy = pad.t + (ih / 4) * g;
      s += '<line x1="' + pad.l + '" y1="' + gy + '" x2="' + (w - pad.r) + '" y2="' + gy + '" stroke="#e8eff8" stroke-width="1"/>';
      var val = max - (max / 4) * g;
      s += '<text x="' + (pad.l - 8) + '" y="' + (gy + 3.5) + '" font-size="10" fill="#9bacbf" text-anchor="end">' +
        (Math.abs(val - Math.round(val)) < 0.01 ? Math.round(val) : val.toFixed(1)) + '</text>';
    }
    /* x 轴标签 */
    var step = Math.max(1, Math.ceil(n / 8));
    for (var i = 0; i < n; i += step) {
      s += '<text x="' + xOf(i) + '" y="' + (h - 8) + '" font-size="10" fill="#9bacbf" text-anchor="middle">' + U.esc(labels[i]) + '</text>';
    }
    /* 数据 */
    series.forEach(function (sr, si) {
      var pts = sr.values.map(function (v, i) { return [xOf(i), yOf(v)]; });
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + U.round(p[0], 1) + ' ' + U.round(p[1], 1); }).join(' ');
      if (opts.fill !== false) {
        s += '<path d="' + d + ' L' + U.round(xOf(n - 1), 1) + ' ' + (pad.t + ih) + ' L' + U.round(xOf(0), 1) + ' ' + (pad.t + ih) + ' Z" fill="url(#lg' + si + ')"/>';
      }
      s += '<path d="' + d + '" fill="none" stroke="' + sr.color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"' +
        (sr.dash ? ' stroke-dasharray="' + sr.dash + '"' : '') + '/>';
      if (n <= 40) {
        var marks = sr.marks || [];
        pts.forEach(function (p, i) {
          if (marks.length && marks.indexOf(i) < 0) return;
          s += '<circle cx="' + U.round(p[0], 1) + '" cy="' + U.round(p[1], 1) + '" r="' + (marks.length ? 3.4 : 2.4) + '" fill="#fff" stroke="' + sr.color + '" stroke-width="1.8"/>';
        });
      }
    });
    s += '<g class="cx">';
    s += '<line class="cx-line" x1="0" y1="' + pad.t + '" x2="0" y2="' + (pad.t + ih) + '" stroke="#b9cbe0" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>';
    s += '</g>';
    s += '</svg>';
    host.innerHTML = s;

    var svg = host.querySelector('svg');
    var cxLine = svg.querySelector('.cx-line');
    var move = function (e) {
      var r = svg.getBoundingClientRect();
      var rel = (e.clientX - r.left) * (w / r.width);
      var idx = U.clamp(Math.round(((rel - pad.l) / iw) * (n - 1)), 0, n - 1);
      var px = xOf(idx);
      cxLine.setAttribute('x1', px); cxLine.setAttribute('x2', px); cxLine.setAttribute('opacity', '.9');
      var rows = series.map(function (sr) {
        return '<span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:' + sr.color + ';margin-right:5px"></span>' +
          U.esc(sr.name) + ' <b style="margin-left:4px">' + sr.values[idx] + (opts.unit || '') + '</b>';
      }).join('<br>');
      showTip(e, '<b style="font-size:11px;opacity:.75">' + U.esc(labels[idx] || '') + '</b><br>' + rows);
    };
    svg.addEventListener('mousemove', move);
    svg.addEventListener('mouseleave', function () { hideTip(); cxLine.setAttribute('opacity', '0'); });
  }

  /* ---------- 横向条形 ---------- */
  function barsH(host, opts) {
    var items = opts.items || [];
    var w = Math.max(240, host.clientWidth || 400);
    var rowH = opts.rowH || 34;
    var h = items.length * rowH + 8;
    var labelW = opts.labelW || 92;
    var valW = 46;
    var max = opts.max || Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var s = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">';
    items.forEach(function (it, i) {
      var y = i * rowH + 7;
      var bw = Math.max(3, ((w - labelW - valW - 16) * it.value) / max);
      s += '<text x="0" y="' + (y + 13) + '" font-size="11.5" fill="#54677f">' + U.esc(it.label) + '</text>';
      s += '<rect x="' + labelW + '" y="' + (y + 3) + '" width="' + (w - labelW - valW - 16) + '" height="9" rx="4.5" fill="#eef4fb"/>';
      s += '<rect x="' + labelW + '" y="' + (y + 3) + '" width="' + bw + '" height="9" rx="4.5" fill="' + (it.color || '#1f6feb') + '"/>';
      s += '<text x="' + (w - 2) + '" y="' + (y + 13) + '" font-size="11.5" fill="#0e1c30" text-anchor="end" font-weight="600">' + it.value + (opts.unit || '') + '</text>';
    });
    s += '</svg>';
    host.innerHTML = s;
  }

  /* ---------- 环形占比 ---------- */
  function donut(host, opts) {
    var size = Math.min(opts.size || 168, Math.max(140, host.clientWidth || 168));
    var items = (opts.items || []).filter(function (i) { return i.value > 0; });
    var total = items.reduce(function (a, b) { return a + b.value; }, 0) || 1;
    var r = size / 2 - 12, cx = size / 2, cy = size / 2;
    var C = 2 * Math.PI * r;
    var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eef4fb" stroke-width="15"/>';
    var acc = 0;
    items.forEach(function (it) {
      var frac = it.value / total;
      var dash = frac * C;
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + it.color + '" stroke-width="15"' +
        ' stroke-dasharray="' + (dash - 2).toFixed(1) + ' ' + (C - dash + 2).toFixed(1) + '"' +
        ' stroke-dashoffset="' + (-acc * C).toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      acc += frac;
    });
    if (opts.center) {
      s += '<text x="' + cx + '" y="' + (cy - 1) + '" text-anchor="middle" font-size="21" font-weight="700" fill="#0e1c30">' + U.esc(opts.center.value) + '</text>';
      s += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="10.5" fill="#8b9cb1">' + U.esc(opts.center.label) + '</text>';
    }
    s += '</svg>';
    host.innerHTML = s;
  }

  /* ---------- 圆环仪表 ---------- */
  function ring(host, opts) {
    var size = opts.size || 108;
    var stroke = opts.thickness || 8;
    var v = U.clamp(opts.value || 0, 0, 1);
    var r = size / 2 - stroke / 2 - 2, cx = size / 2, cy = size / 2;
    var C = 2 * Math.PI * r;
    var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (opts.track || '#eaf1f9') + '" stroke-width="' + stroke + '"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (opts.color || '#1f6feb') + '" stroke-width="' + stroke + '"' +
      ' stroke-linecap="round" stroke-dasharray="' + (C * v).toFixed(1) + ' ' + C.toFixed(1) + '"' +
      ' transform="rotate(-90 ' + cx + ' ' + cy + ')" style="transition:stroke-dasharray .7s cubic-bezier(.2,.8,.2,1)"/>';
    s += '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" font-size="' + Math.round(size * 0.2) + '" font-weight="700" fill="#0e1c30">' + U.esc(opts.text || '') + '</text>';
    if (opts.sub) s += '<text x="' + cx + '" y="' + (cy + 21) + '" text-anchor="middle" font-size="9.5" fill="#8b9cb1">' + U.esc(opts.sub) + '</text>';
    s += '</svg>';
    host.innerHTML = s;
  }

  /* ---------- 迷你趋势 ---------- */
  function spark(values, color, w, h) {
    w = w || 100; h = h || 38;
    var max = Math.max.apply(null, values.concat([1])), min = Math.min.apply(null, values);
    var span = Math.max(1, max - min);
    var pts = values.map(function (v, i) {
      return [U.round((i / (values.length - 1 || 1)) * w, 1), U.round(h - 3 - ((v - min) / span) * (h - 8), 1)];
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
    var gid = 'sp' + Math.random().toString(36).slice(2, 7);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<path d="' + d + ' L' + w + ' ' + h + ' L0 ' + h + ' Z" fill="url(#' + gid + ')"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }

  A.Chart = { line: line, barsH: barsH, donut: donut, ring: ring, spark: spark, hideTip: hideTip };
})(window.App);
