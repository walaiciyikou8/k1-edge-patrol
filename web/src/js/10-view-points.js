/* ============================================================
   10 · view · 巡检点管理（手动切换点位模拟）
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;

  /* ---------------- 共享动作：K1 事件产生 ----------------
     分类规则：
       suspect（重点关注）→ 危险告警，进「告警中心」，扬声器播报、上云
       staff / vip（内部员工 / 访客）→ 正常通行记录，仅进时间轴，不告警
       unknown（陌生人）→ 抓拍记录「陌生访客」，仅进时间轴，不告警           */
  A.Actions = {
    pickEvent: function (opts, st) {
      if (opts.faceId) {
        var f = S.faceById(opts.faceId);
        return { face: f, cat: f ? f.cat : 'unknown' };
      }
      var roll = Math.random();
      if (roll < 0.50) {
        var sus = st.faces.filter(function (x) { return x.cat === 'suspect'; });
        if (sus.length) return { face: sus[Math.floor(Math.random() * sus.length)], cat: 'suspect' };
      } else if (roll < 0.85) {
        var wp = st.faces.filter(function (x) { return x.cat === 'staff' || x.cat === 'vip'; });
        if (wp.length) return { face: wp[Math.floor(Math.random() * wp.length)], cat: wp[0].cat };
      }
      return { face: null, cat: 'unknown' };
    },
    buildAlert: function (face, point, opts) {
      opts = opts || {};
      var now = new Date();
      var base = { 3: 0.945, 2: 0.905, 1: 0.86, 0: 0.835 }[face.level] || 0.86;
      var sim = U.round(U.clamp(opts.similarity || (base + (Math.random() - 0.5) * 0.04), 0.7, 0.995), 3);
      var tel = A.Telemetry.last || A.Telemetry.tick();
      var sTpl = S.get().settings.speaker;
      return {
        id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        code: S.nextAlertCode(now),
        pointId: point.id, pointName: point.name,
        faceId: face.id, personName: face.name, personCode: face.code, cat: face.cat,
        similarity: sim, level: opts.level !== undefined ? opts.level : face.level,
        status: 'pending',
        occurredAt: now.toISOString(),
        receivedAt: new Date(now.getTime() + 260).toISOString(),
        snapshot: A.Mock.scene(point.id + now.getTime(), { person: true }),
        snapshotKey: 'captures/' + U.stamp(now).slice(0, 8) + '/' + U.stamp(now) + '_' + point.name + '_' + face.name + '.jpg',
        speaker: {
          ok: !!sTpl.enabled,
          text: S.speakerText(point.name, face.name, (sim * 100).toFixed(0), sTpl.template),
          at: new Date(now.getTime() + 420).toISOString()
        },
        k1: {
          cpu: tel.cpu, npu: tel.npu, fps: tel.fps, inferMs: tel.inferMs,
          device: point.k1Sn, decodeMs: tel.decodeMs, matchMs: tel.matchMs
        },
        handler: '', handledAt: '', note: '', archived: false,
        trace: [
          { at: now.toISOString(), by: 'K1 端侧', action: '识别到人脸并抓拍', note: 'NPU 推理 ' + tel.inferMs + 'ms · 相似度 ' + (sim * 100).toFixed(1) + '%' },
          { at: new Date(now.getTime() + 420).toISOString(), by: 'K1 端侧', action: '扬声器播报提醒', note: 'TTS 输出 ×' + (sTpl.repeat || 2) + '，音量 ' + (point.volume || 70) + '%' }
        ]
      };
    },
    buildArchive: function (kind, face, point, opts) {
      opts = opts || {};
      var now = new Date();
      var tel = A.Telemetry.last || A.Telemetry.tick();
      var name = kind === 'stranger' ? '陌生访客' : (face ? face.name : '未识别');
      var code = kind === 'stranger' ? '—' : (face ? face.code : '—');
      var cat = kind === 'stranger' ? 'unknown' : (face ? face.cat : 'unknown');
      var sim = U.round(0.80 + Math.random() * 0.15, 3);
      return {
        id: (kind === 'pass' ? 'pass_' : 'str_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        alertId: '', pointId: point.id, pointName: point.name,
        faceId: face ? face.id : '', personName: name, personCode: code, cat: cat, level: 0, kind: kind,
        similarity: sim,
        occurredAt: now.toISOString(), archivedAt: now.toISOString(),
        fileKey: 'captures/' + U.stamp(now).slice(0, 8) + '/' + U.stamp(now) + '_' + point.name + '_' + name + '.jpg',
        thumb: A.Mock.scene(point.id + now.getTime(), { person: true }),
        size: 240000 + (U.hash(kind + now.getTime()) % 200000),
        uploaded: !A.Cloud.ready(),
        note: kind === 'stranger' ? '未匹配人脸库 · 已抓拍记录' : (cat === 'vip' ? '访客白名单识别 · 正常通行' : '内部员工识别 · 正常通行'),
        k1: { cpu: tel.cpu, npu: tel.npu, fps: tel.fps, inferMs: tel.inferMs, device: point.k1Sn }
      };
    },
    raise: function (opts) {
      opts = opts || {};
      var st = S.get();
      var point = opts.pointId ? S.pointById(opts.pointId) : S.currentPoint();
      var dec = A.Actions.pickEvent(opts, st);
      var face = dec.face, cat = dec.cat;

      if (cat === 'suspect') {
        var alert = A.Actions.buildAlert(face, point, opts);
        S.set(function (s) {
          s.alerts.unshift(alert);
          if (face) { var f = s.faces.filter(function (x) { return x.id === face.id; })[0]; if (f) f.hitCount = (f.hitCount || 0) + 1; }
        }, 'alerts');
        A.UI.beep('alert');
        A.UI.toast({
          type: alert.level >= 2 ? 'err' : 'warn',
          title: '收到 K1 告警 · ' + alert.pointName,
          desc: '命中重点关注人员 ' + alert.personName + ' · 相似度 ' + (alert.similarity * 100).toFixed(1) + '%',
          timeout: 4200
        });
        return { kind: 'alert', id: alert.id, cat: cat };
      }

      var arc = A.Actions.buildArchive(cat === 'unknown' ? 'stranger' : 'pass', face, point, opts);
      S.set(function (s) { s.archives.unshift(arc); }, 'archives');
      if (cat === 'unknown') {
        A.UI.toast({ type: 'info', title: '发现陌生访客 · ' + point.name, desc: '已抓拍并记录至时间轴（未匹配人脸库）', timeout: 3600 });
      } else {
        A.UI.toast({ type: 'ok', title: (cat === 'vip' ? '访客识别 · ' : '员工识别 · ') + point.name, desc: face.name + ' 正常通行（白名单）', timeout: 3200 });
      }
      A.Shell.updateChrome();
      return { kind: arc.kind, id: arc.id, cat: cat };
    }
  };

  /* ---------------- 地图 ---------------- */
  function mapSvg(st) {
    var W = 480, H = 300;
    var s = '<svg class="map-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    s += '<defs><pattern id="gridp" width="24" height="24" patternUnits="userSpaceOnUse">' +
      '<path d="M24 0H0v24" fill="none" stroke="#e7f0fa" stroke-width="1"/></pattern></defs>';
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#gridp)"/>';
    /* 道路 */
    s += '<path d="M0 196h480" stroke="#cddff1" stroke-width="18" stroke-linecap="round"/>';
    s += '<path d="M0 196h480" stroke="#fbfdff" stroke-width="12" stroke-dasharray="14 12"/>';
    s += '<path d="M196 0v300" stroke="#cddff1" stroke-width="14"/>';
    s += '<path d="M196 0v300" stroke="#fbfdff" stroke-width="9" stroke-dasharray="12 11"/>';
    /* 建筑 */
    var bl = [
      { x: 28, y: 34, w: 122, h: 84, label: 'A 区 · 主门岗', c: '#e2eeff' },
      { x: 176, y: 26, w: 128, h: 96, label: 'B 区 · 一号楼', c: '#e0f2ec' },
      { x: 322, y: 26, w: 128, h: 96, label: 'B 区 · 二号楼', c: '#e0f2ec' },
      { x: 320, y: 212, w: 132, h: 62, label: 'D 区 · 生活区', c: '#eee9ff' },
      { x: 30, y: 212, w: 140, h: 62, label: 'C 区 · 车库坡道', c: '#fff2dd' }
    ];
    bl.forEach(function (b) {
      s += '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="9" fill="' + b.c + '" stroke="#d8e5f4"/>';
      s += '<text x="' + (b.x + 10) + '" y="' + (b.y + 18) + '" font-size="9" fill="#7e93a8">' + U.esc(b.label) + '</text>';
    });
    /* 停车场 / 绿化 */
    s += '<circle cx="420" cy="120" r="20" fill="#e8f6ee" stroke="#d3ead9"/>';
    s += '<text x="420" y="123" font-size="8" fill="#7d90a8" text-anchor="middle">绿化</text>';
    s += '<text x="8" y="20" font-size="8.5" fill="#a8b8c9">园区平面示意 · 点击标记切换点位</text>';
    /* 标记 */
    st.points.forEach(function (p) {
      var cx = p.x / 100 * W, cy = p.y / 100 * H;
      var col = (S.POINT_STATUS[p.status] || {}).color || '#8b9cb1';
      var active = p.id === st.currentPointId;
      s += '<g class="marker' + (active ? ' active' : '') + '" data-point="' + p.id + '" transform="translate(' + cx + ',' + cy + ')">';
      s += '<circle class="mk-halo" r="17" fill="' + col + '" opacity="' + (active ? '.16' : '0') + '"/>';
      s += '<circle r="' + (active ? 8.4 : 6.4) + '" fill="' + col + '" opacity=".18"/>';
      s += '<g class="mk-core"><circle r="' + (active ? 4.8 : 3.8) + '" fill="' + col + '" stroke="#fff" stroke-width="2"/>' +
        (active ? '<circle r="9" fill="none" stroke="' + col + '" stroke-width="1.2" stroke-dasharray="3 3"/>' : '') + '</g>';
      s += '<text class="mk-label" x="0" y="' + (active ? 22 : 17) + '" text-anchor="middle" stroke="#f4f9ff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">' + U.esc(p.name) + '</text>';
      s += '</g>';
    });
    s += '</svg>';
    return s;
  }

  function render(root) {
    var st = S.get();
    var cur = S.currentPoint();
    var tel = A.Telemetry.tick();
    var recent = st.alerts.filter(function (a) { return a.pointId === cur.id; }).slice(0, 4);

    root.innerHTML =
      '<div class="view-anim">' +
      '<div class="sec-head"><div><h2>巡检点管理</h2>' +
      '<p>共 ' + st.points.length + ' 个监控点位 · 手动切换即可在演示中模拟巡检人员巡查不同点位</p></div><div class="grow"></div>' +
      '<div class="btn-group">' +
      '<button class="btn" id="ptToggleLive">' + I('refresh') + '刷新画面</button>' +
      '<button class="btn primary" id="ptAdd">' + I('plus') + '新增点位</button></div></div>' +

      '<div class="points-layout">' +
      '<div class="card"><div class="card-head"><h3>' + I('pin') + '园区点位分布</h3>' +
      '<div class="grow"></div><span class="sub">点击标记切换当前点位</span></div>' +
      '<div class="card-body"><div class="map-wrap">' + mapSvg(st) +
      '<div class="map-legend">' +
      '<span><i style="background:#12a06a"></i>在线</span>' +
      '<span><i style="background:#e08b06"></i>维护中</span>' +
      '<span><i style="background:#8b9cb1"></i>离线</span></div>' +
      '<div class="map-hint">当前：' + U.esc(cur.code) + ' ' + U.esc(cur.name) + '</div></div></div></div>' +

      '<div class="card"><div class="card-head"><h3>' + I('camera') + '当前监控点位</h3>' +
      '<div class="grow"></div>' + A.UI.pointStatusBadge(cur.status) + '</div>' +
      '<div class="card-body">' +
      '<div class="live-view" id="liveView">' +
      '<img src="' + A.Mock.scene(cur.id + Math.floor(Date.now() / 8000), { person: true, box: false }) + '" alt="实时画面">' +
      '<div class="live-badge"><i></i>LIVE</div>' +
      '<div class="live-meta">' + U.esc(cur.resolution) + '@' + cur.fps + 'fps<br>' + U.esc(cur.k1Sn) + '</div>' +
      '<div class="live-bottom"><span class="lb-tag">' + U.esc(cur.code) + '</span>' +
      '<span>人脸检测 · NPU ' + tel.npu + '%</span>' +
      '<span style="margin-left:auto" id="liveClock">' + U.fmtDT(new Date()) + '</span></div>' +
      '</div>' +
      '<div class="live-actions">' +
      '<button class="btn primary" id="ptSim">' + I('camera') + '模拟一次 K1 抓拍</button>' +
      '<button class="btn" id="ptSwitch">' + I('pin') + '切换到此点位</button>' +
      '<button class="btn" id="ptEdit">' + I('edit') + '编辑点位</button>' +
      '</div>' +
      '<div class="point-info">' +
      '<div><dt>所属区域</dt><dd>' + U.esc(cur.area) + '</dd></div>' +
      '<div><dt>楼层</dt><dd>' + U.esc(cur.floor) + '</dd></div>' +
      '<div><dt>摄像头 SN</dt><dd class="mono" style="font-size:11px">' + U.esc(cur.camSn) + '</dd></div>' +
      '<div><dt>K1 设备 SN</dt><dd class="mono" style="font-size:11px">' + U.esc(cur.k1Sn) + '</dd></div>' +
      '<div><dt>扬声器音量</dt><dd>' + cur.volume + '%</dd></div>' +
      '<div><dt>点位备注</dt><dd title="' + U.esc(cur.note) + '">' + U.esc(cur.note) + '</dd></div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<span style="font-size:12.5px;font-weight:600">本点位最近抓拍</span><div class="grow"></div>' +
      '<a class="btn ghost sm" href="#/alerts">全部' + I('right') + '</a></div>' +
      (recent.length ? '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">' + recent.map(function (a) {
        return '<div data-alert="' + a.id + '" style="flex:0 0 auto;width:106px;cursor:pointer">' +
          '<img src="' + a.snapshot + '" style="width:106px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">' +
          '<div style="font-size:10.5px;color:var(--text-3);margin-top:3px">' + U.fmtTimeShort(a.occurredAt) + ' · ' + U.esc(a.personName) + '</div></div>';
      }).join('') + '</div>' : '<div class="hint" style="font-size:11.5px;color:var(--text-3)">该点位暂无抓拍记录</div>') +
      '</div></div>' +
      '</div>' +

      '<div class="card" style="margin-top:14px"><div class="card-head"><h3>' + I('list') + '点位列表</h3>' +
      '<div class="grow"></div><span class="sub">共 ' + st.points.length + ' 个点位</span></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>点位</th><th class="h-sm">区域 / 楼层</th><th class="h-sm">K1 设备</th><th>状态</th><th class="h-sm">累计告警</th><th style="text-align:right">操作</th>' +
      '</tr></thead><tbody>' +
      st.points.map(function (p) {
        var cnt = st.alerts.filter(function (a) { return a.pointId === p.id; }).length;
        var isCur = p.id === st.currentPointId;
        return '<tr class="' + (isCur ? 'point-row-cur' : '') + '" data-point-row="' + p.id + '">' +
          '<td><div class="cell-main">' + U.esc(p.name) + (isCur ? ' <span class="badge info sm">当前</span>' : '') + '</div>' +
          '<div class="cell-sub mono">' + U.esc(p.code) + '</div></td>' +
          '<td class="h-sm">' + U.esc(p.area) + '<div class="cell-sub">' + U.esc(p.floor) + ' · ' + U.esc(p.resolution) + '</div></td>' +
          '<td class="h-sm mono" style="font-size:11px">' + U.esc(p.k1Sn) + '<div class="cell-sub">' + U.esc(p.camSn) + '</div></td>' +
          '<td>' + A.UI.pointStatusBadge(p.status) + '</td>' +
          '<td class="h-sm num">' + cnt + '</td>' +
          '<td><div class="tbl-actions">' +
          '<button class="btn-icon" data-act="switch" title="切到此点位">' + I('target') + '</button>' +
          '<button class="btn-icon" data-act="edit" title="编辑">' + I('edit') + '</button>' +
          '<button class="btn-icon danger" data-act="del" title="删除">' + I('trash') + '</button>' +
          '</div></td></tr>';
      }).join('') +
      '</tbody></table></div></div></div>';

    /* 交互 */
    U.on(root, 'click', '.marker', function (e, t) { switchPoint(t.getAttribute('data-point')); });
    U.on(root, 'click', '[data-alert]', function (e, t) { A.Router.go('alerts', { alert: t.getAttribute('data-alert') }); });
    U.on(root, 'click', '[data-point-row] .btn-icon', function (e, t) {
      e.stopPropagation();
      var id = t.closest('tr').getAttribute('data-point-row');
      var act = t.getAttribute('data-act');
      if (act === 'switch') switchPoint(id);
      if (act === 'edit') openPointForm(id, root);
      if (act === 'del') removePoint(id);
    });
    U.q('#ptSwitch').addEventListener('click', function () { switchPoint(cur.id); });
    U.q('#ptEdit').addEventListener('click', function () { openPointForm(cur.id, root); });
    U.q('#ptAdd').addEventListener('click', function () { openPointForm(null, root); });
    U.q('#ptSim').addEventListener('click', function () {
      var a = A.Actions.raise({ pointId: cur.id });
      render(root);
      setTimeout(function () {
        if (a.kind === 'alert') A.Router.go('alerts', { alert: a.id });
        else A.Router.go('timeline');
      }, 500);
    });
    U.q('#ptToggleLive').addEventListener('click', function () {
      var img = U.q('#liveView img');
      if (img) img.src = A.Mock.scene(cur.id + Math.floor(Date.now() / 1000), { person: true, box: false });
      A.UI.toast({ type: 'ok', title: '画面已刷新', desc: cur.name + ' · ' + cur.resolution + '@' + cur.fps + 'fps' });
    });

    /* 画面时钟 */
    var clock = U.q('#liveClock');
    if (clock) {
      var t = setInterval(function () {
        if (!document.body.contains(clock)) { clearInterval(t); return; }
        clock.textContent = U.fmtDT(new Date());
      }, 1000);
      A.Views.points._clock = t;
    }
  }

  function switchPoint(id) {
    var p = S.pointById(id);
    if (!p) return;
    if (p.id === S.get().currentPointId) {
      A.UI.toast({ type: 'info', title: '已是当前点位', desc: p.code + ' ' + p.name });
      return;
    }
    S.set(function (st) { st.currentPointId = id; }, 'point');
    var sel = U.q('#pointSelect'); if (sel) sel.value = id;
    A.Telemetry.last = null;
    A.UI.toast({ type: 'ok', title: '已切换至 ' + p.name, desc: p.code + ' · ' + p.area + ' · 端侧遥测已重置' });
    if (A.Router.current === 'points') render(U.q('#viewRoot'));
  }

  function openPointForm(id, root) {
    var p = id ? S.pointById(id) : null;
    var isNew = !p;
    var body = '<div class="form-grid">' +
      f('点位名称', '<input class="input" id="pName" value="' + U.esc(p ? p.name : '') + '" placeholder="如 东门主入口">', 1) +
      f('点位编号', '<input class="input mono" id="pCode" value="' + U.esc(p ? p.code : 'P-0' + (S.get().points.length + 1)) + '">') +
      f('所属区域', '<input class="input" id="pArea" value="' + U.esc(p ? p.area : '') + '" placeholder="如 A 区 · 人车混行">') +
      f('楼层', '<input class="input" id="pFloor" value="' + U.esc(p ? p.floor : '1F') + '">') +
      f('摄像头 SN', '<input class="input mono" id="pCam" value="' + U.esc(p ? p.camSn : '') + '">') +
      f('K1 设备 SN', '<input class="input mono" id="pK1" value="' + U.esc(p ? p.k1Sn : 'K1S-2601-E01') + '">') +
      f('运行状态', '<select class="select" id="pStatus">' + Object.keys(S.POINT_STATUS).map(function (k) {
        return '<option value="' + k + '"' + (p && p.status === k ? ' selected' : '') + '>' + S.POINT_STATUS[k].name + '</option>';
      }).join('') + '</select>') +
      f('分辨率', '<select class="select" id="pRes">' + ['720P', '1080P', '2K'].map(function (r) {
        return '<option' + (p && p.resolution === r ? ' selected' : '') + '>' + r + '</option>';
      }).join('') + '</select>') +
      f('帧率 FPS', '<input class="input" id="pFps" type="number" min="5" max="60" value="' + (p ? p.fps : 25) + '">') +
      f('扬声器音量 (%)', '<input class="input" id="pVol" type="number" min="0" max="100" value="' + (p ? p.volume : 70) + '">') +
      f('地图坐标 X (%)', '<input class="input" id="pX" type="number" min="2" max="98" value="' + (p ? p.x : 50) + '">') +
      f('地图坐标 Y (%)', '<input class="input" id="pY" type="number" min="2" max="98" value="' + (p ? p.y : 50) + '">') +
      '<div class="field span2"><label>备注</label><textarea class="input" id="pNote">' + U.esc(p ? p.note : '') + '</textarea></div>' +
      '</div>';

    A.UI.modal({
      title: isNew ? '新增巡检点位' : '编辑点位 · ' + p.name,
      sub: '点位信息会同步下发至 K1 端用于告警上报的设备标识',
      size: 'wide', body: body,
      footer: '<button class="btn" data-act="cancel">取消</button><button class="btn primary" data-act="save">' + I('check') + '保存</button>',
      onMount: function (h) {
        h.foot.querySelector('[data-act="cancel"]').onclick = h.close;
        h.foot.querySelector('[data-act="save"]').onclick = function () {
          var name = U.q('#pName').value.trim();
          if (!name) { A.UI.toast({ type: 'err', title: '请填写点位名称' }); return; }
          var data = {
            name: name, code: U.q('#pCode').value.trim(),
            area: U.q('#pArea').value.trim(), floor: U.q('#pFloor').value.trim(),
            camSn: U.q('#pCam').value.trim(), k1Sn: U.q('#pK1').value.trim(),
            status: U.q('#pStatus').value, resolution: U.q('#pRes').value,
            fps: parseInt(U.q('#pFps').value, 10) || 25,
            volume: U.clamp(parseInt(U.q('#pVol').value, 10) || 70, 0, 100),
            x: U.clamp(parseInt(U.q('#pX').value, 10) || 50, 2, 98),
            y: U.clamp(parseInt(U.q('#pY').value, 10) || 50, 2, 98),
            note: U.q('#pNote').value.trim()
          };
          S.set(function (st) {
            if (id) {
              var t = st.points.filter(function (x) { return x.id === id; })[0];
              for (var k in data) t[k] = data[k];
            } else {
              var nid = 'p_' + Date.now().toString(36);
              data.id = nid;
              st.points.push(data);
            }
          }, 'points');
          h.close();
          A.UI.toast({ type: 'ok', title: isNew ? '已新增点位 ' + name : '点位已保存' });
          render(root || U.q('#viewRoot'));
        };
      }
    });

    function f(label, ctl, req) {
      return '<div class="field"><label>' + label + (req ? '<span class="req">*</span>' : '') + '</label>' + ctl + '</div>';
    }
  }

  function removePoint(id) {
    var p = S.pointById(id);
    var st = S.get();
    if (st.points.length <= 1) { A.UI.toast({ type: 'err', title: '至少保留一个点位' }); return; }
    A.UI.confirm({
      title: '删除点位', danger: true, okText: '删除',
      html: '确定删除点位 <b>' + U.esc(p.name) + '</b> 吗？<br><span style="font-size:12px;color:var(--text-3)">该点位历史告警与归档记录会保留。</span>'
    }).then(function (ok) {
      if (!ok) return;
      S.set(function (s) {
        s.points = s.points.filter(function (x) { return x.id !== id; });
        if (s.currentPointId === id) s.currentPointId = s.points[0].id;
      }, 'points');
      A.UI.toast({ type: 'ok', title: '已删除点位' });
      A.Shell.updateChrome();
      render(U.q('#viewRoot'));
    });
  }

  A.Views = A.Views || {};
  A.Views.points = { render: render, switchPoint: switchPoint, _clock: null, cleanup: function () { if (this._clock) clearInterval(this._clock); } };
})(window.App);
