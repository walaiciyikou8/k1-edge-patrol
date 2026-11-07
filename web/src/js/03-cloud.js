/* ============================================================
   03 · cloud —— 华为云 OBS 对接（SigV4 浏览器直传 + 状态快照同步）
   ------------------------------------------------------------
   · 产物：state/app-state.json  → 云端数据库快照（OBS 对象）
   · 抓拍：captures/YYYYMMDD/HHmmss_点位_人名.jpg
   · 人脸：faces/F-xxxx_姓名.jpg
   ============================================================ */
(function (A) {
  var U = A.U;
  var status = 'local';
  var statusSubs = [];
  var pushTimer = null;
  var lastError = '';

  function cfg() { return (A.Store.get().cloud || {}); }
  function obs() { return cfg().obs || {}; }
  function pre() { var p = obs().prefix || ''; if (p && p.slice(-1) !== '/') p += '/'; return p; }

  function setStatus(s, err) {
    status = s;
    if (err !== undefined) lastError = err;
    statusSubs.forEach(function (f) { try { f(s, lastError); } catch (e) { } });
  }
  function onStatus(fn) { statusSubs.push(fn); return function () { statusSubs = statusSubs.filter(function (x) { return x !== fn; }); }; }
  function getStatus() { return status; }
  function getError() { return lastError; }

  function ready() {
    var c = cfg();
    return !!(c.enabled && obs().bucket && obs().ak && obs().sk && obs().endpoint);
  }
  function cryptoReady() {
    return !!(window.crypto && window.crypto.subtle && window.isSecureContext);
  }

  function log(text, ok) {
    var c = A.Store.get().cloud;
    c.syncLog = c.syncLog || [];
    c.syncLog.unshift({ at: new Date().toISOString(), text: text, ok: ok !== false });
    if (c.syncLog.length > 24) c.syncLog.length = 24;
  }

  /* ---------------- SigV4 ---------------- */
  var enc = encodeURIComponent;
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function sha256Hex(str) {
    var data = typeof str === 'string' ? new TextEncoder().encode(str) : str;
    return crypto.subtle.digest('SHA-256', data).then(hex);
  }
  function hmac(key, str) {
    var k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    return crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (ck) { return crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(str)); });
  }
  function signKey(secret, dateStamp, region) {
    return hmac('AWS4' + secret, dateStamp)
      .then(function (k1) { return hmac(k1, region); })
      .then(function (k2) { return hmac(k2, 's3'); })
      .then(function (k3) { return hmac(k3, 'aws4_request'); });
  }
  function rfc3986(s) {
    return enc(s).replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
  }
  function canonicalQuery(q) {
    var keys = Object.keys(q || {}).sort();
    return keys.map(function (k) { return rfc3986(k) + '=' + rfc3986(q[k]); }).join('&');
  }

  /**
   * 发起一次已签名的 OBS 请求
   */
  function request(opts) {
    var o = obs();
    if (!ready()) return Promise.reject(new Error('华为云 OBS 尚未配置或未启用'));
    if (!cryptoReady()) return Promise.reject(new Error('浏览器安全上下文不可用（需 https 访问）'));

    var method = opts.method || 'GET';
    var key = (opts.key || '').replace(/^\/+/, '');
    var now = new Date();
    var amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var dateStamp = amzDate.slice(0, 8);
    var region = o.region || 'cn-north-4';
    var host = o.bucket + '.' + o.endpoint;
    var path = '/' + (key ? key.split('/').map(rfc3986).join('/') : '');
    var query = opts.query || {};
    var qs = canonicalQuery(query);
    var body = opts.body;
    var payloadHash;

    var bodyToHash = body === undefined ? '' : (typeof body === 'string' ? body : body);
    var p = (body instanceof Blob)
      ? body.arrayBuffer().then(function (b) { return sha256Hex(b); })
      : sha256Hex(bodyToHash);

    return p.then(function (ph) {
      payloadHash = ph;
      var canonicalHeaders = 'host:' + host + '\n' +
        'x-amz-content-sha256:' + payloadHash + '\n' +
        'x-amz-date:' + amzDate + '\n';
      var signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
      var canonicalRequest = [method, path, qs, canonicalHeaders, signedHeaders, payloadHash].join('\n');
      return sha256Hex(canonicalRequest).then(function (crHash) {
        var scope = dateStamp + '/' + region + '/s3/aws4_request';
        var stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crHash].join('\n');
        return signKey(o.sk, dateStamp, region).then(function (sk) {
          return hmac(sk, stringToSign);
        }).then(function (sigBuf) {
          var sig = hex(sigBuf);
          var auth = 'AWS4-HMAC-SHA256 Credential=' + o.ak + '/' + scope +
            ', SignedHeaders=' + signedHeaders + ', Signature=' + sig;
          var url = 'https://' + host + path + (qs ? '?' + qs : '');
          var headers = {
            'Authorization': auth,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate
          };
          if (opts.contentType) headers['Content-Type'] = opts.contentType;
          if (key && !/\/$/.test(key)) headers['x-amz-acl'] = 'private';
          return fetch(url, {
            method: method, headers: headers,
            body: (method === 'GET' || method === 'HEAD' || method === 'DELETE') ? undefined : body,
            mode: 'cors'
          });
        });
      });
    });
  }

  /* ---------------- 对象操作 ---------------- */
  function putObject(key, content, contentType) {
    return request({ method: 'PUT', key: key, body: content, contentType: contentType || 'application/octet-stream' })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('PUT ' + r.status + ' ' + (t || r.statusText)); });
        return { ok: true, key: key };
      });
  }
  function getObject(key) {
    return request({ method: 'GET', key: key }).then(function (r) {
      if (!r.ok) throw new Error('GET ' + r.status);
      return r.text();
    });
  }
  function deleteObject(key) {
    return request({ method: 'DELETE', key: key }).then(function (r) {
      if (!r.ok && r.status !== 204) throw new Error('DELETE ' + r.status);
      return { ok: true };
    });
  }
  function listObjects(prefix) {
    return request({ method: 'GET', key: '', query: { 'list-type': '2', 'prefix': prefix || pre(), 'max-keys': '1000' } })
      .then(function (r) {
        if (!r.ok) throw new Error('LIST ' + r.status);
        return r.text();
      }).then(function (xml) {
        var doc = new DOMParser().parseFromString(xml, 'text/xml');
        return Array.prototype.map.call(doc.getElementsByTagName('Contents'), function (n) {
          var g = function (tag) { var e = n.getElementsByTagName(tag)[0]; return e ? e.textContent : ''; };
          return { key: g('Key'), size: parseInt(g('Size'), 10) || 0, modified: g('LastModified') };
        });
      });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/svg+xml';
    var bin = atob(parts[1] || '');
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* thumb 可能是 dataURL，也可能是 K1 桥接的图片直链（推荐，省 localStorage） */
  function thumbToBlob(thumb) {
    if (!thumb) return Promise.resolve(null);
    if (String(thumb).indexOf('data:') === 0) return Promise.resolve(dataUrlToBlob(thumb));
    return fetch(thumb).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    });
  }

  /* ---------------- 业务动作 ---------------- */
  function test() {
    setStatus('syncing');
    return listObjects(pre() + 'state/')
      .then(function (list) {
        setStatus('ok', '');
        log('连接测试成功，桶内已有 ' + list.length + ' 个状态对象', true);
        A.Store.commit('cloud-log');
        return { ok: true, count: list.length };
      })
      .catch(function (e) {
        setStatus('error', e.message || String(e));
        log('连接测试失败：' + (e.message || e), false);
        A.Store.commit('cloud-log');
        return { ok: false, error: e.message || String(e) };
      });
  }

  function pushState(reason) {
    if (!ready()) return Promise.resolve({ ok: false, skipped: true });
    setStatus('syncing');
    var json = JSON.stringify({
      meta: A.Store.get().meta,
      points: A.Store.get().points,
      faces: A.Store.get().faces.map(function (f) {
        var c = {}; for (var k in f) if (k !== 'photo') c[k] = f[k]; return c;
      }),
      alerts: A.Store.get().alerts.map(function (a) {
        var c = {}; for (var k in a) if (k !== 'snapshot') c[k] = a[k]; return c;
      }),
      archives: A.Store.get().archives.map(function (a) {
        var c = {}; for (var k in a) if (k !== 'thumb') c[k] = a[k]; return c;
      }),
      currentPointId: A.Store.get().currentPointId,
      settings: A.Store.get().settings
    });
    return putObject(pre() + 'state/app-state.json', json, 'application/json; charset=utf-8')
      .then(function () {
        var c = A.Store.get().cloud;
        c.lastSyncAt = new Date().toISOString();
        c.stats.bytes = json.length;
        setStatus('ok', '');
        log('状态快照已同步 ' + U.fmtBytes(json.length) + (reason ? '（' + reason + '）' : ''), true);
        A.Store.commit('cloud-log');
        return { ok: true, bytes: json.length };
      })
      .catch(function (e) {
        setStatus('error', e.message || String(e));
        log('状态同步失败：' + (e.message || e), false);
        A.Store.commit('cloud-log');
        return { ok: false, error: e.message || String(e) };
      });
  }

  function uploadFace(face) {
    if (!ready()) return Promise.resolve({ ok: false, skipped: true });
    var key = pre() + 'faces/' + face.code + '_' + face.name + '.jpg';
    var blob = dataUrlToBlob(face.photo);
    return putObject(key, blob, blob.type || 'image/svg+xml').then(function () {
      face.photoKey = key;
      face.featStatus = 'synced';
      log('人脸上传成功：' + key + ' · ' + U.fmtBytes(blob.size), true);
      return { ok: true, key: key, size: blob.size };
    }).catch(function (e) {
      face.featStatus = 'failed';
      log('人脸上传失败：' + face.code + ' ' + (e.message || e), false);
      return { ok: false, error: e.message || String(e) };
    });
  }

  function uploadArchive(arc) {
    if (!ready()) return Promise.resolve({ ok: false, skipped: true });
    var key = pre() + (arc.fileKey || ('captures/' + U.stamp(arc.occurredAt) + '_' + arc.pointName + '_' + arc.personName + '.jpg'));
    return thumbToBlob(arc.thumb).then(function (blob) {
      if (!blob) throw new Error('抓拍图不可用（未取到）');
      return putObject(key, blob, blob.type || 'image/jpeg').then(function () {
        arc.uploaded = true; arc.size = blob.size;
        log('归档上传成功：' + key, true);
        return { ok: true };
      });
    }).catch(function (e) {
      log('归档上传失败：' + (e.message || e), false);
      return { ok: false, error: e.message || String(e) };
    });
  }

  /** 全量同步：人脸 → 归档 → 状态快照 */
  function syncAll() {
    if (!ready()) return Promise.resolve({ ok: false, skipped: true });
    setStatus('syncing');
    var pendingFaces = A.Store.get().faces.filter(function (f) { return f.featStatus !== 'synced' || !f.photoKey; });
    var pendingArcs = A.Store.get().archives.filter(function (a) { return !a.uploaded; }).slice(0, 20);
    log('开始全量同步：人脸 ' + pendingFaces.length + ' 张 · 归档 ' + pendingArcs.length + ' 条', true);
    A.Store.commit('cloud-log');
    var seq = Promise.resolve();
    pendingFaces.forEach(function (f) { seq = seq.then(function () { return uploadFace(f); }); });
    pendingArcs.forEach(function (a) { seq = seq.then(function () { return uploadArchive(a); }); });
    return seq.then(function () { return pushState('全量同步'); }).then(function (r) {
      A.Store.get().cloud.stats.objects = A.Store.get().faces.length + A.Store.get().archives.length;
      A.Store.commit('cloud-log');
      return r;
    });
  }

  function pullState() {
    if (!ready()) return Promise.resolve({ ok: false, skipped: true });
    setStatus('syncing');
    return getObject(pre() + 'state/app-state.json').then(function (txt) {
      var remote = JSON.parse(txt);
      setStatus('ok', '');
      log('已拉取云端快照（rev ' + ((remote.meta && remote.meta.rev) || '?') + '）', true);
      return { ok: true, remote: remote };
    }).catch(function (e) {
      setStatus('error', e.message || String(e));
      log('拉取云端快照失败：' + (e.message || e), false);
      return { ok: false, error: e.message || String(e) };
    });
  }

  function onLocalChange(state) {
    var c = state.cloud || {};
    if (!c.enabled || !c.autoSync || !ready()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushState('自动同步'); }, 2500);
  }

  function estimateUsage() {
    var s = A.Store.get();
    var bytes = s.archives.reduce(function (n, a) { return n + (a.size || 0); }, 0) +
      s.faces.reduce(function (n, f) { return n + U.base64Size(f.photo); }, 0);
    return { bytes: bytes, quota: 5 * 1024 * 1024 * 1024 };
  }

  A.Cloud = {
    getStatus: getStatus, getError: getError, onStatus: onStatus, setStatus: setStatus,
    ready: ready, cryptoReady: cryptoReady, cfg: cfg,
    test: test, pushState: pushState, pullState: pullState, syncAll: syncAll,
    uploadFace: uploadFace, uploadArchive: uploadArchive,
    listObjects: listObjects, putObject: putObject, getObject: getObject, deleteObject: deleteObject,
    dataUrlToBlob: dataUrlToBlob, thumbToBlob: thumbToBlob, estimateUsage: estimateUsage,
    objectKeyPrefix: pre
  };
})(window.App);
