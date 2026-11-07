/* ============================================================
   15 · app —— 启动 / 路由 / 全局实时模拟
   ============================================================ */
(function (A) {
  var U = A.U;

  var Router = {
    current: null,
    params: null,
    started: false,

    start: function () {
      if (!this.started) {
        window.addEventListener('hashchange', function () {
          if (Router._skipNext) { Router._skipNext = false; return; }
          Router.render();
        });
        this.started = true;
      }
      this.render();
    },
    parse: function () {
      var m = (location.hash || '').match(/^#\/?([\w-]+)/);
      return m ? m[1] : 'dashboard';
    },
    go: function (id, params) {
      Router.params = params || null;
      var target = '#/' + id;
      if (location.hash === target) { Router.render(); return; }
      Router._skipNext = true;
      location.hash = target;
      Router.render();
    },
    refresh: function () { Router.render(true); },

    render: function (isRefresh) {
      var sess = A.Auth.require();
      if (!sess) { A.Shell.renderLogin(); return; }
      var root = U.q('#viewRoot');
      if (!root) { A.Shell.mount(); return; }

      var id = Router.parse();
      var route = A.ROUTES.filter(function (r) { return r.id === id; })[0] || A.ROUTES[0];
      if (!A.Auth.can(route.perm)) {
        A.UI.toast({ type: 'warn', title: '权限不足', desc: '当前角色无法访问「' + route.name + '」' });
        route = A.ROUTES[0];
        if (Router.parse() !== route.id) { location.hash = '#/' + route.id; return; }
      }

      if (Router.current && !isRefresh && A.Views[Router.current] && A.Views[Router.current].cleanup) {
        try { A.Views[Router.current].cleanup(); } catch (e) { }
      }
      A.Shell.setTitle(route);
      var view = A.Views[route.id];
      if (!view) { root.innerHTML = A.UI.emptyBox('页面不存在', '请从左侧导航选择功能'); return; }
      try {
        view.render(root);
      } catch (e) {
        console.error('[view error]', route.id, e);
        root.innerHTML = '<div class="card"><div class="card-body">' +
          A.UI.emptyBox('页面渲染出错', String(e && e.message || e), 'warn') + '</div></div>';
      }
      Router.current = route.id;
      if (!isRefresh) window.scrollTo({ top: 0, behavior: 'auto' });

      /* 深链：直接打开某条告警 */
      if (Router.params && Router.params.alert) {
        var alertId = Router.params.alert;
        Router.params = null;
        setTimeout(function () {
          if (A.Views.alerts && A.Views.alerts.openHandle) A.Views.alerts.openHandle(alertId, U.q('#viewRoot'), true);
        }, 260);
      }
      A.Shell.updateChrome();
    }
  };
  A.Router = Router;

  /* ---------------- 全局实时模拟（K1 端上报） ---------------- */
  var simTimer = null;
  function simStep() {
    var st = A.Store.get();
    var active = !!(st.ui && st.ui.injectSim) && !!A.Auth.require();
    if (active) {
      var roll = Math.random();
      var pointId;
      if (roll < 0.55) pointId = st.currentPointId;
      else {
        var online = st.points.filter(function (p) { return p.status === 'online'; });
        pointId = (online.length ? online[Math.floor(Math.random() * online.length)] : st.points[0]).id;
      }
      var suspectPool = st.faces.filter(function (f) { return f.cat === 'suspect'; });
      var faceId = suspectPool.length && Math.random() > 0.35
        ? suspectPool[Math.floor(Math.random() * suspectPool.length)].id
        : undefined;
      var a = A.Actions.raise({ pointId: pointId, faceId: faceId });
      if (A.Views.alerts && a.kind === 'alert') A.Views.alerts.flash = [a.id];
      if (Router.current === 'alerts' || Router.current === 'dashboard') Router.refresh();
      else A.Shell.updateChrome();
    }
    var next = active ? (14000 + Math.random() * 8000) : 6000;
    simTimer = setTimeout(simStep, next);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    A.Store.init();

    /* 状态变更 → 刷新外壳（徽标 / 点位） */
    A.Store.subscribe(function (reason) {
      A.Shell.updateChrome();
      if (reason === 'point' && Router.current === 'dashboard') Router.refresh();
      if (reason === 'import' || reason === 'reset') { /* 由调用方负责重挂载 */ }
    });

    /* 会话活动续期 */
    var touch = U.throttle(function () { A.Auth.touch(); }, 60000);
    ['click', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, touch, { passive: true });
    });

    /* 视口变化 → 图表重排 */
    var lastW = window.innerWidth;
    window.addEventListener('resize', U.debounce(function () {
      if (Math.abs(window.innerWidth - lastW) < 40) return;
      lastW = window.innerWidth;
      if (A.Auth.require() && Router.current && Router.current !== 'login') Router.refresh();
    }, 260));

    if (A.Auth.session()) {
      A.Shell.mount();
    } else {
      A.Shell.renderLogin();
    }
    setTimeout(simStep, 8000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.App);
