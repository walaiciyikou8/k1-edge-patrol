/* ============================================================
   11 · view · 告警中心（接收 K1 告警）
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;
  var PAGE_SIZE = 8;
  var state = { tab: 'all', q: '', point: 'all', level: 'all', page: 1 };

  function list() {
    var st = S.get();
    var out = st.alerts.slice();
    if (state.tab !== 'all') out = out.filter(function (a) { return a.status === state.tab; });
    if (state.point !== 'all') out = out.filter(function (a) { return a.pointId === state.point; });
    if (state.level !== 'all') out = out.filter(function (a) { return String(a.level) === state.level; });
    if (state.q) {
      var q = state.q.toLowerCase();
      out = out.filter(function (a) {
        return (a.personName + ' ' + a.code + ' ' + a.pointName + ' ' + a.personCode).toLowerCase().indexOf(q) >= 0;
      });
    }
    return out.sort(function (a, b) { return new Date(b.occurredAt) - new Date(a.occurredAt); });
  }

  function render(root) {
    var st = S.get();
    var all = st.alerts;
    var counts = {
      all: all.length,
      pending: all.filter(function (a) { return a.status === 'pending'; }).length,
      tracking: all.filter(function (a) { return a.status === 'tracking'; }).length,
      backup: all.filter(function (a) { return a.status === 'backup'; }).length,
      confirmed: all.filter(function (a) { return a.status === 'confirmed'; }).length,
      false: all.filter(function (a) { return a.status === 'false'; }).length
    };
    var data = list();
    var pages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    state.page = U.clamp(state.page, 1, pages);
    var rows = data.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var sim = !!(st.ui && st.ui.injectSim);

    root.innerHTML =
      '<div class="view-anim">' +
      '<div class="sec-head"><div><h2>告警中心</h2>' +
      '<p>仅展示「重点关注（布控）」人员触发的危险告警 · 内部员工/访客识别为正常通行、陌生人抓拍记入时间轴</p></div><div class="grow"></div>' +
      '<div class="btn-group">' +
      '<label class="switch" style="margin-right:4px"><input type="checkbox" id="alSim"' + (sim ? ' checked' : '') + '>' +
      '<span class="track"></span><span class="sw-label">实时模拟接入</span></label>' +
      '<button class="btn" id="alInject">' + I('bolt') + '手动注入</button>' +
      '<button class="btn" id="alHook">' + I('link') + '上行接口</button>' +
      '</div></div>' +

      '<div class="card"><div class="card-head" style="padding-bottom:0;border-bottom:0">' +
      '<div class="tabs" id="alTabs" style="width:100%">' +
      tabBtn('all', '全部', counts.all) + tabBtn('pending', '待处置', counts.pending) +
      tabBtn('tracking', '跟踪中', counts.tracking) + tabBtn('backup', '待增援', counts.backup) +
      tabBtn('confirmed', '已确认', counts.confirmed) + tabBtn('false', '误报归档', counts.false) +
      '</div></div>' +
      '<div class="card-head" style="border-bottom:1px solid var(--border)">' +
      '<div class="search-box" style="min-width:200px;flex:1;max-width:280px">' + I('search') +
      '<input class="input" id="alSearch" placeholder="搜索告警编号 / 人员 / 点位" value="' + U.esc(state.q) + '"></div>' +
      '<select class="select" id="alPoint" style="width:auto">' +
      '<option value="all">全部点位</option>' +
      st.points.map(function (p) { return '<option value="' + p.id + '"' + (state.point === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '</option>'; }).join('') +
      '</select>' +
      '<select class="select" id="alLevel" style="width:auto">' +
      '<option value="all">全部级别</option>' +
      [3, 2, 1, 0].map(function (l) { return '<option value="' + l + '"' + (state.level === String(l) ? ' selected' : '') + '>' + S.LEVELS[l].name + '</option>'; }).join('') +
      '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn sm" id="alExport">' + I('download') + '导出</button>' +
      '</div>' +
      '<div class="card-body">' +
      (rows.length ? '<div class="alert-list" id="alertList">' + rows.map(cardHtml).join('') + '</div>' +
        '<div class="pager" style="margin-top:14px">' +
        '<span class="pg-info">共 ' + data.length + ' 条 · 第 ' + state.page + '/' + pages + ' 页</span>' +
        '<button data-pg="prev"' + (state.page === 1 ? ' disabled' : '') + '>' + I('left') + '</button>' +
        pageButtons(state.page, pages) +
        '<button data-pg="next"' + (state.page === pages ? ' disabled' : '') + '>' + I('right') + '</button></div>'
        : A.UI.emptyBox('没有符合条件的告警', '试试切换筛选条件，或在右上方手动注入一条测试告警', 'bell')) +
      '</div></div></div>';

    /* 事件 */
    U.qa('#alTabs button').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-t'); state.page = 1; render(root); });
    });
    var si = U.q('#alSearch');
    si.addEventListener('input', U.debounce(function () {
      state.q = si.value; state.page = 1; render(root);
      var n = U.q('#alSearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    }, 240));
    U.q('#alPoint').addEventListener('change', function (e) { state.point = e.target.value; state.page = 1; render(root); });
    U.q('#alLevel').addEventListener('change', function (e) { state.level = e.target.value; state.page = 1; render(root); });
    U.on(root, 'click', '[data-pg]', function (e, t) {
      state.page += t.getAttribute('data-pg') === 'next' ? 1 : -1; render(root);
    });
    U.on(root, 'click', '[data-page]', function (e, t) { state.page = parseInt(t.getAttribute('data-page'), 10); render(root); });

    U.q('#alSim').addEventListener('change', function (e) {
      var on = e.target.checked;
      S.set(function (s) { s.ui.injectSim = on; }, 'sim');
      A.UI.toast(on
        ? { type: 'ok', title: '已开启实时模拟接入', desc: 'K1 端将每 12~20 秒上报一条识别告警' }
        : { type: 'info', title: '已关闭实时模拟', desc: '仍可通过「手动注入」产生测试告警' });
      A.Router.refresh();
    });
    U.q('#alInject').addEventListener('click', function () { openInject(root); });
    U.q('#alHook').addEventListener('click', function () { openHook(); });
    U.q('#alExport').addEventListener('click', function () { exportCsv(data); });

    U.on(root, 'click', '.alert-card', function (e, t) {
      var id = t.getAttribute('data-alert');
      if (e.target.closest('[data-act]')) {
        var act = e.target.closest('[data-act]').getAttribute('data-act');
        if (act === 'handle') openHandle(id, root);
        if (act === 'view') openHandle(id, root, true);
        if (act === 'false') markFalse(id, root);
        return;
      }
      openHandle(id, root);
    });

    /* 新告警高亮 */
    if (A.Views.alerts.flash && A.Views.alerts.flash.length) {
      A.Views.alerts.flash.forEach(function (id) {
        var el = U.q('.alert-card[data-alert="' + id + '"]');
        if (el) el.classList.add('is-new');
      });
      A.Views.alerts.flash = [];
    }
  }

  function tabBtn(id, name, n) {
    return '<button data-t="' + id + '" class="' + (state.tab === id ? 'on' : '') + '">' + name +
      '<span class="count">' + n + '</span></button>';
  }
  function pageButtons(cur, pages) {
    var out = '', from = Math.max(1, cur - 2), to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);
    for (var i = from; i <= to; i++) out += '<button data-page="' + i + '" class="' + (i === cur ? 'on' : '') + '">' + i + '</button>';
    return out;
  }

  function cardHtml(a) {
    var st = S.get();
    var face = a.faceId ? S.faceById(a.faceId) : null;
    var hit = face ? st.alerts.filter(function (x) { return x.faceId === face.id; }).length : 0;
    return '<div class="alert-card lv-' + a.level + '" data-alert="' + a.id + '">' +
      '<div class="alert-shot">' +
      (a.snapshot ? '<img src="' + U.esc(a.snapshot) + '" alt="">'
                  : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:11px">无抓拍图</div>') +
      '<span class="as-sim">' + (a.similarity * 100).toFixed(1) + '%</span></div>' +
      '<div class="alert-main">' +
      '<div class="alert-title"><b>' + U.esc(a.personName) + '</b>' +
      A.UI.catBadge(a.cat) + A.UI.levelTag(a.level) +
      '<span class="code">' + U.esc(a.code) + '</span></div>' +
      '<div class="alert-meta">' +
      '<span>' + I('pin') + U.esc(a.pointName) + '</span>' +
      '<span>' + I('clock') + U.esc(U.fmtDT(a.occurredAt)) + '</span>' +
      (hit > 1 ? '<span>' + I('target') + '累计命中 ' + hit + ' 次</span>' : '') +
      '</div>' +
      '<div class="alert-say">' + I('volume') + '<span>' + U.esc(a.speaker.text) + '</span></div>' +
      '<div class="alert-k1"><u>CPU ' + a.k1.cpu + '%</u><u>NPU ' + a.k1.npu + '%</u>' +
      '<u>推理 ' + a.k1.inferMs + 'ms</u><u>' + U.esc(a.k1.device || '') + '</u></div>' +
      '</div>' +
      '<div class="alert-side">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
      A.UI.statusBadge(a.status) +
      (a.resolutionName ? '<span class="badge ' + S.resById(a.resolution).badge + ' sm">' + U.esc(a.resolutionName) + '</span>' : '') +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-3);text-align:right;line-height:1.5">' +
      (a.handler
        ? U.esc('处置人 ' + a.handler) +
          '<br>' + U.esc((S.SOURCES[a.source] || S.SOURCES.device).name + ' · ' + (a.deviceSn || a.k1.device || '—'))
        : '待巡逻人员处置') +
      (a.unit ? '<br>' + U.esc('增援 ' + a.unit) : '') + '</div>' +
      '<div class="btn-group" style="justify-content:flex-end">' +
      (a.status === 'pending'
        ? '<button class="btn primary sm" data-act="handle">' + I('check') + '处置</button>' +
          '<button class="btn sm" data-act="false">误报</button>'
        : ((a.status === 'tracking' || a.status === 'backup')
          ? '<button class="btn primary sm" data-act="handle">' + I('bolt') + '继续处置</button>' +
            '<button class="btn sm" data-act="view">' + I('eye') + '详情</button>'
          : '<button class="btn sm" data-act="view">' + I('eye') + '详情</button>')) +
      '</div></div></div>';
  }

  /* ---------------- 处置抽屉 ---------------- */
  function openHandle(id, root, readonly) {
    var a = S.get().alerts.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var face = a.faceId ? S.faceById(a.faceId) : null;
    var st = S.get();
    var body =
      '<div style="border-radius:12px;overflow:hidden;border:1px solid var(--border);margin-bottom:14px;position:relative">' +
      (a.snapshot
        ? '<img src="' + U.esc(a.snapshot) + '" style="width:100%;display:block">'
        : '<div style="padding:60px;text-align:center;color:var(--text-3)">该告警未取到抓拍图（检查 K1 是否在线）</div>') +
      '<div style="position:absolute;top:9px;left:9px"><span class="badge danger">' + S.LEVELS[a.level].name + '</span></div>' +
      '<div style="position:absolute;bottom:9px;left:9px;background:rgba(12,26,44,.72);color:#fff;font-size:11px;' +
      'padding:3px 8px;border-radius:6px;font-family:var(--mono)">' + U.esc(a.snapshotKey.split('/').pop()) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
      (face ? '<img src="' + face.photo + '" style="width:46px;height:46px;border-radius:10px;object-fit:cover;border:1px solid var(--border)">' : '') +
      '<div style="flex:1"><div style="font-size:15px;font-weight:700">' + U.esc(a.personName) + ' ' + A.UI.catBadge(a.cat) + '</div>' +
      '<div style="font-size:11.5px;color:var(--text-3)">' + U.esc(a.code) + ' · 相似度 <b style="color:var(--primary)">' +
      (a.similarity * 100).toFixed(1) + '%</b> · 阈值 ' + (st.settings.alert.threshold * 100).toFixed(0) + '%</div></div>' +
      A.UI.statusBadge(a.status) + '</div>' +
      (readonly ? '' : resPickerHtml(a)) +
      '<dl class="kv" style="margin-top:14px">' +
      '<dt>告警点位</dt><dd>' + U.esc(a.pointName) + '</dd>' +
      '<dt>发生时间</dt><dd>' + U.esc(U.fmtDT(a.occurredAt)) + '</dd>' +
      '<dt>上报延时</dt><dd>' + Math.max(0, Math.round((new Date(a.receivedAt) - new Date(a.occurredAt)))) + ' ms（K1 → 云端）</dd>' +
      '<dt>云端对象</dt><dd class="mono" style="font-size:11px">' + U.esc(a.snapshotKey) + '</dd>' +
      (a.resolutionName
        ? '<dt>处置方式</dt><dd><span class="badge ' + S.resById(a.resolution).badge + ' sm">' + U.esc(a.resolutionName) + '</span>' +
          (a.unit ? ' <span style="color:var(--text-2)">' + U.esc(a.unit) + '</span>' : '') + '</dd>' +
          '<dt>处置人</dt><dd>' + U.esc(a.handler || '—') + (a.handledAt ? ' · ' + U.esc(U.fmtDT(a.handledAt)) : '') + '</dd>' +
          '<dt>处置通道</dt><dd><span class="badge ' + (S.SOURCES[a.source] || S.SOURCES.device).badge + ' sm">' +
            U.esc((S.SOURCES[a.source] || S.SOURCES.device).name) + '</span>' +
            ' <span class="mono" style="font-size:11px;color:var(--text-3)">' + U.esc(a.deviceSn || a.k1.device || '—') + '</span></dd>'
        : '') +
      (face ? '<dt>人员编号</dt><dd class="mono">' + U.esc(face.code) + ' · ' + U.esc(face.dept || '—') + '</dd>' : '') +
      '</dl>' +
      '<div class="note" style="margin-top:12px">' + I('volume') + '<div><b>扬声器播报：</b>' + U.esc(a.speaker.text) +
      '<div style="font-size:11px;color:var(--text-3);margin-top:3px">K1 端 TTS 输出 ×' + (st.settings.speaker.repeat || 2) + ' · ' + U.esc(U.fmtTime(a.speaker.at)) + '</div></div></div>' +
      '<div class="dual-metrics" style="margin-top:12px;border-top:1px dashed var(--border);padding-top:11px">' +
      '<div><b>' + a.k1.cpu + '%</b><span>CPU 负载</span></div>' +
      '<div><b>' + a.k1.npu + '%</b><span>NPU 负载</span></div>' +
      '<div><b>' + a.k1.inferMs + 'ms</b><span>单帧推理</span></div></div>' +
      '<div class="divider"></div>' +
      '<div style="font-size:12.5px;font-weight:600;margin-bottom:10px">处置轨迹</div>' +
      '<div class="trace">' + a.trace.map(function (t, i) {
        return '<div class="trace-item' + (i === a.trace.length - 1 ? ' on' : '') + '">' +
          '<b>' + U.esc(t.action) + '</b>' +
          '<span>' + U.esc(U.fmtDT(t.at)) + ' · ' + U.esc(t.by) + '</span>' +
          (t.note ? '<p>' + U.esc(t.note) + '</p>' : '') + '</div>';
      }).join('') + '</div>';

    A.UI.drawer({
      title: readonly ? '告警详情' : '处置告警',
      sub: a.pointName + ' · ' + U.fmtDT(a.occurredAt),
      body: body,
      footer: readonly
        ? '<button class="btn" data-act="close">关闭</button>' +
          (a.resolutionName ? '<span class="badge ' + S.resById(a.resolution).badge + '">' + I('check') + '已' + U.esc(a.resolutionName) + '</span>' : '') +
          (a.archived ? '<button class="btn ok">' + I('archive') + '已归档</button>' : '')
        : '<button class="btn" data-act="cancel">取消</button>' +
          '<button class="btn danger" data-act="false">' + I('x') + '标记误报</button>' +
          '<button class="btn primary" data-act="submit">' + I('check') + '<span id="hSubmitTxt">确认处置</span></button>',
      onMount: function (h) {
        var c = h.foot.querySelector('[data-act="close"]');
        if (c) c.onclick = h.close;
        var cc = h.foot.querySelector('[data-act="cancel"]');
        if (cc) cc.onclick = h.close;
        var fb = h.foot.querySelector('[data-act="false"]');
        if (fb) fb.onclick = function () { h.close(); markFalse(id, root); };
        if (readonly) return;

        /* ---- 处置方式选择 ---- */
        var picker = U.q('#hRes', h.body);
        var unitWrap = U.q('#hUnitWrap', h.body);
        var unitSel = U.q('#hUnit', h.body);
        var submitTxt = U.q('#hSubmitTxt', h.foot);
        var cur = a.resolution || 'onscene';

        function select(resId) {
          cur = resId;
          U.qa('.res-opt', picker).forEach(function (b) {
            b.classList.toggle('on', b.getAttribute('data-res') === resId);
          });
          var R = S.resById(resId);
          unitWrap.style.display = R.needUnit ? '' : 'none';
          submitTxt.textContent = '确认' + R.name;
        }
        U.on(picker, 'click', '.res-opt', function (e, t) { select(t.getAttribute('data-res')); });
        select(cur);

        h.foot.querySelector('[data-act="submit"]').onclick = function () {
          var note = (U.q('#hNote', h.body).value || '').trim();
          var unit = unitSel && S.resById(cur).needUnit ? unitSel.value : '';
          var R = S.resById(cur);
          h.close();
          applyResolution(id, cur, unit, note, 'console');
          var tail = R.archive ? ' · 已归档至时间轴'
            : (R.status === 'tracking' ? ' · 已进入跟踪中，持续记录抓拍' : ' · 已发起增援，等待响应');
          A.UI.toast({
            type: R.archive ? 'ok' : (R.id === 'backup' ? 'warn' : 'info'),
            title: '处置完成 · ' + R.name,
            desc: a.pointName + ' · ' + (unit || a.handler || a.personName) + tail
          });
          A.Router.refresh();
        };
      }
    });
  }

  /* 处置方式选择器（「怎么处置」的选项组） */
  function resPickerHtml(a) {
    var cur = a.resolution || 'onscene';
    var R = S.resById(cur);
    return '<div class="divider"></div>' +
      '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:9px">' +
      '<div style="font-size:12.5px;font-weight:600">处置方式 <span style="color:var(--danger)">*</span></div>' +
      '<span style="font-size:11px;color:var(--text-3)">选择本次告警的处理方式，决定流转状态与是否归档</span></div>' +
      '<div class="res-opts" id="hRes">' +
      S.RESOLUTIONS.map(function (r) {
        return '<button type="button" class="res-opt' + (r.id === cur ? ' on' : '') + '" data-res="' + r.id + '">' +
          '<span class="ro-ico">' + I(r.icon) + '</span>' +
          '<b>' + U.esc(r.name) + '</b>' +
          '<span class="ro-desc">' + U.esc(r.desc) + '</span>' +
          '<span class="ro-tag">→ ' + S.STATUS[r.status].name + (r.archive ? ' · 自动归档' : '') + '</span>' +
          '</button>';
      }).join('') + '</div>' +
      '<div class="field" id="hUnitWrap" style="margin-top:12px;' + (R.needUnit ? '' : 'display:none') + '">' +
      '<label>增援对象（队友 / 值班长 / 辖区派出所）</label><select class="select" id="hUnit">' +
      '<optgroup label="园区内部">' +
      S.UNITS.filter(function (u) { return u.type === 'internal'; }).map(function (u) {
        return '<option value="' + U.esc(u.name) + '">' + U.esc(u.name) + '</option>';
      }).join('') + '</optgroup>' +
      '<optgroup label="外部联动">' +
      S.UNITS.filter(function (u) { return u.type === 'external'; }).map(function (u) {
        return '<option value="' + U.esc(u.name) + '">' + U.esc(u.name) + '</option>';
      }).join('') + '</optgroup>' +
      '</select></div>' +
      '<div class="field" style="margin-top:12px"><label>处置备注</label>' +
      '<textarea class="input" id="hNote" placeholder="记录现场核实情况，将写入归档证据链">' + U.esc(a.note || '') + '</textarea></div>';
  }

  /* 按处置方式落地：更新告警状态 + 轨迹，需要归档的同步写时间轴
     src = 'console'（后台）| 'device'（端侧 LCD）| 'app'，用于处置人溯源 */
  function applyResolution(id, resId, unit, note, src) {
    var R = S.resById(resId);
    updateAlert(id, resId, unit, note, src);
    var a = S.get().alerts.filter(function (x) { return x.id === id; })[0];
    if (R.archive) archiveAlert(a);
    return a;
  }

  function updateAlert(id, resId, unit, note, src) {
    var me = A.Auth.session();
    var R = S.resById(resId);
    S.set(function (st) {
      var a = st.alerts.filter(function (x) { return x.id === id; })[0];
      if (!a) return;
      a.status = R.status;
      a.resolution = R.id;
      a.resolutionName = R.name;
      if (unit) a.unit = unit;
      a.handler = me ? me.name : '系统';
      a.handlerId = me ? me.username : '';
      a.source = src || 'console';
      a.deviceSn = a.deviceSn || (a.k1 && a.k1.device) || '';
      a.handledAt = new Date().toISOString();
      if (note) a.note = note;
      a.trace = a.trace || [];
      a.trace.push({
        at: a.handledAt, by: a.handler,
        action: R.name + (unit ? '（' + unit + '）' : ''),
        note: (note || R.desc) + ' · 来自 ' + (S.SOURCES[a.source] || S.SOURCES.console).name
      });
    }, 'alerts');
  }

  function markFalse(id, root) {
    A.UI.confirm({
      title: '标记为误报', danger: true, okText: '确认误报',
      text: '该记录将按「误报归档」处理，用于后续优化 K1 端的识别模型与阈值。'
    }).then(function (ok) {
      if (!ok) return;
      applyResolution(id, 'false', '', '光照/角度干扰导致误检，已标记误报');
      A.UI.toast({ type: 'ok', title: '已标记为误报并归档' });
      A.Router.refresh();
    });
  }

  function archiveAlert(a) {
    if (!a) return;
    var exists = S.get().archives.some(function (x) { return x.alertId === a.id; });
    if (exists) return;
    var R = S.resById(a.resolution || 'onscene');
    var arc = {
      id: 'arc_' + a.id, alertId: a.id, pointId: a.pointId, pointName: a.pointName,
      faceId: a.faceId, personName: a.personName, personCode: a.personCode, cat: a.cat, level: a.level,
      kind: 'alert',
      resolution: a.resolution || 'onscene',
      resolutionName: a.resolutionName || R.name,
      unit: a.unit || '',
      handler: a.handler || '',
      source: a.source || 'console',
      deviceSn: a.deviceSn || (a.k1 && a.k1.device) || '',
      occurredAt: a.occurredAt, archivedAt: new Date().toISOString(),
      fileKey: a.snapshotKey, thumb: a.snapshot,
      size: 0, uploaded: !A.Cloud.ready(),
      note: (a.resolutionName ? a.resolutionName + '：' : '') + (a.note || '告警处置后由系统自动归档')
    };
    S.set(function (st) {
      st.archives.unshift(arc);
      var t = st.alerts.filter(function (x) { return x.id === a.id; })[0];
      if (t) t.archived = true;
    }, 'archives');
    if (A.Cloud.ready()) {
      A.Cloud.uploadArchive(arc).then(function () { S.commit('archives'); });
    }
  }

  /* ---------------- 手动注入 ---------------- */
  function openInject(root) {
    var st = S.get();
    var body = '<div class="inject-grid">' +
      '<div class="field"><label>告警点位</label><select class="select" id="ijPoint">' +
      st.points.map(function (p) { return '<option value="' + p.id + '"' + (p.id === st.currentPointId ? ' selected' : '') + '>' + p.code + ' · ' + U.esc(p.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>命中人员</label><select class="select" id="ijFace">' +
      st.faces.map(function (f) { return '<option value="' + f.id + '">' + U.esc(f.name) + ' · ' + S.CATS.filter(function (c) { return c.id === f.cat; })[0].name + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>告警级别</label><select class="select" id="ijLevel">' +
      [3, 2, 1, 0].map(function (l) { return '<option value="' + l + '"' + (l === 3 ? ' selected' : '') + '>' + S.LEVELS[l].name + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>相似度（0.7 - 0.99）</label><input class="input" id="ijSim" type="number" step="0.001" min="0.7" max="0.995" value="0.937"></div>' +
      '</div>' +
      '<div class="note">' + I('info') + '<div>注入的告警会完整走一遍「K1 抓拍 → 扬声器播报 → 上云 → 待处置」链路，用于演示告警闭环。</div></div>';
    A.UI.modal({
      title: '手动注入 K1 告警',
      sub: '模拟边缘设备上报（等价于 POST /api/k1/alerts）',
      body: body,
      footer: '<button class="btn" data-act="cancel">取消</button><button class="btn primary" data-act="ok">' + I('bolt') + '生成告警</button>',
      onMount: function (h) {
        h.foot.querySelector('[data-act="cancel"]').onclick = h.close;
        h.foot.querySelector('[data-act="ok"]').onclick = function () {
          var a = A.Actions.raise({
            pointId: U.q('#ijPoint').value,
            faceId: U.q('#ijFace').value,
            level: parseInt(U.q('#ijLevel').value, 10),
            similarity: parseFloat(U.q('#ijSim').value)
          });
          h.close();
          if (a.kind === 'alert') A.Views.alerts.flash = [a.id];
          A.Router.refresh();
        };
      }
    });
  }

  /* ---------------- 上行接口说明 ---------------- */
  function openHook() {
    var base = location.origin + location.pathname.replace(/index\.html$/, '');
    var url = base.replace(/\/$/, '') + '/api/k1/alerts';
    var schema = '<span class="tok-c">// K1 端上报 JSON（HTTP POST · application/json）</span>\n' +
      '{\n  <span class="tok-k">"device"</span>: <span class="tok-s">"K1S-2601-A01"</span>,\n' +
      '  <span class="tok-k">"point"</span>: <span class="tok-s">"P-01"</span>,\n' +
      '  <span class="tok-k">"person"</span>: { <span class="tok-k">"name"</span>: <span class="tok-s">"张伟"</span>, <span class="tok-k">"code"</span>: <span class="tok-s">"F-1001"</span> },\n' +
      '  <span class="tok-k">"similarity"</span>: 0.937,\n' +
      '  <span class="tok-k">"level"</span>: 3,\n' +
      '  <span class="tok-k">"captured_at"</span>: <span class="tok-s">"2026-10-30T14:23:11+08:00"</span>,\n' +
      '  <span class="tok-k">"file"</span>: <span class="tok-s">"20261030_142311_东门主入口_张伟.jpg"</span>,\n' +
      '  <span class="tok-k">"object_key"</span>: <span class="tok-s">"k1-patrol/captures/20261030/20261030_142311_东门主入口_张伟.jpg"</span>,\n' +
      '  <span class="tok-k">"k1_metrics"</span>: { <span class="tok-k">"cpu"</span>: 38, <span class="tok-k">"npu"</span>: 52, <span class="tok-k">"infer_ms"</span>: 21.5, <span class="tok-k">"fps"</span>: 24.2 }\n}';
    var curl = 'curl -X POST "' + url + '" \\\n  -H "Content-Type: application/json" \\\n  -d @alert.json';
    var py = '<span class="tok-c"># K1 端（RISC-V / Python）伪代码</span>\n' +
      'import requests\n' +
      'key = f"{ts:%Y%m%d}_{ts:%H%M%S}_{point_name}_{name}.jpg"\n' +
      'obs.put(f"k1-patrol/captures/{ts:%Y%m%d}/{key}", jpeg)   <span class="tok-c"># 华为云 OBS</span>\n' +
      'requests.post(API, json={...}, timeout=3)                 <span class="tok-c"># 通知管理端</span>';
    A.UI.modal({
      title: 'K1 上行接口', size: 'wide',
      sub: '边缘设备 → 华为云 → 管理端 的数据契约',
      body:
        '<div class="field"><label>Webhook 地址</label>' +
        '<div class="input-group"><input class="input mono" readonly value="' + U.esc(url) + '" style="font-size:11.5px">' +
        A.UI.copyBtn(url) + '</div>' +
        '<div class="hint">管理端当前为纯前端部署，接口地址为约定路由；接入后端/华为云 API 网关后即可直接接收。</div></div>' +
        '<div class="field"><label>上报结构</label><div class="code-block">' + schema +
        '<button class="cb-copy" data-copy="' + U.esc(schema.replace(/<[^>]+>/g, '')) + '">复制</button></div></div>' +
        '<div class="field"><label>调用示例</label><div class="code-block">' + curl +
        '<button class="cb-copy" data-copy="' + U.esc(curl) + '">复制</button></div></div>' +
        '<div class="field"><label>K1 端上传流程</label><div class="code-block">' + py + '</div></div>' +
        '<div class="note">' + I('shield') + '<div>生产环境建议：K1 使用华为云 <b>IAM 临时凭证（STS）</b> 直传 OBS，' +
        '避免在设备端固化永久 AK/SK；管理端通过 API 网关 + 函数工作流鉴权读取。</div></div>',
      footer: '<button class="btn" data-act="close">关闭</button>',
      onMount: function (h) {
        h.foot.querySelector('[data-act="close"]').onclick = h.close;
        A.UI.bindCopy(h.body);
      }
    });
  }

  function exportCsv(data) {
    var rows = [['告警编号', '发生时间', '点位', '命中人员', '人员分类', '相似度', '级别', '状态', '处置方式', '增援对象', '处置人', '处置通道', '设备SN', '处理时间', '云端对象', '备注']];
    data.forEach(function (a) {
      rows.push([a.code, U.fmtDT(a.occurredAt), a.pointName, a.personName,
        (S.CATS.filter(function (c) { return c.id === a.cat; })[0] || {}).name,
        (a.similarity * 100).toFixed(1) + '%', S.LEVELS[a.level].name, (S.STATUS[a.status] || {}).name,
        a.resolutionName || '', a.unit || '',
        a.handler, (S.SOURCES[a.source] || S.SOURCES.device).name, a.deviceSn || (a.k1 && a.k1.device) || '',
        a.handledAt ? U.fmtDT(a.handledAt) : '', a.snapshotKey, a.note]);
    });
    U.download('告警记录_' + U.fmtDate(new Date()) + '.csv', U.csv(rows), 'text/csv;charset=utf-8');
    A.UI.toast({ type: 'ok', title: '已导出 ' + data.length + ' 条告警' });
  }

  A.Views = A.Views || {};
  A.Views.alerts = {
    render: render, flash: [], openHandle: openHandle, archiveAlert: archiveAlert,
    applyResolution: applyResolution, state: state
  };
})(window.App);
