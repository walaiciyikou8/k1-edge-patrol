/* ============================================================
   04 · auth —— 登录认证 / 会话 / 角色权限
   ============================================================ */
(function (A) {
  var U = A.U;
  var SKEY = 'k1_session';
  var SALT = '#k1';
  var PERMS = {
    admin: ['*'],
    patrol: ['dashboard.view', 'points.view', 'faces.view', 'alerts.view', 'alerts.handle', 'timeline.view', 'timeline.export'],
    viewer: ['dashboard.view', 'points.view', 'alerts.view', 'timeline.view']
  };

  function hashPwd(p) { return String(U.hash(String(p) + SALT)); }
  function store() { return localStorage.getItem(SKEY) ? localStorage : sessionStorage; }

  function readSession() {
    var cands = [];
    try { var a = localStorage.getItem(SKEY); if (a) cands.push(a); } catch (e) { }
    try { var b = sessionStorage.getItem(SKEY); if (b) cands.push(b); } catch (e) { }
    for (var i = 0; i < cands.length; i++) {
      var s = null;
      try { s = JSON.parse(cands[i]); } catch (e) { continue; }
      if (!s || !s.token) continue;
      if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) continue;
      return s;
    }
    if (cands.length) clear();
    return null;
  }
  function writeSession(s, remember) {
    clear();
    (remember ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(s));
  }
  function clear() {
    try { localStorage.removeItem(SKEY); } catch (e) { }
    try { sessionStorage.removeItem(SKEY); } catch (e) { }
  }

  var Auth = {
    hashPwd: hashPwd,
    session: readSession,

    login: function (username, password, remember) {
      var u = String(username || '').trim();
      var p = String(password || '');
      if (!u || !p) return { ok: false, error: '请输入账号与密码' };
      var user = A.Store.get().users.filter(function (x) { return x.username.toLowerCase() === u.toLowerCase(); })[0];
      if (!user) return { ok: false, error: '账号不存在，请检查后重试' };
      if (String(user.pwd) !== hashPwd(p)) return { ok: false, error: '密码错误，请重新输入' };
      var hours = 8;
      var s = {
        userId: user.id, username: user.username, name: user.name,
        role: user.role, roleName: user.roleName,
        token: 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
        loginAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + hours * 3600e3).toISOString()
      };
      writeSession(s, remember);
      A.Store.set(function (st) {
        var t = st.users.filter(function (x) { return x.id === user.id; })[0];
        if (t) t.lastLogin = new Date().toISOString();
      }, 'silent');
      return { ok: true, session: s };
    },

    logout: function () { clear(); },

    current: function () { return readSession(); },

    require: function () {
      var s = readSession();
      if (!s) return null;
      return s;
    },

    touch: function () {
      var s = readSession();
      if (!s) return null;
      s.expiresAt = new Date(Date.now() + 8 * 3600e3).toISOString();
      try { (localStorage.getItem(SKEY) ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(s)); } catch (e) { }
      return s;
    },

    can: function (perm) {
      var s = readSession();
      if (!s) return false;
      var list = PERMS[s.role] || [];
      return list.indexOf('*') >= 0 || list.indexOf(perm) >= 0;
    },
    perms: PERMS
  };

  A.Auth = Auth;
})(window.App);
