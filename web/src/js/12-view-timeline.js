/* ============================================================
   12 · view · 时间轴归档
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;
  var state = { range: '7d', point: 'all', person: 'all', kind: 'all', q: '' };
  var playTimer = null, playIdx = 0;

  function filtered() {
    var st = S.get();
    var out = st.archives.slice();
    if (state.range !== 'all') {
      var days = state.range === 'today' ? 0 : parseInt(state.range, 10);
      var limit = Date.now() - days * 864e5;
      out = out.filter(function (a) { return new Date(a.occurredAt).getTime() >= limit; });
    }
    if (state.point !== 'all') out = out.filter(function (a) { return a.pointId === state.point; });
    if (state.person !== 'all') out = out.filter(function (a) { return a.faceId === state.person; });
    if (state.kind !== 'all') out = out.filter(function (a) { return a.kind === state.kind; });
    if (state.q) {
      var q = state.q.toLowerCase();
      out = out.filter(function (a) {
        return (a.personName + ' ' + a.pointName + ' ' + a.fileKey + ' ' + (a.note || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    return out.sort(function (a, b) { return new Date(b.occurredAt) - new Date(a.occurredAt); });
  }

  function groupByDay(items) {
    var map = {}, order = [];
    items.forEach(function (a) {
      var d = U.fmtDate(a.occurredAt);
      if (!map[d]) { map[d] = []; order.push(d); }
      map[d].push(a);
    });
    return order.map(function (d) { return { day: d, items: map[d] }; });
  }

  function render(root) {
    stopPlay();
    var st = S.get();
    var data = filtered();
    var groups = groupByDay(data);
    var persons = {};
    data.forEach(function (a) { persons[a.faceId] = 1; });
    var points = {};
    data.forEach(function (a) { points[a.pointId] = 1; });
    var bytes = data.reduce(function (n, a) { return n + (a.size || 0); }, 0);

    root.innerHTML =
      '<div class="view-anim">' +
      '<div class="sec-head"><div><h2>时间轴归档</h2>' +
      '<p>按「时间 + 地点 + 人名」命名的抓拍证据，按日聚合归档可回溯</p></div><div class="grow"></div>' +
      '<div class="btn-group">' +
      '<button class="btn" id="tlPlay">' + I('play') + '时间轴回放</button>' +
      '<button class="btn" id="tlExport">' + I('download') + '导出清单</button>' +
      '</div></div>' +

      '<div class="tl-stats">' +
      stat('归档总数', data.length + ' <small style="font-size:12px;color:var(--text-3)">条</small>', 'archive') +
      stat('涉及点位', Object.keys(points).length + ' <small style="font-size:12px;color:var(--text-3)">个</small>', 'pin') +
      stat('涉及人员', Object.keys(persons).length + ' <small style="font-size:12px;color:var(--text-3)">人</small>', 'user') +
      stat('存储占用', U.fmtBytes(bytes), 'cloud') +
      '</div>' +

      '<div class="card"><div class="card-head" style="gap:9px">' +
      '<div class="segmented" id="tlRange">' +
      [['today', '今天'], ['7d', '近 7 天'], ['30d', '近 30 天'], ['all', '全部']].map(function (r) {
        return '<button data-r="' + r[0] + '" class="' + (state.range === r[0] ? 'on' : '') + '">' + r[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="segmented" id="tlKind">' +
      [['all', '全部'], ['alert', '危险告警'], ['pass', '正常通行'], ['stranger', '陌生访客']].map(function (r) {
        return '<button data-k="' + r[0] + '" class="' + (state.kind === r[0] ? 'on' : '') + '">' + r[1] + '</button>';
      }).join('') + '</div>' +
      '<select class="select" id="tlPoint" style="width:auto">' +
      '<option value="all">全部点位</option>' +
      st.points.map(function (p) { return '<option value="' + p.id + '"' + (state.point === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="tlPerson" style="width:auto">' +
      '<option value="all">全部人员</option>' +
      st.faces.map(function (f) { return '<option value="' + f.id + '"' + (state.person === f.id ? ' selected' : '') + '>' + U.esc(f.name) + '</option>'; }).join('') + '</select>' +
      '<div class="search-box" style="flex:1;min-width:170px;max-width:260px">' + I('search') +
      '<input class="input" id="tlSearch" placeholder="搜索文件名 / 备注" value="' + U.esc(state.q) + '"></div>' +
      '<div class="grow"></div><span class="sub">' + data.length + ' 条记录</span></div>' +
      '<div class="card-body">' +
      (data.length ? '<div class="tl-list" id="tlList">' + groups.map(function (g) {
        return '<div class="tl-day"><div class="tl-day-head"><b>' + U.dayLabel(g.day + ' 00:00:00') + '</b>' +
          '<span>' + g.day + ' · 周' + U.weekday(g.day + ' 00:00:00') + ' · ' + g.items.length + ' 条</span><i class="line"></i></div>' +
          g.items.map(itemHtml).join('') + '</div>';
      }).join('') + '</div>'
        : A.UI.emptyBox('没有归档记录', '在告警中心处置告警后会自动生成时间轴归档', 'timeline')) +
      '</div></div></div>';

    /* 事件 */
    U.qa('#tlRange button').forEach(function (b) {
      b.addEventListener('click', function () { state.range = b.getAttribute('data-r'); render(root); });
    });
    U.qa('#tlKind button').forEach(function (b) {
      b.addEventListener('click', function () { state.kind = b.getAttribute('data-k'); render(root); });
    });
    U.q('#tlPoint').addEventListener('change', function (e) { state.point = e.target.value; render(root); });
    U.q('#tlPerson').addEventListener('change', function (e) { state.person = e.target.value; render(root); });
    var si = U.q('#tlSearch');
    si.addEventListener('input', U.debounce(function () {
      state.q = si.value; render(root);
      var n = U.q('#tlSearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    }, 240));
    U.on(root, 'click', '.tl-item', function (e, t) { preview(t.getAttribute('data-arc')); });
    U.q('#tlPlay').addEventListener('click', function () {
      if (playTimer) { stopPlay(); render(root); A.UI.toast({ type: 'info', title: '回放已停止' }); return; }
      startPlay(data, root);
    });
    U.q('#tlExport').addEventListener('click', function () { exportCsv(data); });
  }

  function stat(label, val, ico) {
    return '<div class="tl-stat"><span>' + I(ico) + ' ' + label + '</span><b>' + val + '</b></div>';
  }

  function kindTag(k) {
    var m = { alert: ['危险告警', 'danger'], pass: ['正常通行', 'ok'], stranger: ['陌生访客', 'muted'] }[k] || ['归档', ''];
    return '<span class="badge ' + m[1] + ' sm">' + m[0] + '</span>';
  }
  function itemHtml(a) {
    var fname = a.fileKey.split('/').pop();
    var phoneHtml = a.thumb
      ? '<img src="' + U.esc(a.thumb) + '" alt="">'
      : '<div class="tl-ph">' + I('image') + '</div>';
    return '<div class="tl-item" data-arc="' + a.id + '">' +
      phoneHtml +
      '<div class="tl-main"><b>' + kindTag(a.kind) + U.esc(a.personName) + A.UI.catBadge(a.cat) +
      (a.resolutionName && a.kind === 'alert'
        ? '<span class="badge ' + S.resById(a.resolution).badge + ' sm">' + U.esc(a.resolutionName) + '</span>' : '') +
      '<span class="badge ' + (a.uploaded ? 'ok' : 'warn') + ' sm">' + (a.uploaded ? '已上云' : '待上传') + '</span></b>' +
      '<div class="fname" title="' + U.esc(fname) + '">' + U.esc(fname) + '</div>' +
      '<div class="tl-meta"><span>' + I('pin') + U.esc(a.pointName) + '</span>' +
      '<span>' + I('image') + (a.size ? U.fmtBytes(a.size) : '—') + '</span>' +
      '<span>' + I('user') + U.esc(a.note || '') + '</span></div></div>' +
      '<div class="tl-time">' + U.fmtTimeShort(a.occurredAt) + '<span>' + U.esc(a.personCode || '') + '</span></div></div>';
  }

  function preview(id) {
    var a = S.get().archives.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var fname = a.fileKey.split('/').pop();
    var alert = a.alertId ? S.get().alerts.filter(function (x) { return x.id === a.alertId; })[0] : null;
    A.UI.modal({
      title: fname,
      sub: a.pointName + ' · ' + U.fmtDT(a.occurredAt),
      size: 'wide',
      body:
        '<div style="border-radius:12px;overflow:hidden;border:1px solid var(--border);margin-bottom:14px">' +
        (a.thumb
          ? '<img src="' + U.esc(a.thumb) + '" style="width:100%;display:block">'
          : '<div style="padding:40px;text-align:center;color:var(--text-3)">该条记录未取到抓拍图</div>') +
        '</div>' +
        '<dl class="kv">' +
        '<dt>归档编号</dt><dd class="mono">' + U.esc(a.id) + '</dd>' +
        '<dt>文件名</dt><dd class="mono" style="font-size:11.5px">' + U.esc(fname) + '</dd>' +
        '<dt>存储对象</dt><dd class="mono" style="font-size:11.5px">' + U.esc(a.fileKey) + '</dd>' +
        '<dt>抓拍时间</dt><dd>' + U.fmtDT(a.occurredAt) + '</dd>' +
        '<dt>归档时间</dt><dd>' + U.fmtDT(a.archivedAt) + '</dd>' +
        '<dt>处置方式</dt><dd>' + (a.resolutionName
          ? '<span class="badge ' + S.resById(a.resolution).badge + ' sm">' + U.esc(a.resolutionName) + '</span>' +
            (a.unit ? ' ' + U.esc(a.unit) : '')
          : '<span style="color:var(--text-3)">—</span>') + '</dd>' +
        '<dt>点位 / 人员</dt><dd>' + U.esc(a.pointName) + ' · ' + U.esc(a.personName) + '（' + U.esc(a.personCode) + '）</dd>' +
        '<dt>文件大小</dt><dd>' + U.fmtBytes(a.size) + '</dd>' +
        '<dt>存储状态</dt><dd>' + (a.uploaded ? '<span class="badge ok">已上传华为云 OBS</span>' : '<span class="badge warn">待上传</span>') + '</dd>' +
        '<dt>备注</dt><dd>' + U.esc(a.note || '—') + '</dd>' +
        '</dl>',
      footer: '<button class="btn" data-act="close">关闭</button>' +
        (alert ? '<button class="btn" data-act="alert">' + I('bell') + '查看原始告警</button>' : '') +
        A.UI.copyBtn(fname, '复制文件名') +
        '<button class="btn primary" data-act="dl">' + I('download') + '下载图片</button>',
      onMount: function (h) {
        A.UI.bindCopy(h.body); A.UI.bindCopy(h.foot);
        h.foot.querySelector('[data-act="close"]').onclick = h.close;
        var al = h.foot.querySelector('[data-act="alert"]');
        if (al) al.onclick = function () { h.close(); A.Router.go('alerts', { alert: a.alertId }); };
        h.foot.querySelector('[data-act="dl"]').onclick = function () {
          if (!a.thumb) {
            A.UI.toast({ type: 'warn', title: '抓拍图不可用', desc: '这条记录没取到图片' });
            return;
          }
          A.Cloud.thumbToBlob(a.thumb).then(function (blob) {
            if (!blob) throw new Error('empty');
            var ext = /png/i.test(blob.type) ? '.png' : '.jpg';
            U.download(fname.replace(/\.\w+$/, '') + ext, blob, blob.type || 'image/jpeg');
            A.UI.toast({ type: 'ok', title: '已开始下载', desc: fname });
          }).catch(function () {
            A.UI.toast({ type: 'err', title: '下载失败', desc: '图片取不到，检查 K1 是否在线' });
          });
        };
      }
    });
  }

  /* ---------------- 回放 ---------------- */
  function startPlay(data, root) {
    if (!data.length) return;
    playIdx = 0;
    var bar = U.node('<div class="tl-play-bar" id="playBar">' + I('play') +
      '<span id="playTxt">回放中… 1 / ' + data.length + ' · 按时间顺序自动定位</span>' +
      '<div class="grow" style="flex:1"></div>' +
      '<button class="btn sm" id="playStop">' + I('pause') + '停止回放</button></div>');
    var list = U.q('#tlList');
    if (list) list.parentNode.insertBefore(bar, list);
    U.q('#playStop').onclick = function () { stopPlay(); A.UI.toast({ type: 'info', title: '回放已停止' }); A.Router.refresh(); };

    function step() {
      U.qa('.tl-item').forEach(function (el) { el.classList.remove('playing'); });
      var a = data[playIdx];
      var el = U.q('.tl-item[data-arc="' + a.id + '"]');
      if (el) {
        el.classList.add('playing');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      var txt = U.q('#playTxt');
      if (txt) txt.textContent = '回放中… ' + (playIdx + 1) + ' / ' + data.length + ' · ' + a.pointName + ' ' + U.fmtDT(a.occurredAt);
      playIdx++;
      if (playIdx >= data.length) {
        setTimeout(function () { stopPlay(); A.UI.toast({ type: 'ok', title: '回放结束', desc: '共 ' + data.length + ' 条归档记录' }); }, 1200);
      }
    }
    step();
    playTimer = setInterval(step, 1700);
  }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    var b = U.q('#playBar'); if (b) b.remove();
    U.qa('.tl-item').forEach(function (el) { el.classList.remove('playing'); });
  }

  function exportCsv(data) {
    var rows = [['归档编号', '抓拍时间', '归档时间', '点位', '人员', '人员编号', '记录类型', '处置方式', '文件名', '对象键', '大小', '存储状态', '备注']];
    data.forEach(function (a) {
      rows.push([a.id, U.fmtDT(a.occurredAt), U.fmtDT(a.archivedAt), a.pointName, a.personName, a.personCode,
        ({ alert: '危险告警', pass: '正常通行', stranger: '陌生访客' }[a.kind] || '归档'),
        a.resolutionName || '',
        a.fileKey.split('/').pop(), a.fileKey, U.fmtBytes(a.size), a.uploaded ? '已上云' : '待上传', a.note]);
    });
    U.download('时间轴归档_' + U.fmtDate(new Date()) + '.csv', U.csv(rows), 'text/csv;charset=utf-8');
    A.UI.toast({ type: 'ok', title: '已导出 ' + data.length + ' 条归档记录' });
  }

  A.Views = A.Views || {};
  A.Views.timeline = { render: render, cleanup: stopPlay, preview: preview, state: state };
})(window.App);
