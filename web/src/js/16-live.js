/* ============================================================
   16 · live —— 轮询 K1 板子，把真实告警接入后台
   ------------------------------------------------------------
   数据来源：GET {K1}/api/k1/events （桥接服务，已开 CORS）
   照片：    GET {K1}/captures/<snapshot_key>
   下发放点：POST {K1}/api/k1/actions  { type:'switch_point', location, point_code }

   K1 地址在 02-store 的 k1.url 里配（默认 http://192.168.43.124:8088）。
   事件按 id 去重；命中(suspect)进「告警中心」，其余进「时间轴」，
   照片抓取为 dataURL（和本地 mock 一致，可直接显示、也能交给 03-cloud 上传 OBS）。
   ============================================================ */
(function (A) {
  var U = A.U, S = A.Store;

  var seen = {};           // event id -> true（去重）
  var timer = null;
  var running = false;
  var busy = false;

  function k1cfg() { return (S.get().k1) || {}; }
  function base() { return String(A.Live.base || k1cfg().url || 'http://192.168.43.124:8088').replace(/\/+$/, ''); }
  function api(p) { return base() + p; }

  function findFace(ev) {
    var code = ev.person && ev.person.code, name = ev.person && ev.person.name, st = S.get();
    var f = null;
    if (code) f = st.faces.filter(function (x) { return x.code === code; })[0];
    if (!f && name) f = st.faces.filter(function (x) { return x.name === name; })[0];
    return f;
  }
  function findPoint(ev) {
    var st = S.get(), code = ev.point_code, loc = ev.location, p = null;
    if (code) p = st.points.filter(function (x) { return x.code === code; })[0];
    if (!p && loc) p = st.points.filter(function (x) { return x.name === loc; })[0];
    return p || S.currentPoint();
  }

  /* 校验抓拍直链是否可用，并取到真实字节数。
     不再把整张 1080p 图转 base64 塞进 localStorage（几条就能把 5MB 配额撑爆，
     之后就写不进去、缩略图全是空的）。这里只保留直链，<img> 直接显示，
     需要原图（下载 / 上传 OBS）时再按需 fetch。 */
  function probeShot(url) {
    if (!url) return Promise.resolve({ url: '', size: 0 });
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (b) {
      return { url: url, size: b.size };
    }).catch(function () {
      return { url: '', size: 0 };          // 取不到就留空，避免显示坏图
    });
  }

  function handle(ev) {
    if (!ev || !ev.id || seen[ev.id]) return Promise.resolve();
    seen[ev.id] = true;
    var cat = (ev.person && ev.person.cat) || 'unknown';
    var name = (ev.person && ev.person.name) || '陌生访客';
    var code = (ev.person && ev.person.code) || '';
    var point = findPoint(ev);
    var face = findFace(ev);
    var sim = Number(ev.similarity || 0);
    var occurred = ev.captured_at || new Date().toISOString();
    var km = ev.k1_metrics || {};
    // 中文文件名先百分号编码，存成纯 ASCII 的 URL：
    // 避免 localStorage 往返 / HTML 属性 / <img> 各处编码不一致导致图片 404
    var shotUrl = ev.snapshot_key
      ? api('/captures/' + encodeURI(ev.snapshot_key).replace(/#/g, '%23'))
      : '';

    return probeShot(shotUrl).then(function (shot) {
      var img = shot.url;             // 直链：<img> 可直接显示，下载/上传时再取原图
      var shotSize = shot.size;
      var isAlert = ev.kind === 'alert' || cat === 'suspect';

      if (isAlert) {
        var alert = {
          id: ev.id, code: code,
          pointId: point.id, pointName: ev.location || point.name,
          faceId: face ? face.id : '', personName: name, personCode: code, cat: 'suspect',
          similarity: sim, level: ev.level !== undefined ? ev.level : 1, status: 'pending',
          occurredAt: occurred, receivedAt: new Date().toISOString(),
          snapshot: img, snapshotKey: ev.snapshot_key ? ('captures/' + ev.snapshot_key) : '',
          resolution: '', resolutionName: '', unit: '', source: 'device', deviceSn: ev.device_id || point.k1Sn,
          speaker: {
            ok: true,
            text: '请注意，' + (ev.location || point.name) + ' 发现重点关注人员 ' + name +
                  '，相似度 ' + Math.round(sim * 100) + '%，请巡逻人员立即核实。',
            at: occurred
          },
          k1: { cpu: km.cpu || 0, npu: km.npu || 0, fps: km.fps || 0, inferMs: km.infer_ms || km.inferMs || 0, device: ev.device_id || point.k1Sn },
          handler: '', handledAt: '', note: '', archived: false,
          trace: [
            { at: occurred, by: 'K1 端侧', action: '识别到人脸并抓拍', note: '相似度 ' + (sim * 100).toFixed(1) + '%' },
            { at: occurred, by: 'K1 端侧', action: '扬声器播报提醒', note: '' }
          ]
        };
        S.set(function (s) {
          if (!s.alerts.some(function (a) { return a.id === alert.id; })) s.alerts.unshift(alert);
          if (face) { var f = s.faces.filter(function (x) { return x.id === face.id; })[0]; if (f) f.hitCount = (f.hitCount || 0) + 1; }
        }, 'alerts');
        if (A.UI && A.UI.beep) A.UI.beep('alert');
        if (A.UI && A.UI.toast) A.UI.toast({
          type: alert.level >= 2 ? 'err' : 'warn',
          title: '收到 K1 告警 · ' + alert.pointName,
          desc: '命中重点关注人员 ' + name + ' · 相似度 ' + (sim * 100).toFixed(1) + '%',
          timeout: 4200
        });
        if (A.Views.alerts) A.Views.alerts.flash = [alert.id];
        if (A.Router && (A.Router.current === 'alerts' || A.Router.current === 'dashboard')) A.Router.refresh();
        else if (A.Shell) A.Shell.updateChrome();
        return;
      }

      // pass / stranger → 时间轴
      var kind = (ev.kind === 'stranger' || cat === 'unknown') ? 'stranger' : 'pass';
      var arcName = kind === 'stranger' ? '陌生访客' : name;
      var arc = {
        id: (kind === 'pass' ? 'pass_' : 'str_') + ev.id.replace(/^ev_/, ''),
        alertId: '', pointId: point.id, pointName: ev.location || point.name,
        faceId: face ? face.id : '', personName: arcName,
        personCode: kind === 'stranger' ? '—' : code, cat: kind === 'stranger' ? 'unknown' : cat, level: 0, kind: kind,
        similarity: sim, occurredAt: occurred, archivedAt: new Date().toISOString(),
        fileKey: ev.snapshot_key ? ('captures/' + ev.snapshot_key) : '',
        thumb: img, size: shotSize, uploaded: !(A.Cloud && A.Cloud.ready()),
        note: kind === 'stranger' ? '未匹配人脸库 · 已抓拍记录'
              : (cat === 'vip' ? '访客白名单识别 · 正常通行' : '内部员工识别 · 正常通行'),
        k1: { cpu: km.cpu || 0, npu: km.npu || 0, fps: km.fps || 0, inferMs: km.infer_ms || km.inferMs || 0, device: ev.device_id || point.k1Sn }
      };
      // 已有同 id 记录时：若它是旧版存下来的空图，顺手把新拿到的直链补上（自愈）
      var existed = false;
      S.set(function (s) {
        var old = s.archives.filter(function (x) { return x.id === arc.id; })[0];
        if (old) {
          existed = true;
          if (!old.thumb && arc.thumb) {
            old.thumb = arc.thumb;
            old.size = arc.size;
            old.fileKey = arc.fileKey || old.fileKey;
          }
          return;
        }
        s.archives.unshift(arc);
      }, 'archives');
      if (existed) return;
      if (kind === 'stranger') {
        if (A.UI && A.UI.toast) A.UI.toast({ type: 'info', title: '发现陌生访客 · ' + arc.pointName, desc: '已抓拍并记录至时间轴', timeout: 3600 });
      } else if (A.UI && A.UI.toast) A.UI.toast({ type: 'ok', title: '识别 · ' + arc.pointName, desc: arcName + ' 正常通行（白名单）', timeout: 3200 });
      if (A.Shell) A.Shell.updateChrome();
    });
  }

  function poll() {
    if (busy) return;
    if (!(A.Auth && A.Auth.require())) return;   // 未登录不拉
    busy = true;
    fetch(api('/api/k1/events'), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var evs = (j && j.events) || [];
        var seq = Promise.resolve();
        evs.slice(-40).forEach(function (ev) { seq = seq.then(function () { return handle(ev); }); });
        return seq;
      })
      .then(function () { A.Live.online = true; })
      .catch(function () { A.Live.online = false; })   // 静默：离线/未连上 K1 不打扰、不刷屏
      .then(function () { busy = false; });
  }

  /* 老数据迁移：把已存在的中文图片 URL 统一转成百分号编码（纯 ASCII），
     否则 <img> 加载中文路径时常 404，缩略图变成破图标 */
  function migrateThumbs() {
    S.set(function (s) {
      (s.archives || []).forEach(function (a) {
        if (a.thumb && /[^\x00-\x7F]/.test(a.thumb)) a.thumb = encodeURI(a.thumb).replace(/#/g, '%23');
      });
      (s.alerts || []).forEach(function (a) {
        if (a.snapshot && /[^\x00-\x7F]/.test(a.snapshot)) a.snapshot = encodeURI(a.snapshot).replace(/#/g, '%23');
      });
    }, 'archives');
  }

  function start() {
    if (running) return;
    running = true;
    migrateThumbs();
    poll();
    timer = setInterval(poll, Math.max(2, Number(k1cfg().pollSec) || 4) * 1000);
    setTimeout(pushAllFaces, 1500);   // 登录后把没同步过的人脸推一遍
  }
  function stop() { if (timer) clearInterval(timer); timer = null; running = false; }

  /* 把人脸推进 K1 端侧底库（K1 扫描 gallery/<cat>/<name>/，3 秒内自动热重载）。
     这是「后台上传了人脸，K1 才能认出这个人」的关键一步。 */
  function pushFace(face) {
    if (!face || !face.photo) return Promise.resolve({ ok: false, skipped: true });
    return fetch(api('/api/k1/gallery'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: face.name,
        cat: face.cat || 'suspect',
        code: face.code || '',
        level: face.level || 0,
        note: face.note || '',
        filename: (face.code || face.name || 'face') + '.jpg',
        photo: face.photo
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      S.set(function (s) {
        var t = s.faces.filter(function (x) { return x.id === face.id; })[0];
        if (t) { t.k1Synced = true; t.k1SyncedAt = new Date().toISOString(); }
      }, 'faces');
      return j;
    }).catch(function (e) {
      return { ok: false, error: e.message || String(e) };
    });
  }

  /* 补齐历史人脸：只推还没同步过的，避免每次刷新都重传 */
  function pushAllFaces() {
    var todo = S.get().faces.filter(function (f) { return f.photo && !f.k1Synced; });
    if (!todo.length) return;
    var seq = Promise.resolve();
    todo.forEach(function (f) { seq = seq.then(function () { return pushFace(f); }); });
    seq.then(function () {
      if (A.UI && A.UI.toast) A.UI.toast({
        type: 'ok', title: '底库已同步到 K1',
        desc: todo.length + ' 张人脸已推送，K1 3 秒内生效', timeout: 3600
      });
    });
  }

  /* 后台切巡检点 → 同步给 K1（抓拍改用它命名） */
  function pushPoint(pointId) {
    if (k1cfg().autoSwitch === false) return;
    var p = S.pointById(pointId); if (!p) return;
    try {
      fetch(api('/api/k1/actions'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'switch_point', location: p.name, point_code: p.code })
      });
    } catch (e) { }
  }

  A.Live = {
    base: '',
    online: null,          // null=未探测, true=在线, false=离线
    start: start, stop: stop, poll: poll, pushPoint: pushPoint,
    pushFace: pushFace, pushAllFaces: pushAllFaces
  };

  A.Store.subscribe(function (reason) {
    if (reason === 'point') pushPoint(A.Store.get().currentPointId);
  });

  function boot() { start(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.App);
