/* ============================================================
   06 · ui —— 图标 / 弹层 / 提示 / 通用片段
   ============================================================ */
(function (A) {
  var U = A.U;

  var P = {
    dashboard: '<rect x="3" y="3" width="7.5" height="8.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="12" width="7.5" height="9" rx="2"/><rect x="3" y="15" width="7.5" height="6" rx="2"/>',
    faces: '<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><circle cx="12" cy="10.6" r="2.7"/><path d="M8.3 17.2c.8-2 2.1-3 3.7-3s2.9 1 3.7 3"/>',
    points: '<path d="M12 21s6.6-6.2 6.6-11.2A6.6 6.6 0 1 0 5.4 9.8C5.4 14.8 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/>',
    alerts: '<path d="M18 15.6V11a6 6 0 1 0-12 0v4.6L4.4 18.2h15.2L18 15.6Z"/><path d="M9.8 21h4.4"/>',
    timeline: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.1 1.9"/>',
    cloud: '<path d="M7.4 18.6A4.1 4.1 0 0 1 6.9 10.5a5.3 5.3 0 0 1 10.1-1.1 3.9 3.9 0 0 1 1.1 7.6 4 4 0 0 1-.9.6H7.4Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.5 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.7-1.2l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.9a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.2-2.7l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 2.7-1.1V3.9a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.2l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.4.9Z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14.5 6.5l3 3"/>',
    trash: '<path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>',
    check: '<path d="M4.5 12.5l5 5 10-10.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4"/><path d="M4 19h16"/>',
    upload: '<path d="M12 20V9m0 0l-4 4m4-4l4 4"/><path d="M4 5h16"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>',
    bell: '<path d="M18 15.6V11a6 6 0 1 0-12 0v4.6L4.4 18.2h15.2L18 15.6Z"/><path d="M9.8 21h4.4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    logout: '<path d="M15 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 6.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.5"/>',
    play: '<path d="M8 5.5l11 6.5-11 6.5z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    camera: '<path d="M3.5 8.8A2 2 0 0 1 5.5 7h1.8l1.1-1.7A1.6 1.6 0 0 1 10 4.5h4a1.6 1.6 0 0 1 1.4.8L16.6 7h1.9a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V8.8Z"/><circle cx="12" cy="12.8" r="3.2"/>',
    cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2"/>',
    chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M9.5 9.5h5v5h-5z"/>',
    shield: '<path d="M12 3.5l7 2.6v5.3c0 4.3-2.9 7.6-7 9.1-4.1-1.5-7-4.8-7-9.1V6.1l7-2.6Z"/><path d="M9.2 12.2l2 2 3.6-3.9"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"/>',
    warn: '<path d="M12 4.5l8.5 15h-17z"/><path d="M12 10v4.2M12 17.2v.1"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2l1.8 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V7.5Z"/>',
    link: '<path d="M9.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L11 7"/><path d="M14.5 10.5a3.5 3.5 0 0 0-5 0L7 13a3.5 3.5 0 0 0 5 5l1-1"/>',
    eye: '<path d="M2.8 12S6.4 6 12 6s9.2 6 9.2 6-3.6 6-9.2 6-9.2-6-9.2-6Z"/><circle cx="12" cy="12" r="2.6"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    volume: '<path d="M4 9.5h3L12 5v14l-5-4.5H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6"/><path d="M18.6 6.4a8 8 0 0 1 0 11.2"/>',
    wifi: '<path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.8 7.8 0 0 1 10 0M10 16.4a3.6 3.6 0 0 1 4 0"/><circle cx="12" cy="19.5" r=".9" fill="currentColor" stroke="none"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M4.5 17l5-4.5 4 3.5 3-2.6 3 3.6"/>',
    lock: '<rect x="4.8" y="10.5" width="14.4" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M14.5 12v2.5"/>',
    database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.6" cy="6" r="1"/><circle cx="4.6" cy="12" r="1"/><circle cx="4.6" cy="18" r="1"/>',
    pin: '<path d="M12 21s6.6-6.2 6.6-11.2A6.6 6.6 0 1 0 5.4 9.8C5.4 14.8 12 21 12 21Z"/>',
    scan: '<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><path d="M4 12h16"/>',
    bolt: '<path d="M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12l1-7.5Z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    sparkles: '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="4" rx="1.4"/><path d="M5 8.5v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9"/><path d="M10 12.5h4"/>',
    send: '<path d="M20 4L3.5 11l7 2.6L13 21l7-17Z"/><path d="M10.5 13.6L20 4"/>',
    activity: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
    puzzle: '<path d="M9 4.5a2 2 0 0 1 4 0V6h2.5a1.5 1.5 0 0 1 1.5 1.5V10h1.5a2 2 0 0 1 0 4H17v2.5a1.5 1.5 0 0 1-1.5 1.5H13v1.5a2 2 0 0 1-4 0V18H6.5A1.5 1.5 0 0 1 5 16.5V14H3.5a2 2 0 0 1 0-4H5V7.5A1.5 1.5 0 0 1 6.5 6H9V4.5Z"/>',
    dots: '<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>'
  };

  function icon(name, cls) {
    var body = P[name] || P.info;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  /* ---------------- Toast ---------------- */
  function toast(opt) {
    if (typeof opt === 'string') opt = { title: opt };
    var type = opt.type || 'info';
    var icons = { ok: 'check', err: 'warn', warn: 'warn', info: 'info' };
    var root = U.q('#toast-root');
    var el = U.node('<div class="toast ' + type + '">' +
      '<span class="t-ico">' + icon(icons[type] || 'info') + '</span>' +
      '<div class="t-body"><b>' + U.esc(opt.title || '') + '</b>' +
      (opt.desc ? '<span>' + U.esc(opt.desc) + '</span>' : '') + '</div></div>');
    root.appendChild(el);
    var t = setTimeout(close, opt.timeout || 2800);
    function close() {
      clearTimeout(t);
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 220);
    }
    el.addEventListener('click', close);
    return close;
  }

  /* ---------------- Modal / Drawer ---------------- */
  var openLayers = [];

  function layer(kind, opt) {
    var root = U.q('#modal-root');
    var scrim = document.createElement('div');
    scrim.className = kind === 'modal' ? 'modal-scrim' : 'drawer-scrim';
    var box = document.createElement('div');
    box.className = kind === 'modal'
      ? 'modal ' + (opt.size === 'wide' ? 'wide' : opt.size === 'narrow' ? 'narrow' : '')
      : 'drawer ' + (opt.size === 'wide' ? 'wide' : '');
    var grabHtml = kind === 'drawer' ? '<div class="drawer-grabber" title="点击关闭" aria-hidden="true"></div>' : '';
    box.innerHTML = grabHtml +
      '<div class="modal-head">' +
      '<div><h3>' + U.esc(opt.title || '') + '</h3>' + (opt.sub ? '<div class="mh-sub">' + U.esc(opt.sub) + '</div>' : '') + '</div>' +
      '<button class="btn-icon close" aria-label="关闭">' + icon('x') + '</button>' +
      '</div>' +
      '<div class="modal-body">' + (opt.body || '') + '</div>' +
      (opt.footer ? '<div class="modal-foot">' + opt.footer + '</div>' : '');
    if (kind === 'modal') {
      scrim.appendChild(box);           /* 弹窗必须放在遮罩内做 flex 居中 */
      root.appendChild(scrim);
    } else {
      root.appendChild(scrim);
      root.appendChild(box);
    }
    document.body.style.overflow = 'hidden';

    var handle = {
      el: box,
      body: box.querySelector('.modal-body'),
      foot: box.querySelector('.modal-foot'),
      close: closeFn
    };
    openLayers.push(handle);

    function closeFn() {
      openLayers = openLayers.filter(function (h) { return h !== handle; });
      if (!openLayers.length) document.body.style.overflow = '';
      scrim.remove(); box.remove();
      if (opt.onClose) opt.onClose();
    }
    function onEsc(e) { if (e.key === 'Escape') { closeFn(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);
    scrim.addEventListener('click', function (e) {
      if (opt.dismissible !== false && e.target === scrim) closeFn();
    });
    box.querySelector('.close').addEventListener('click', closeFn);
    /* 抽屉：提供额外的「点一下就退出」入口，避免底部抽屉只剩顶部一条窄遮罩难点到 */
    if (kind === 'drawer') {
      var grab = box.querySelector('.drawer-grabber');
      if (grab) grab.addEventListener('click', closeFn);
      var head = box.querySelector('.modal-head');
      if (head) head.addEventListener('click', function (e) {
        if (e.target.closest('.close')) return;
        closeFn();
      });
    }
    /* onMount 同步执行：弹层 DOM 已经 append 完毕，事件可立即绑定，
       避免自动化/快速点击场景下「点得太早、处理器还没挂上」 */
    if (opt.onMount) opt.onMount(handle);
    return handle;
  }

  function confirm(opt) {
    return new Promise(function (resolve) {
      var decided = false;
      layer('modal', {
        size: 'narrow',
        title: opt.title || '确认操作',
        body: '<div style="font-size:13px;color:var(--text-2);line-height:1.7">' + (opt.html || U.esc(opt.text || '')) + '</div>',
        footer: '<button class="btn" data-act="no">取消</button>' +
          '<button class="btn ' + (opt.danger ? 'danger' : 'primary') + '" data-act="yes">' + U.esc(opt.okText || '确定') + '</button>',
        onMount: function (h) {
          h.foot.querySelector('[data-act="no"]').onclick = function () { decided = true; resolve(false); h.close(); };
          h.foot.querySelector('[data-act="yes"]').onclick = function () { decided = true; resolve(true); h.close(); };
        },
        onClose: function () { if (!decided) resolve(false); }
      });
    });
  }

  /* ---------------- 提示音 ---------------- */
  var audioCtx = null;
  function beep(kind) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var seq = kind === 'alert' ? [[880, 0], [1180, .12], [880, .26]] : [[660, 0]];
      seq.forEach(function (s) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = s[0];
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + s[1]);
        g.gain.exponentialRampToValueAtTime(0.14, audioCtx.currentTime + s[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + s[1] + 0.1);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + s[1]); o.stop(audioCtx.currentTime + s[1] + 0.12);
      });
    } catch (e) { }
  }

  /* ---------------- 常用片段 ---------------- */
  function statusBadge(s) {
    var m = A.Store.STATUS[s] || { name: s, badge: '' };
    return '<span class="badge ' + m.badge + '"><i></i>' + m.name + '</span>';
  }
  function pointStatusBadge(s) {
    var m = A.Store.POINT_STATUS[s] || { name: s, badge: '' };
    return '<span class="badge ' + m.badge + '"><i></i>' + m.name + '</span>';
  }
  function catBadge(cat) {
    var m = A.Store.CATS.filter(function (c) { return c.id === cat; })[0] || A.Store.CATS[0];
    return '<span class="badge ' + m.badge + '">' + m.name + '</span>';
  }
  function levelTag(lv) {
    var m = A.Store.LEVELS[lv] || A.Store.LEVELS[0];
    return '<span class="level-dot lv-' + lv + '"><i></i>' + m.name + '</span>';
  }
  function featBadge(s) {
    if (s === 'synced') return '<span class="badge ok">已同步</span>';
    if (s === 'pending') return '<span class="badge warn">待同步</span>';
    return '<span class="badge danger">同步失败</span>';
  }
  function emptyBox(title, desc, iconName) {
    return '<div class="empty">' + icon(iconName || 'folder') + '<b>' + U.esc(title) + '</b><span>' + U.esc(desc || '') + '</span></div>';
  }
  function copyBtn(text, label) {
    return '<button class="btn sm" data-copy="' + U.esc(text) + '">' + icon('copy') + (label || '复制') + '</button>';
  }
  function bindCopy(root) {
    U.on(root, 'click', '[data-copy]', function (e, t) {
      U.copy(t.getAttribute('data-copy')).then(function () { toast({ type: 'ok', title: '已复制到剪贴板' }); });
    });
  }

  function isNarrow() { return window.innerWidth <= 740; }

  A.UI = {
    icon: icon, isNarrow: isNarrow, toast: toast, modal: function (o) { return layer('modal', o); },
    drawer: function (o) { return layer('drawer', o); }, confirm: confirm, beep: beep,
    statusBadge: statusBadge, pointStatusBadge: pointStatusBadge, catBadge: catBadge,
    levelTag: levelTag, featBadge: featBadge, emptyBox: emptyBox, copyBtn: copyBtn, bindCopy: bindCopy
  };
})(window.App);
