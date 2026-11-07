/* ============================================================
   08 · view · 数据看板
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;

  /* 共享的端侧遥测（内存态，不落库） */
  A.Telemetry = {
    last: null,
    stress: function () {
      var st = S.get();
      var p = S.currentPoint();
      var s = 0;
      if (p.status !== 'online') s += 0.18;
      if (p.resolution === '1080P' && p.fps >= 25) s += 0.06;
      if (st.ui && st.ui.injectSim) s += 0.28;
      return U.clamp(s, 0, 0.9);
    },
    tick: function () {
      A.Telemetry.last = A.Mock.telemetry(A.Telemetry.last, { stress: A.Telemetry.stress() });
      return A.Telemetry.last;
    }
  };

  function hourlyBuckets(hours) {
    var now = new Date();
    var buckets = [];
    for (var i = hours - 1; i >= 0; i--) {
      var h = new Date(now.getTime() - i * 3600e3);
      h.setMinutes(0, 0, 0);
      buckets.push({ start: h.getTime(), label: U.pad(h.getHours()) + ':00', alerts: 0, done: 0 });
    }
    return buckets;
  }
  function dailyBuckets(days) {
    var today = U.day(new Date());
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today.getTime() - i * 864e5);
      out.push({ start: d.getTime(), end: d.getTime() + 864e5, label: U.fmtDateShort(d), alerts: 0, done: 0 });
    }
    return out;
  }

  A.Views = A.Views || {};
  A.Views.dashboard = {
    range: '24h',
    timer: null,
    render: function (root) {
      var st = S.get();
      var stats = S.stats();
      var tel = A.Telemetry.tick();
      var p = S.currentPoint();

      var todayList = st.alerts.filter(function (a) { return U.isToday(a.occurredAt); });
      var yList = st.alerts.filter(function (a) {
        var t = U.day(new Date()); var y = new Date(t.getTime() - 864e5);
        return U.day(new Date(a.occurredAt)).getTime() === y.getTime();
      });
      var delta = todayList.length - yList.length;
      var sparkVals = (function () {
        var b = hourlyBuckets(12);
        st.alerts.forEach(function (a) {
          var t = new Date(a.occurredAt).getTime();
          b.forEach(function (bk) { if (t >= bk.start && t < bk.start + 3600e3) bk.alerts++; });
        });
        return b.map(function (x) { return x.alerts; });
      })();

      root.innerHTML =
        '<div class="view-anim">' +
        '<div class="sec-head"><div><h2>数据看板</h2>' +
        '<p>' + U.esc(st.settings.org.name) + ' · K1 边缘识别巡检平台运行概况</p></div><div class="grow"></div>' +
        '<div class="segmented" id="dashRange">' +
        '<button data-r="24h" class="' + (this.range === '24h' ? 'on' : '') + '">近 24 小时</button>' +
        '<button data-r="7d" class="' + (this.range === '7d' ? 'on' : '') + '">近 7 天</button>' +
        '<button data-r="30d" class="' + (this.range === '30d' ? 'on' : '') + '">近 30 天</button>' +
        '</div>' +
        '<button class="btn" id="dashRefresh">' + I('refresh') + '刷新</button></div>' +

        '<div class="grid-kpi">' +
        kpiCard('今日告警', stats.todayAlerts, '次', 'bell', '#df474d', '#fdecec',
          (delta === 0 ? '与昨日持平' : (delta > 0 ? '<span class="up">↑ ' + delta + ' 次</span> 较昨日' : '<span class="down">↓ ' + Math.abs(delta) + ' 次</span> 较昨日')),
          A.Chart.spark(sparkVals, '#df474d')) +
        kpiCard('待处置', stats.pending, '条', 'alerts', '#e08b06', '#fef4e2',
          (stats.pending ? '<span class="up">需立即核实</span>' : '全部已处置'), '') +
        kpiCard('白名单通行', stats.passToday + (stats.passTotal ? (' / ' + stats.passTotal) : ''), '次', 'check', '#12a06a', '#e3f8ee',
          (stats.passToday ? '今日已识别内部员工 / 访客' : '今日暂无通行记录'), '') +
        kpiCard('陌生访客', stats.strangerToday + (stats.strangerTotal ? (' / ' + stats.strangerTotal) : ''), '人', 'user', '#8b9cb1', '#eef1f5',
          (stats.strangerToday ? '已抓拍待核实' : '今日无陌生人抓拍'), '') +
        kpiCard('人脸库', stats.faces, '人', 'faces', '#1f6feb', '#e8f1ff',
          '已同步云端 ' + stats.synced + ' / ' + stats.faces, '') +
        kpiCard('在线点位', stats.online + '/' + stats.points, '', 'points', '#12a06a', '#e3f8ee',
          '边缘节点 K1 × ' + stats.points, '') +
        '</div>' +

        '<div class="grid-a">' +
        '<div class="card"><div class="card-head"><h3>' + I('activity') + '告警趋势</h3>' +
        '<span class="sub" id="trendSub">' + (this.range === '24h' ? '按小时统计' : '按自然日统计') + '</span>' +
        '<div class="grow"></div><div class="chart-legend"><span><i style="background:#1f6feb"></i>抓拍告警</span>' +
        '<span><i style="background:#12a06a"></i>已完成处置</span></div></div>' +
        '<div class="card-body"><div class="chart-host" id="trendHost"></div>' +
        '<div class="trend-foot" id="trendFoot"></div></div></div>' +

        '<div class="card"><div class="card-head"><h3>' + I('chip') + 'K1 端侧双重算力</h3>' +
        '<span class="sub">CPU × NPU 协同</span><div class="grow"></div>' +
        '<span class="badge ok sm"><i></i>实时</span></div>' +
        '<div class="card-body"><div class="dual">' +
        '<div class="dual-rings">' +
        '<div class="ring-box"><div id="ringCpu"></div><div class="ring-lbl"><b>8× X60 CPU</b>通用算力 · 解码/流转发</div>' +
        '<div class="cores" id="coreBars">' + tel.cores.map(function (c) { return '<i style="--v:' + c + '%"></i>'; }).join('') + '</div></div>' +
        '<div class="ring-box"><div id="ringNpu"></div><div class="ring-lbl"><b>2.0 TOPS NPU</b>AI 算力 · 检测/比对</div>' +
        '<div class="tops-track"><i id="topsFill" style="width:' + tel.npu + '%"></i></div>' +
        '<div class="tops-lbl">INT8 · 2.0 TOPS 算力池</div></div>' +
        '</div>' +
        '<div class="dual-flow">' +
        '<div class="step"><b>MIPI 采集</b><span>1080P@' + p.fps + 'fps</span></div>' +
        '<div class="arrow">' + I('right') + '</div>' +
        '<div class="step"><b>CPU 预处理</b><span>解码 / 缩放</span></div>' +
        '<div class="arrow">' + I('right') + '</div>' +
        '<div class="step"><b>NPU 推理</b><span>检测+512维</span></div>' +
        '<div class="arrow">' + I('right') + '</div>' +
        '<div class="step"><b>比对上报</b><span>告警 / 上云</span></div>' +
        '</div>' +
        '<div class="dual-metrics">' +
        '<div><b id="mFps">' + tel.fps + '</b><span>推理帧率 FPS</span></div>' +
        '<div><b id="mInfer">' + tel.inferMs + '<small style="font-size:10px;font-weight:500">ms</small></b><span>单帧推理时延</span></div>' +
        '<div><b id="mTemp">' + tel.temp + '<small style="font-size:10px;font-weight:500">℃</small></b><span>SoC 温度</span></div>' +
        '</div>' +
        '<div class="note" style="margin-top:2px">' + I('info') +
        '<div>双引擎并行：CPU 侧独立线程完成视频解码与流转发，NPU 侧以 INT8 量化模型执行人脸检测与 512 维特征提取，' +
        '两者通过共享内存零拷贝交互，单帧端到端时延 ≈ ' + (tel.decodeMs + tel.inferMs + tel.matchMs).toFixed(1) + ' ms。</div></div>' +
        '</div></div></div>' +
        '</div>' +

        '<div class="grid-b">' +
        '<div class="card"><div class="card-head"><h3>' + I('points') + '巡检点危险告警分布</h3>' +
        '<div class="grow"></div><span class="sub">近 7 天 · 仅布控人员</span></div>' +
        '<div class="card-body"><div class="chart-host" id="pointBars"></div></div></div>' +
        '<div class="card"><div class="card-head"><h3>' + I('target') + '识别事件构成</h3>' +
        '<div class="grow"></div><span class="sub">按人员分类</span></div>' +
        '<div class="card-body" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">' +
        '<div id="catDonut"></div><div id="catLegend" style="flex:1;min-width:130px"></div></div></div>' +
        '</div>' +

        '<div class="grid-c">' +
        '<div class="card"><div class="card-head"><h3>' + I('bell') + '最新告警</h3>' +
        '<div class="grow"></div><a class="btn ghost sm" href="#/alerts">查看全部' + I('right') + '</a></div>' +
        '<div class="feed" id="latestFeed"></div></div>' +
        '<div class="card"><div class="card-head"><h3>' + I('shield') + '设备与存储</h3>' +
        '<div class="grow"></div><a class="btn ghost sm" href="#/cloud">云配置' + I('right') + '</a></div>' +
        '<div class="card-body">' + devicePanel(st) + '</div></div>' +
        '</div>' +
        '</div>';

      /* 图表 */
      var buckets = this.range === '24h' ? hourlyBuckets(24) : (this.range === '7d' ? dailyBuckets(7) : dailyBuckets(30));
      st.alerts.forEach(function (a) {
        var t = new Date(a.occurredAt).getTime();
        buckets.forEach(function (b) {
          var end = b.end || (b.start + 3600e3);
          if (t >= b.start && t < end) {
            b.alerts++;
            if (a.status === 'confirmed' || a.status === 'false') b.done++;
          }
        });
      });
      A.Chart.line(U.q('#trendHost'), {
        height: 262, unit: ' 次',
        labels: buckets.map(function (b) { return b.label; }),
        series: [
          { name: '抓拍告警', color: '#1f6feb', values: buckets.map(function (b) { return b.alerts; }),
            marks: buckets.map(function (b, i) { return b.alerts > 0 ? i : -1; }).filter(function (i) { return i >= 0; }) },
          { name: '已处置', color: '#12a06a', values: buckets.map(function (b) { return b.done; }),
            marks: buckets.map(function (b, i) { return b.done > 0 ? i : -1; }).filter(function (i) { return i >= 0; }) }
        ]
      });

      var totalA = buckets.reduce(function (n, b) { return n + b.alerts; }, 0);
      var totalD = buckets.reduce(function (n, b) { return n + b.done; }, 0);
      var peak = buckets.slice().sort(function (a, b) { return b.alerts - a.alerts; })[0];
      var rate = totalA ? Math.round(totalD / totalA * 100) : 0;
      U.q('#trendFoot').innerHTML =
        miniStat('区间告警', totalA + ' 次') +
        miniStat('已完成处置', totalD + ' 次 · ' + rate + '%') +
        miniStat('峰值时段', peak && peak.alerts ? peak.label + '（' + peak.alerts + ' 次）' : '—') +
        miniStat('点位覆盖率', (st.points.filter(function (p) { return st.alerts.some(function (a) { return a.pointId === p.id; }); }).length) + '/' + st.points.length);

      var pItems = st.points.map(function (pt) {
        var n = st.alerts.filter(function (a) { return a.pointId === pt.id && U.inLastHours(a.occurredAt, 168); }).length;
        return { label: pt.name, value: n, color: pt.status === 'online' ? '#1f6feb' : '#a9b8c9' };
      }).sort(function (a, b) { return b.value - a.value; });
      A.Chart.barsH(U.q('#pointBars'), { items: pItems, rowH: 33, labelW: 96, unit: '' });

      var catItems = S.CATS.map(function (c) {
        return { label: c.name, color: c.color, value: st.archives.filter(function (a) { return a.cat === c.id; }).length };
      });
      A.Chart.donut(U.q('#catDonut'), { size: 156, items: catItems, center: { value: String(st.archives.length), label: '识别总数' } });
      U.q('#catLegend').innerHTML = catItems.map(function (c) {
        var total = st.alerts.length || 1;
        return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px">' +
          '<i style="width:8px;height:8px;border-radius:2px;background:' + c.color + '"></i>' +
          '<span style="flex:1;color:var(--text-2)">' + c.label + '</span>' +
          '<b style="font-variant-numeric:tabular-nums">' + c.value + '</b>' +
          '<span style="color:var(--text-3);font-size:11px;width:38px;text-align:right">' + U.round(c.value / total * 100, 0) + '%</span></div>';
      }).join('');

      /* 最新告警 */
      var latest = st.alerts.slice().sort(function (a, b) { return new Date(b.occurredAt) - new Date(a.occurredAt); }).slice(0, 5);
      U.q('#latestFeed').innerHTML = latest.length ? latest.map(function (a) {
        return '<div class="feed-item" data-alert="' + a.id + '">' +
          '<img src="' + a.snapshot + '" alt="">' +
          '<div class="fi-main"><b>' + U.esc(a.personName) + ' ' + A.UI.statusBadge(a.status) + '</b>' +
          '<span>' + U.esc(a.pointName) + ' · 相似度 ' + (a.similarity * 100).toFixed(1) + '%</span></div>' +
          '<div class="fi-time">' + U.timeShortSafe(a.occurredAt) + '</div></div>';
      }).join('') : A.UI.emptyBox('暂无告警', 'K1 端侧尚未上报识别事件');

      U.on(root, 'click', '.feed-item', function (e, t) { A.Router.go('alerts', { alert: t.getAttribute('data-alert') }); });

      /* 交互 */
      U.qa('#dashRange button').forEach(function (b) {
        b.addEventListener('click', function () {
          A.Views.dashboard.range = b.getAttribute('data-r');
          A.Views.dashboard.render(root);
        });
      });
      U.q('#dashRefresh').addEventListener('click', function () {
        A.Views.dashboard.render(root);
        A.UI.toast({ type: 'ok', title: '看板已刷新', desc: '已同步端侧最新遥测与告警数据' });
      });

      /* 实时刷新算力面板 */
      A.Views.dashboard.paintRings(tel);
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(function () {
        if (!U.q('#ringCpu')) { clearInterval(A.Views.dashboard.timer); return; }
        var t2 = A.Telemetry.tick();
        A.Views.dashboard.paintRings(t2);
        var sp = U.q('#sideLoad');
        if (sp) sp.textContent = 'CPU ' + t2.cpu + '% · NPU ' + t2.npu + '%';
      }, 2000);
    },

    paintRings: function (tel) {
      var c = U.q('#ringCpu'), n = U.q('#ringNpu');
      if (c) A.Chart.ring(c, { size: 104, value: tel.cpu / 100, color: '#1f6feb', text: tel.cpu + '%', sub: 'CPU 负载', thickness: 9 });
      if (n) A.Chart.ring(n, { size: 104, value: tel.npu / 100, color: '#0aa6bd', text: tel.npu + '%', sub: 'NPU 负载', thickness: 9 });
      var cb = U.q('#coreBars');
      if (cb) cb.innerHTML = tel.cores.map(function (v) { return '<i style="--v:' + v + '%"></i>'; }).join('');
      var tf = U.q('#topsFill'); if (tf) tf.style.width = tel.npu + '%';
      var f = U.q('#mFps'); if (f) f.textContent = tel.fps;
      var inf = U.q('#mInfer'); if (inf) inf.innerHTML = tel.inferMs + '<small style="font-size:10px;font-weight:500">ms</small>';
      var tp = U.q('#mTemp'); if (tp) tp.innerHTML = tel.temp + '<small style="font-size:10px;font-weight:500">℃</small>';
    },

    cleanup: function () { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  };

  /* 辅助片段 */
  U.timeShortSafe = function (d) { return U.isToday(d) ? U.fmtTimeShort(d) : U.fmtDateShort(d); };

  function kpiCard(label, val, unit, ico, color, soft, foot, spark) {
    return '<div class="card kpi">' +
      '<div class="kpi-top">' + label + '<span class="kpi-ico" style="background:' + soft + ';color:' + color + '">' + I(ico) + '</span></div>' +
      '<div class="kpi-val">' + val + (unit ? '<small>' + unit + '</small>' : '') +
      (spark ? '<span class="kpi-spark">' + spark + '</span>' : '') + '</div>' +
      '<div class="kpi-foot">' + foot + '</div></div>';
  }

  function miniStat(label, val) {
    return '<div><span>' + label + '</span><b>' + val + '</b></div>';
  }

  function devicePanel(st) {
    var usage = A.Cloud.estimateUsage();
    var pct = U.clamp(usage.bytes / usage.quota * 100, 0.4, 100);
    var rows = st.points.slice(0, 5).map(function (p) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px">' +
        '<i style="width:6px;height:6px;border-radius:50%;background:' + (S.POINT_STATUS[p.status] || {}).color + '"></i>' +
        '<span style="flex:1;color:var(--text-2)">' + U.esc(p.name) + '</span>' +
        '<span class="mono" style="font-size:10.5px;color:var(--text-3)">' + U.esc(p.k1Sn) + '</span></div>';
    }).join('');
    return '<div style="display:flex;flex-direction:column;gap:2px">' + rows + '</div>' +
      '<div class="divider"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;margin-bottom:6px">' +
      '<span class="muted">云端存储用量</span><b class="num">' + U.fmtBytes(usage.bytes) + '</b></div>' +
      '<div class="progress thin"><i style="width:' + pct + '%;background:linear-gradient(90deg,#4c9aff,#1f6feb)"></i></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-3);margin-top:5px">' +
      '<span>OBS 配额 5 GB</span><span>归档 ' + st.archives.length + ' 条 · 人脸 ' + st.faces.length + ' 张</span></div>' +
      '<div class="note" style="margin-top:12px">' + I(st.cloud.enabled ? 'cloud' : 'database') +
      '<div>' + (st.cloud.enabled
        ? '状态快照已接入华为云 OBS：' + (st.cloud.obs.bucket || '—') + '，最近同步 ' + (st.cloud.lastSyncAt ? U.ago(st.cloud.lastSyncAt) : '尚未同步')
        : '当前为<strong>本地演示模式</strong>，数据保存在浏览器本地。在「华为云对接」中填入 OBS 配置即可开启云端持久化。') +
      '</div></div>';
  }
})(window.App);
