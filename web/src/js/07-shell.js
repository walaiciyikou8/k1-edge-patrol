/* ============================================================
   07 · shell —— 登录页 / 应用外壳 / 导航
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;

  A.ROUTES = [
    { id: 'dashboard', name: '数据看板', icon: 'dashboard', perm: 'dashboard.view', group: '巡检业务' },
    { id: 'alerts', name: '告警中心', icon: 'alerts', perm: 'alerts.view', group: '巡检业务', badge: 'pending' },
    { id: 'faces', name: '人脸库管理', icon: 'faces', perm: 'faces.view', group: '巡检业务' },
    { id: 'points', name: '巡检点管理', icon: 'points', perm: 'points.view', group: '巡检业务' },
    { id: 'timeline', name: '时间轴归档', icon: 'timeline', perm: 'timeline.view', group: '巡检业务' },
    { id: 'cloud', name: '华为云对接', icon: 'cloud', perm: 'admin', group: '平台配置' },
    { id: 'settings', name: '系统设置', icon: 'settings', perm: 'admin', group: '平台配置' }
  ];
  var TABS = ['dashboard', 'alerts', 'faces', 'points', 'timeline'];

  var Shell = {
    /* ------------------ 登录页 ------------------ */
    renderLogin: function (msg) {
      var root = U.q('#app');
      var sess = A.Auth.session();
      root.innerHTML =
        '<div class="login-wrap">' +
        '<div class="login-hero">' +
        '<div class="lh-brand"><div class="brand-mark">' +
        '<svg viewBox="0 0 48 48" width="22" height="22"><path d="M18 15v18M18 24l9-9M18 24l9 9" stroke="#fff" stroke-width="2.8" stroke-linecap="round" fill="none"/><circle cx="30" cy="17" r="2" fill="#fff" opacity=".9"/></svg>' +
        '</div><div class="brand-txt"><strong>K1 智巡</strong><span>SPACEMIT · RISC-V</span></div></div>' +
        '<div class="lh-main">' +
        '<div class="lh-title">基于 <em>进迭时空 K1</em> 的<br>边缘人脸识别巡检管理平台</div>' +
        '<p class="lh-desc">K1 端侧完成「人脸检测 → 512 维特征提取 → 1:N 比对」全链路，CPU 与 NPU 双算力协同；' +
        '抓拍图按「时间 + 地点 + 人名」命名后直传华为云 OBS，管理端完成人脸库维护、多点位巡检、告警处置与时间轴回溯。</p>' +
        '<div class="lh-live">' +
        '<img src="' + A.Mock.scene('login-live-01', { person: true }) + '" alt="K1 实时画面">' +
        '<div class="ll-badge"><i></i>LIVE · K1S-2601-A01</div>' +
        '<div class="ll-bar"><span class="ll-chip">P-01</span><span>张伟 · 相似度 <b>93.7%</b></span>' +
        '<span style="margin-left:auto">NPU 52% · 21.4ms</span></div>' +
        '</div>' +
        '<div class="lh-features">' +
        '<div class="lh-feat"><span class="fi">' + I('chip') + '</span><div><b>K1 双引擎协同</b> · 8 核 X60 CPU 负责解码与流转发，2.0 TOPS NPU 负责检测与比对</div></div>' +
        '<div class="lh-feat"><span class="fi">' + I('cloud') + '</span><div><b>华为云 OBS 持久化</b> · 人脸库、抓拍图与状态快照统一上云</div></div>' +
        '<div class="lh-feat"><span class="fi">' + I('timeline') + '</span><div><b>时间轴归档</b> · 按日聚合、可回放、可导出的完整证据链</div></div>' +
        '</div></div>' +
        '<div class="lh-foot"><span>RISC-V Architecture</span><span>SpacemiT K1</span><span>Huawei Cloud OBS</span><span>v1.0.0</span></div>' +
        '</div>' +
        '<div class="login-panel"><div class="login-card">' +
        '<h1>登录管理后台</h1>' +
        '<p class="lp-sub">' + (msg || '请使用管理员或巡逻员账号登录系统') + '</p>' +
        '<div class="login-err" id="loginErr">' + I('warn') + '<span></span></div>' +
        '<form id="loginForm" autocomplete="off">' +
        '<div class="field"><label>账号</label>' +
        '<input class="input" id="lgUser" name="username" placeholder="请输入账号" value="' + (sess ? U.esc(sess.username) : 'admin') + '" autocomplete="username"></div>' +
        '<div class="field"><label>密码</label><div class="pw-wrap">' +
        '<input class="input" id="lgPwd" name="password" type="password" placeholder="请输入密码" autocomplete="current-password">' +
        '<button type="button" class="icon-btn eye" id="lgEye" aria-label="显示密码">' + I('eye') + '</button></div></div>' +
        '<div class="login-row"><label class="switch"><input type="checkbox" id="lgRemember" checked><span class="track"></span>' +
        '<span class="sw-label">保持登录状态</span></label>' +
        '<a id="lgHelp">忘记密码？</a></div>' +
        '<button class="btn primary lg block" type="submit" id="lgBtn">登 录</button>' +
        '</form>' +
        '<div class="demo-accounts"><div class="da-title">演示账号（点击自动填充）</div><div class="da-list">' +
        '<button type="button" class="da-chip" data-u="admin" data-p="k1@2026"><b>admin</b> 管理员</button>' +
        '<button type="button" class="da-chip" data-u="patrol" data-p="patrol123"><b>patrol</b> 巡逻员</button>' +
        '<button type="button" class="da-chip" data-u="viewer" data-p="viewer123"><b>viewer</b> 只读</button>' +
        '</div></div>' +
        '</div></div></div>';

      var errBox = U.q('#loginErr'), errTxt = errBox.querySelector('span');
      function showErr(t) {
        errTxt.textContent = t;
        errBox.classList.add('show');
        errBox.style.animation = 'none';
        void errBox.offsetWidth;
        errBox.style.animation = '';
      }
      U.q('#lgEye').addEventListener('click', function () {
        var p = U.q('#lgPwd');
        p.type = p.type === 'password' ? 'text' : 'password';
      });
      U.q('#lgHelp').addEventListener('click', function () {
        A.UI.toast({ type: 'info', title: '演示环境密码', desc: 'admin / k1@2026 · patrol / patrol123' });
      });
      U.qa('.da-chip').forEach(function (b) {
        b.addEventListener('click', function () {
          U.q('#lgUser').value = b.getAttribute('data-u');
          U.q('#lgPwd').value = b.getAttribute('data-p');
          U.q('#lgPwd').focus();
        });
      });
      U.q('#loginForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = U.q('#lgBtn');
        btn.disabled = true; btn.textContent = '正在验证…';
        var res = A.Auth.login(U.q('#lgUser').value, U.q('#lgPwd').value, U.q('#lgRemember').checked);
        setTimeout(function () {
          btn.disabled = false; btn.textContent = '登 录';
          if (!res.ok) { showErr(res.error); return; }
          errBox.classList.remove('show');
          A.UI.toast({ type: 'ok', title: '登录成功', desc: '欢迎回来，' + res.session.name });
          Shell.mount();
        }, 380);
      });
      setTimeout(function () { U.q('#lgPwd').focus(); }, 260);
    },

    /* ------------------ 应用外壳 ------------------ */
    mount: function () {
      var sess = A.Auth.session();
      if (!sess) { Shell.renderLogin(); return; }
      var st = S.get();
      var cur = S.currentPoint();
      var stats = S.stats();
      var u = st.users.filter(function (x) { return x.id === sess.userId; })[0] || { name: sess.name, roleName: sess.roleName };
      var routeIds = A.ROUTES.filter(function (r) { return A.Auth.can(r.perm) || (r.perm === 'admin' && sess.role === 'admin'); });

      var navHtml = '';
      var lastGroup = '';
      routeIds.forEach(function (r) {
        if (r.group !== lastGroup) {
          navHtml += '<div class="nav-label">' + U.esc(r.group) + '</div>';
          lastGroup = r.group;
        }
        navHtml += '<a class="nav-item" href="#/' + r.id + '" data-route="' + r.id + '">' +
          I(r.icon, 'nav-ico') + '<span>' + r.name + '</span>' +
          (r.badge === 'pending' ? '<span class="nav-badge zero" data-badge="pending">0</span>' : '') + '</a>';
      });

      var pointOpts = st.points.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === cur.id ? ' selected' : '') + '>' +
          p.code + ' · ' + U.esc(p.name) + (p.status !== 'online' ? '（' + (S.POINT_STATUS[p.status] || {}).name + '）' : '') + '</option>';
      }).join('');

      var html =
        '<div class="shell">' +
        '<aside class="sidebar" id="sidebar">' +
        '<div class="brand"><div class="brand-mark">' +
        '<svg viewBox="0 0 48 48" width="22" height="22"><path d="M18 15v18M18 24l9-9M18 24l9 9" stroke="#fff" stroke-width="2.8" stroke-linecap="round" fill="none"/><circle cx="30" cy="17" r="2" fill="#fff" opacity=".9"/></svg>' +
        '</div><div class="brand-txt"><strong>K1 智巡</strong><span>EDGE VISION PATROL</span></div></div>' +
        '<nav class="nav" id="nav">' + navHtml + '</nav>' +
        '<div class="side-foot"><div class="device-card">' +
        '<div class="row"><b>边缘节点</b><span class="dot"></span></div>' +
        '<div class="row" style="margin-top:4px"><span>当前点位</span><b id="sidePoint">' + U.esc(cur.name) + '</b></div>' +
        '<div class="row" style="margin-top:3px"><span>设备 SN</span><span class="k">' + U.esc(cur.k1Sn) + '</span></div>' +
        '<div class="row" style="margin-top:3px"><span>算力负载</span><span class="k" id="sideLoad">CPU 32% · NPU 41%</span></div>' +
        '</div></div>' +
        '</aside>' +
        '<div class="main">' +
        '<header class="topbar">' +
        '<button class="icon-btn menu-btn" id="menuBtn" aria-label="菜单">' + I('menu') + '</button>' +
        '<div class="page-title" id="pageTitle"><span>数据看板</span><span class="crumb">/ ' + U.esc(st.settings.org.name) + '</span></div>' +
        '<div class="topbar-spacer"></div>' +
        '<div class="point-switch" title="手动切换当前巡检点位">' +
        '<span class="ps-label">当前点位</span><span class="ps-live"></span>' +
        '<select id="pointSelect">' + pointOpts + '</select></div>' +
        '<div class="cloud-chip" id="cloudChip" title="云端同步状态">' + I('cloud') + '<span>本地模式</span></div>' +
        '<div class="user-chip" id="userChip"><div class="user-ava">' + U.esc((u.name || 'U').slice(0, 1)) + '</div>' +
        '<div class="user-meta"><b>' + U.esc(u.name) + '</b><span>' + U.esc(sess.roleName || u.roleName) + '</span></div>' +
        I('down', '') + '</div>' +
        '</header>' +
        '<main class="content" id="viewRoot"></main>' +
        '</div>' +
        '</div>' +
        '<div class="scrim" id="scrim"></div>' +
        '<div class="tabbar" id="tabbar">' +
        TABS.map(function (id) {
          var r = A.ROUTES.filter(function (x) { return x.id === id; })[0];
          if (!A.Auth.can(r.perm)) return '';
          return '<a href="#/' + id + '" data-tab="' + id + '">' + I(r.icon) + '<span>' + r.name.replace('管理', '').replace('归档', '') + '</span>' +
            (id === 'alerts' ? '<span class="tb-badge" data-badge="pending" style="display:none">0</span>' : '') + '</a>';
        }).join('') +
        '</div>';

      U.q('#app').innerHTML = html;
      Shell.bindChrome();
      Shell.updateChrome();
      A.Router.start();
    },

    bindChrome: function () {
      var sess = A.Auth.session();
      U.q('#menuBtn').addEventListener('click', function () { Shell.drawer(true); });
      U.q('#scrim').addEventListener('click', function () { Shell.drawer(false); });
      U.q('#pointSelect').addEventListener('change', function (e) {
        var id = e.target.value;
        var p = S.pointById(id);
        S.set(function (st) { st.currentPointId = id; }, 'point');
        A.UI.toast({ type: 'ok', title: '已切换至 ' + p.name, desc: p.code + ' · ' + p.area + ' · 画面与遥测已同步' });
        if (p.status !== 'online') A.UI.toast({ type: 'warn', title: '该点位当前' + (S.POINT_STATUS[p.status] || {}).name, desc: '演示画面将使用最近一帧缓存' });
      });
      U.q('#userChip').addEventListener('click', function (e) {
        e.stopPropagation();
        if (U.q('#userMenu')) { U.q('#userMenu').remove(); return; }
        var st = S.get();
        var u = st.users.filter(function (x) { return x.id === sess.userId; })[0] || {};
        var menu = U.node('<div class="user-menu" id="userMenu">' +
          '<div class="um-head"><b>' + U.esc(sess.name) + '</b><span>' + U.esc(sess.roleName) + ' · ' + U.esc(sess.username) + '</span>' +
          '<span style="margin-top:3px">上次登录 ' + (u.lastLogin ? U.esc(U.ago(u.lastLogin)) : '首次登录') + '</span></div>' +
          '<button data-m="settings">' + I('settings') + '系统设置</button>' +
          '<button data-m="cloud">' + I('cloud') + '华为云对接</button>' +
          '<button data-m="lock">' + I('lock') + '锁定会话</button>' +
          '<button data-m="logout" class="danger">' + I('logout') + '退出登录</button></div>');
        document.body.appendChild(menu);
        menu.addEventListener('click', function (ev) {
          var b = ev.target.closest('button[data-m]');
          if (!b) return;
          var m = b.getAttribute('data-m');
          menu.remove();
          if (m === 'logout') {
            A.Auth.logout();
            A.UI.toast({ type: 'ok', title: '已退出登录' });
            Shell.renderLogin('已安全退出，请重新登录');
          } else if (m === 'lock') {
            A.Auth.logout();
            Shell.renderLogin('会话已锁定，请重新输入密码');
          } else if (m === 'settings' || m === 'cloud') {
            if (A.Auth.can('admin')) A.Router.go(m);
            else A.UI.toast({ type: 'warn', title: '权限不足', desc: '仅管理员可访问平台配置' });
          }
        });
      });
      document.addEventListener('click', function () {
        var m = U.q('#userMenu'); if (m) m.remove();
      });
      U.on(U.q('#nav'), 'click', '.nav-item', function () { Shell.drawer(false); });
      U.on(U.q('#tabbar'), 'click', 'a', function () { Shell.drawer(false); });
      A.Cloud.onStatus(function () { Shell.updateCloudChip(); });
    },

    drawer: function (open) {
      var sb = U.q('#sidebar'), sc = U.q('#scrim');
      if (!sb) return;
      sb.classList.toggle('open', !!open);
      sc.classList.toggle('on', !!open);
    },

    updateChrome: function () {
      var st = S.get();
      var pending = st.alerts.filter(function (a) { return a.status === 'pending'; }).length;
      U.qa('[data-badge="pending"]').forEach(function (el) {
        el.textContent = pending > 99 ? '99+' : pending;
        if (el.classList.contains('nav-badge')) el.classList.toggle('zero', pending === 0);
        else el.style.display = pending ? 'grid' : 'none';
      });
      var cur = S.currentPoint();
      var sp = U.q('#sidePoint'); if (sp) sp.textContent = cur.name;
      Shell.updateCloudChip();
    },

    updateCloudChip: function () {
      var chip = U.q('#cloudChip');
      if (!chip) return;
      var c = S.get().cloud;
      var s = A.Cloud.getStatus();
      var label = '本地模式', cls = '';
      if (c.enabled && A.Cloud.ready()) {
        if (s === 'syncing') { label = '同步中'; cls = 'syncing'; }
        else if (s === 'ok') { label = '云已连接'; cls = 'ok'; }
        else if (s === 'error') { label = '同步异常'; cls = 'err'; }
        else { label = '云待连接'; cls = 'syncing'; }
      }
      chip.className = 'cloud-chip ' + cls;
      chip.innerHTML = I(s === 'syncing' ? 'refresh' : 'cloud', s === 'syncing' ? 'spin' : '') + '<span>' + label + '</span>';
    },

    setTitle: function (route) {
      var el = U.q('#pageTitle');
      if (!el) return;
      var st = S.get();
      el.innerHTML = '<span>' + U.esc(route.name) + '</span><span class="crumb">/ ' + U.esc(st.settings.org.name) + '</span>';
      U.qa('.nav-item').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-route') === route.id); });
      U.qa('.tabbar a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-tab') === route.id); });
    }
  };

  A.Shell = Shell;
})(window.App);
