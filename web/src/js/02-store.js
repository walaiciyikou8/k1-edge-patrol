/* ============================================================
   02 · store —— 状态、持久化、种子数据
   ============================================================ */
(function (A) {
  var U = A.U, M = A.Mock;
  var KEY = 'k1_state_v1';
  /* 数据模型版本：2 = 告警仅由「重点关注(suspect)」触发，白名单/内部员工/陌生人不再进告警表。
     旧版本浏览器里残留的数据会被自动丢弃并重建种子，避免出现「已改代码但看到的还是旧告警」。 */
  var SCHEMA = 4;
  var state = null, subs = [], persistOk = true;

  /* ---------------- 常量字典 ---------------- */
  var CATS = [
    { id: 'suspect', name: '重点关注', short: '黑名单', color: '#df474d', badge: 'danger' },
    { id: 'staff', name: '内部员工', short: '白名单', color: '#12a06a', badge: 'ok' },
    { id: 'vip', name: '访客白名单', short: '访客', color: '#1f6feb', badge: 'info' },
    { id: 'unknown', name: '陌生访客', short: '陌生人', color: '#8b9cb1', badge: 'muted' }
  ];
  // 人脸库可登记的分类（陌生人 unknown 不可登记，仅作为抓拍记录存在）
  // 这里存放的是 CATS 里的对象引用，视图层直接取 c.id / c.name
  var REG_CATS = CATS.filter(function (c) { return c.id !== 'unknown'; });
  var STATUS = {
    pending: { name: '待处置', badge: 'danger', color: '#df474d' },
    tracking: { name: '跟踪中', badge: 'info', color: '#1f6feb' },
    backup: { name: '待增援', badge: 'violet', color: '#6b5cf0' },
    confirmed: { name: '已确认', badge: 'ok', color: '#12a06a' },
    false: { name: '误报归档', badge: '', color: '#8b9cb1' }
  };
  var LEVELS = { 3: { name: '高危', badge: 'danger' }, 2: { name: '中危', badge: 'warn' }, 1: { name: '关注', badge: 'cyan' }, 0: { name: '常规', badge: 'ok' } };

  /* 处置方式：巡逻员「手持设备在现场」时的四种处理动作
     —— 不做「派发巡逻」（人已在现场），不设「直接归档」（归档是处置的自然结果）
     status  = 处置后告警单进入的状态（对应 STATUS 字典）
     needUnit= 是否需要指定增援对象
     archive = 是否同步写入时间轴归档                                    */
  var RESOLUTIONS = [
    { id: 'onscene', name: '现场处置', badge: 'ok', status: 'confirmed', icon: 'check', needUnit: false, archive: true,
      desc: '已到场盘查、驱离、带离或登记备案' },
    { id: 'track', name: '隐蔽跟踪', badge: 'info', status: 'tracking', icon: 'eye', needUnit: false, archive: false,
      desc: '不惊动目标，保持跟随并持续回传抓拍' },
    { id: 'backup', name: '请求增援', badge: 'violet', status: 'backup', icon: 'shield', needUnit: true, archive: false,
      desc: '呼叫队友 / 值班长 / 辖区派出所到场支援' },
    { id: 'false', name: '误报归档', badge: 'muted', status: 'false', icon: 'x', needUnit: false, archive: true,
      desc: '识别错误，归档用于优化 K1 模型与阈值' }
  ];

  /* 增援对象（选择「请求增援」时出现） */
  var UNITS = [
    { id: 'g-a', name: '同区域巡逻员 · 刘敏', type: 'internal' },
    { id: 'g-b', name: '相邻区域巡逻员 · 孙涛', type: 'internal' },
    { id: 'g-chief', name: '值班长 · 赵磊', type: 'internal' },
    { id: 'g-police', name: '辖区派出所 · 110 联动', type: 'external' }
  ];

  /* 处置通道：处置动作是在哪儿执行的（用于处置人署名溯源） */
  var SOURCES = {
    device: { name: '端侧 LCD', badge: 'cyan' },
    console: { name: '后台作战台', badge: 'info' },
    app: { name: '手机 App', badge: 'muted' }
  };

  var POINT_STATUS = {
    online: { name: '在线', badge: 'ok', color: '#12a06a' },
    offline: { name: '离线', badge: '', color: '#8b9cb1' },
    maintenance: { name: '维护中', badge: 'warn', color: '#e08b06' }
  };

  /* ---------------- 种子数据 ---------------- */
  function seedPoints() {
    return [
      { id: 'p1', code: 'P-01', name: '东门主入口', area: 'A 区 · 人车混行', floor: '1F', camSn: 'CAM-DA-0231', k1Sn: 'K1S-2601-A01', status: 'online', resolution: '1080P', fps: 25, volume: 70, x: 20, y: 64, note: '面向东侧人流主通道，逆光补偿已开启' },
      { id: 'p2', code: 'P-02', name: '南门车行道', area: 'A 区 · 车辆通道', floor: '1F', camSn: 'CAM-DA-0244', k1Sn: 'K1S-2601-A02', status: 'online', resolution: '1080P', fps: 25, volume: 80, x: 48, y: 88, note: '车牌-人脸双通道，K1 双核并行' },
      { id: 'p3', code: 'P-03', name: '一号楼大厅', area: 'B 区 · 访客接待', floor: '1F', camSn: 'CAM-DB-0110', k1Sn: 'K1S-2601-B01', status: 'online', resolution: '1080P', fps: 30, volume: 65, x: 54, y: 46, note: '正对闸机，人员驻留 1.5s 触发抓拍' },
      { id: 'p4', code: 'P-04', name: '二号楼电梯厅', area: 'B 区 · 电梯前室', floor: '3F', camSn: 'CAM-DB-0321', k1Sn: 'K1S-2601-B02', status: 'online', resolution: '720P', fps: 25, volume: 60, x: 78, y: 34, note: '窄通道俯视安装，人脸角度补偿开启' },
      { id: 'p5', code: 'P-05', name: '地下车库 B1 坡道', area: 'C 区 · 车库', floor: 'B1', camSn: 'CAM-DC-B105', k1Sn: 'K1S-2601-C01', status: 'offline', resolution: '1080P', fps: 20, volume: 75, x: 33, y: 26, note: '弱网环境，采用断点续传缓存队列' },
      { id: 'p6', code: 'P-06', name: '西侧围墙周界', area: 'C 区 · 周界', floor: '室外', camSn: 'CAM-DC-W008', k1Sn: 'K1S-2601-C02', status: 'online', resolution: '1080P', fps: 25, volume: 90, x: 13, y: 20, note: '红外补光，重点防翻越区域' },
      { id: 'p7', code: 'P-07', name: '食堂二层通道', area: 'D 区 · 生活区', floor: '2F', camSn: 'CAM-DD-0207', k1Sn: 'K1S-2601-D01', status: 'maintenance', resolution: '720P', fps: 20, volume: 55, x: 68, y: 72, note: '固件升级中（NPU 模型 v2.3.1）' }
    ];
  }

  function seedFaces() {
    var raw = [
      { code: 'F-1001', name: '张伟', cat: 'suspect', level: 3, gender: '男', age: '32-40', dept: '—', idNo: '3201**********1234', phone: '—', tags: ['重点关注', '夜间活动'], note: '2026-05 涉嫌破坏西侧周界围栏，已记录 3 次告警' },
      { code: 'F-1002', name: '李强', cat: 'suspect', level: 2, gender: '男', age: '26-34', dept: '—', idNo: '3401**********5566', phone: '—', tags: ['未登记', '尾随'], note: '多次尾随员工进入闸机，建议重点核查' },
      { code: 'F-1003', name: '王海', cat: 'suspect', level: 1, gender: '男', age: '40-50', dept: '—', idNo: '3101**********7788', phone: '—', tags: ['徘徊'], note: '夜间在车库坡道长时间徘徊' },
      { code: 'F-2001', name: '陈立', cat: 'staff', level: 0, gender: '男', age: '28-36', dept: '设施运维部', idNo: 'GX-2019-0042', phone: '138****6611', tags: ['夜班', '持证'], note: '机电运维，夜间巡检授权' },
      { code: 'F-2002', name: '刘敏', cat: 'staff', level: 0, gender: '女', age: '30-38', dept: '综合管理部', idNo: 'GX-2017-0011', phone: '139****2043', tags: ['行政'], note: '访客接待负责人' },
      { code: 'F-2003', name: '赵磊', cat: 'staff', level: 0, gender: '男', age: '26-34', dept: '安保队', idNo: 'GX-2021-0088', phone: '137****7788', tags: ['巡逻员'], note: 'A 区夜班巡逻组组长' },
      { code: 'F-2004', name: '孙涛', cat: 'staff', level: 0, gender: '男', age: '33-41', dept: '物流中心', idNo: 'GX-2018-0156', phone: '135****3399', tags: ['货运'], note: '园区货运通道授权' },
      { code: 'F-3001', name: '郑思远', cat: 'vip', level: 0, gender: '男', age: '45-55', dept: '外部访客 · 合作方', idNo: 'V-2026-0031', phone: '136****0012', tags: ['贵宾', '预约制'], note: '季度评审常驻访客，有效期至 2026-12-31' },
      { code: 'F-3002', name: '林诺', cat: 'vip', level: 0, gender: '女', age: '24-30', dept: '外部访客 · 供应商', idNo: 'V-2026-0044', phone: '133****8890', tags: ['短期访客'], note: '仅授权 B 区一号楼范围' }
    ];
    var now = Date.now();
    return raw.map(function (f, i) {
      return {
        id: 'f_' + f.code, code: f.code, name: f.name, cat: f.cat, level: f.level,
        gender: f.gender, age: f.age, dept: f.dept, idNo: f.idNo, phone: f.phone,
        tags: f.tags || [], note: f.note,
        photo: M.avatar(f.code + f.name, f.name),
        photoKey: '',
        featStatus: i === 6 ? 'pending' : (i === 8 ? 'failed' : 'synced'),
        featDim: 512,
        hitCount: 0,
        createdAt: new Date(now - (30 - i * 2) * 864e5).toISOString(),
        updatedAt: new Date(now - (6 - i * 0.4) * 864e5).toISOString()
      };
    });
  }

  // 仅「重点关注(suspect)」会生成危险告警；内部员工/访客识别为正常通行，不在此出现
  var PLAN = [
    { h: 0.3, p: 'p1', f: 'F-1001', sim: 0.937, st: 'pending' },
    { h: 1.6, p: 'p6', f: 'F-1001', sim: 0.951, st: 'backup', res: 'backup', unit: '值班长 · 赵磊', by: '刘敏' },
    { h: 2.4, p: 'p4', f: 'F-1002', sim: 0.914, st: 'pending' },
    { h: 5.8, p: 'p3', f: 'F-1002', sim: 0.928, st: 'tracking', res: 'track', by: '赵磊' },
    { h: 9.4, p: 'p1', f: 'F-1003', sim: 0.902, st: 'false', res: 'false', by: '刘敏', src: 'console' },
    { h: 26.5, p: 'p4', f: 'F-1002', sim: 0.941, st: 'confirmed', res: 'onscene', by: '赵磊' }
  ];

  function resById(id) {
    return RESOLUTIONS.filter(function (r) { return r.id === id; })[0] || { name: id || '未处置', badge: '', status: 'pending', desc: '', archive: false, needUnit: false };
  }

  function speakerText(pointName, personName, sim, tpl) {    return String(tpl || '请注意，{point} 发现重点关注人员 {name}，相似度 {sim}%，请巡逻人员立即前往核实。')
      .replace(/\{point\}/g, pointName).replace(/\{name\}/g, personName).replace(/\{sim\}/g, sim);
  }

  function seedAlerts(points, faces, tpl) {
    var now = Date.now();
    var out = [];
    PLAN.forEach(function (it, i) {
      var face = faces.filter(function (f) { return f.code === it.f; })[0];
      var point = points.filter(function (p) { return p.id === it.p; })[0];
      var occ = new Date(now - it.h * 3600e3);
      var lvl = face ? face.level : 0;
      var sim = it.sim;
      var code = 'AL-' + U.fmtDate(occ).replace(/-/g, '') + '-' + U.pad(i + 1, 3);
      var handled = it.st === 'pending' ? null : new Date(occ.getTime() + (12 + i * 3) * 60e3);
      var trace = [{
        at: occ.toISOString(), by: 'K1 端侧', action: '识别到人脸并抓拍',
        note: 'NPU 推理 ' + (21 + (i % 5)) + 'ms · 相似度 ' + (sim * 100).toFixed(1) + '%'
      }, {
        at: new Date(occ.getTime() + 400).toISOString(), by: 'K1 端侧', action: '扬声器播报提醒',
        note: 'TTS 输出 ×2，音量 ' + (point ? point.volume : 70) + '%'
      }, {
        at: new Date(occ.getTime() + 1200).toISOString(), by: '华为云 OBS', action: '抓拍图已上传',
        note: 'captures/' + U.stamp(occ).slice(0, 8) + '/…'
      }];
      if (it.res) {
        var R = resById(it.res);
        trace.push({
          at: handled.toISOString(), by: it.by || '赵磊',
          action: R.name + (it.unit ? '（' + it.unit + '）' : ''),
          note: R.desc
        });
      }
      out.push({
        id: 'a_' + i,
        code: code,
        pointId: it.p,
        pointName: point ? point.name : '未知点位',
        faceId: face ? face.id : '',
        personName: face ? face.name : '未识别',
        personCode: face ? face.code : '—',
        cat: face ? face.cat : 'suspect',
        similarity: sim,
        level: lvl,
        status: it.st,
        occurredAt: occ.toISOString(),
        receivedAt: new Date(occ.getTime() + 300).toISOString(),
        snapshot: M.scene(it.p + it.f + i, { person: true }),
        snapshotKey: 'captures/' + U.stamp(occ).slice(0, 8) + '/' + U.stamp(occ) + '_' + (point ? point.name : '') + '_' + (face ? face.name : '') + '.jpg',
        speaker: { ok: true, text: speakerText(point ? point.name : '', face ? face.name : '', (sim * 100).toFixed(0), tpl), at: new Date(occ.getTime() + 400).toISOString() },
        k1: {
          cpu: 38 + (i * 3) % 28, npu: 46 + (i * 7) % 34, fps: U.round(22 + (i % 4) * 0.7, 1),
          inferMs: U.round(20 + (i % 6) * 1.3, 1), device: point ? point.k1Sn : 'K1S-2601-A01'
        },
        handler: it.st === 'pending' ? '' : (it.by || '赵磊'),
        handledAt: handled ? handled.toISOString() : '',
        resolution: it.res || '',
        resolutionName: it.res ? resById(it.res).name : '',
        unit: it.unit || '',
        source: it.src || 'device',
        deviceSn: point ? point.k1Sn : 'K1S-2601-A01',
        note: it.st === 'false' ? '光照干扰导致误检' : '',
        archived: it.st === 'confirmed' || it.st === 'false',
        trace: trace
      });
    });
    return out;
  }

  function seedArchives(points, faces, alerts) {
    var out = [];
    var now = Date.now();
    alerts.forEach(function (a) {
      if (!a.archived) return;
      out.push({
        id: 'arc_' + a.id, alertId: a.id, pointId: a.pointId, pointName: a.pointName,
        faceId: a.faceId, personName: a.personName, personCode: a.personCode, cat: a.cat, level: a.level,
        kind: 'alert',
        resolution: a.resolution || 'onscene',
        resolutionName: a.resolutionName || '现场处置',
        unit: a.unit || '',
        handler: a.handler || '',
        source: a.source || 'device',
        deviceSn: a.deviceSn || '',
        occurredAt: a.occurredAt,
        archivedAt: a.handledAt || a.occurredAt,
        fileKey: a.snapshotKey,
        thumb: a.snapshot,
        size: 268000 + (U.hash(a.id) % 190000),
        uploaded: true,
        note: a.note || '现场核实后归档'
      });
    });
    /* 额外历史归档（更早的记录，用于时间轴丰富度） */
    var hist = [
      { h: 76, p: 'p2', f: 'F-1002' }, { h: 82, p: 'p1', f: 'F-2004' }, { h: 91, p: 'p6', f: 'F-1001' },
      { h: 99, p: 'p3', f: 'F-3002' }, { h: 106, p: 'p4', f: 'F-1003' }, { h: 118, p: 'p1', f: 'F-2003' },
      { h: 127, p: 'p2', f: 'F-1001' }, { h: 139, p: 'p7', f: 'F-2002' }, { h: 148, p: 'p3', f: 'F-2001' },
      { h: 160, p: 'p6', f: 'F-1002' }
    ];
    hist.forEach(function (it, i) {
      var face = faces.filter(function (f) { return f.code === it.f; })[0];
      var point = points.filter(function (p) { return p.id === it.p; })[0];
      var occ = new Date(now - it.h * 3600e3);
      out.push({
        id: 'arc_h' + i, alertId: '', pointId: it.p, pointName: point.name,
        faceId: face.id, personName: face.name, personCode: face.code, cat: face.cat, level: face.level,
        kind: (face && face.cat === 'suspect' ? 'alert' : 'pass'),
        resolution: (face && face.cat === 'suspect') ? 'onscene' : '',
        resolutionName: (face && face.cat === 'suspect') ? '现场处置' : '正常通行',
        unit: '',
        occurredAt: occ.toISOString(),
        archivedAt: new Date(occ.getTime() + 18 * 60e3).toISOString(),
        fileKey: 'captures/' + U.stamp(occ).slice(0, 8) + '/' + U.stamp(occ) + '_' + point.name + '_' + face.name + '.jpg',
        thumb: M.scene('h' + i + it.p, { person: true }),
        size: 240000 + (U.hash('h' + i) % 210000),
        uploaded: true,
        note: i % 3 === 0 ? '巡逻人员现场核实，无异常' : '已按流程归档'
      });
    });

    /* 陌生访客抓拍（未匹配人脸库，记时间轴、不进告警中心） */
    var strangers = [
      { h: 70, p: 'p5' }, { h: 120, p: 'p2' }, { h: 150, p: 'p4' }, { h: 175, p: 'p3' }
    ];
    strangers.forEach(function (it, i) {
      var point = points.filter(function (p) { return p.id === it.p; })[0];
      var occ = new Date(now - it.h * 3600e3);
      out.push({
        id: 'str_h' + i, alertId: '', pointId: it.p, pointName: point.name,
        faceId: '', personName: '陌生访客', personCode: '—', cat: 'unknown', level: 0, kind: 'stranger',
        occurredAt: occ.toISOString(),
        archivedAt: new Date(occ.getTime() + 12 * 60e3).toISOString(),
        fileKey: 'captures/' + U.stamp(occ).slice(0, 8) + '/' + U.stamp(occ) + '_' + point.name + '_陌生人.jpg',
        thumb: M.scene('str' + i + it.p, { person: true }),
        size: 250000 + (U.hash('str' + i) % 200000),
        uploaded: true,
        note: '未匹配人脸库 · 已抓拍记录'
      });
    });
    return out.sort(function (a, b) { return new Date(b.occurredAt) - new Date(a.occurredAt); });
  }

  function defaults() {
    var points = seedPoints();
    var faces = seedFaces();
    var tpl = '请注意，{point} 发现重点关注人员 {name}，相似度 {sim}%，请巡逻人员立即前往核实。';
    var alerts = seedAlerts(points, faces, tpl);
    var archives = seedArchives(points, faces, alerts);
    var now = new Date().toISOString();
    return {
      version: 1,
      schema: SCHEMA,
      meta: { createdAt: now, updatedAt: now, device: 'K1S-2601-A01', rev: 1 },
      users: [
        { id: 'u1', username: 'admin', pwd: String(U.hash('k1@2026' + '#k1')), name: '系统管理员', role: 'admin', roleName: '超级管理员', phone: '138****8866', lastLogin: '' },
        { id: 'u2', username: 'patrol', pwd: String(U.hash('patrol123' + '#k1')), name: '王巡逻', role: 'patrol', roleName: '巡逻员', phone: '139****2233', lastLogin: '' },
        { id: 'u3', username: 'viewer', pwd: String(U.hash('viewer123' + '#k1')), name: '演示访客', role: 'viewer', roleName: '只读访客', phone: '137****0000', lastLogin: '' }
      ],
      points: points,
      faces: faces,
      alerts: alerts,
      archives: archives,
      currentPointId: 'p1',
      settings: {
        org: { name: '临港智慧园区', system: 'K1 智巡', site: 'A / B / C / D 四区', contact: '安保中心 021-6888-0000' },
        alert: { threshold: 0.8, highLevel: 0.92, midLevel: 0.85, cooldown: 30, autoArchive: true },
        speaker: { enabled: true, repeat: 2, volume: 70, template: tpl },
        face: { featDim: 512, autoSync: true }
      },
      cloud: {
        enabled: false,
        provider: 'HuaweiCloud OBS',
        obs: { endpoint: 'obs.cn-north-4.myhuaweicloud.com', bucket: '', ak: '', sk: '', region: 'cn-north-4', prefix: 'k1-patrol/' },
        autoSync: true,
        lastSyncAt: '',
        syncState: 'local',
        syncLog: [],
        stats: { objects: 0, bytes: 0 }
      },
      k1: {
        url: 'http://192.168.43.124:8088',   // K1 板子桥接地址（轮询告警用）
        pollSec: 4,                          // 轮询间隔（秒）
        autoSwitch: true                     // 后台切巡检点 → 同步下发 K1
      },
      ui: { injectSim: false }
    };
  }

  /* ---------------- 数据清洗 ----------------
     兜底保证：告警表内只允许存在 suspect（重点关注）记录。
     任何来源（旧版 localStorage / 手工导入 / 外部 POST）进入前都要过一遍。 */
  function sanitize(s) {
    if (!s) return s;
    if (Array.isArray(s.alerts)) {
      s.alerts = s.alerts.filter(function (a) {
        if (!a) return false;
        var f = (s.faces || []).filter(function (x) { return x.id === a.faceId || x.code === a.personCode; })[0];
        var cat = a.cat || (f ? f.cat : '');
        a.cat = cat;
        return cat === 'suspect';
      });
      s.alerts.forEach(function (a) {
        if (a.resolution === undefined) a.resolution = '';
        if (!a.resolutionName) a.resolutionName = a.resolution ? resById(a.resolution).name : '';
        if (!a.unit) a.unit = '';
        if (!a.source) a.source = 'device';
        if (!a.deviceSn) a.deviceSn = '';
      });
    }
    if (Array.isArray(s.archives)) {
      s.archives.forEach(function (a) {
        if (!a) return;
        var f = (s.faces || []).filter(function (x) { return x.id === a.faceId || x.code === a.personCode; })[0];
        if (!a.cat) a.cat = f ? f.cat : 'unknown';
        if (!a.kind) a.kind = a.alertId ? 'alert' : (a.cat === 'unknown' ? 'stranger' : 'pass');
        if (a.cat === 'suspect' && !a.alertId && a.kind !== 'alert') a.kind = 'alert';
      });
    }
    s.schema = SCHEMA;
    return s;
  }

  /* ---------------- 持久化 ---------------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.version === 1 && s.schema === SCHEMA && s.points && s.faces) return sanitize(s);
      }
    } catch (e) { persistOk = false; }
    return null;
  }
  function persist() {
    if (!persistOk) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      persistOk = false;
      if (A.UI && A.UI.toast) A.UI.toast({ type: 'warn', title: '本地存储空间不足', desc: '已切换为内存模式，刷新后数据会丢失' });
    }
  }

  /* ---------------- 对外 API ---------------- */
  var Store = {
    KEY: KEY, CATS: CATS, REG_CATS: REG_CATS, STATUS: STATUS, LEVELS: LEVELS, POINT_STATUS: POINT_STATUS,
    RESOLUTIONS: RESOLUTIONS, UNITS: UNITS, SOURCES: SOURCES, resById: resById,
    speakerText: speakerText,

    init: function () {
      var loaded = load();
      state = loaded || defaults();
      if (!loaded) persist();
      return state;
    },
    get: function () { return state; },
    set: function (fn, reason) {
      fn(state);
      state.meta.updatedAt = new Date().toISOString();
      state.meta.rev = (state.meta.rev || 1) + 1;
      if (reason !== 'silent') persist();
      if (reason !== 'silent') Store.emit(reason || 'change');
      if (A.Cloud && A.Cloud.onLocalChange) A.Cloud.onLocalChange(state);
    },
    commit: function (reason) {
      state.meta.updatedAt = new Date().toISOString();
      state.meta.rev = (state.meta.rev || 1) + 1;
      persist();
      Store.emit(reason || 'change');
      if (A.Cloud && A.Cloud.onLocalChange) A.Cloud.onLocalChange(state);
    },
    emit: function (reason) { subs.forEach(function (fn) { try { fn(reason); } catch (e) { console.warn(e); } }); },
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    reset: function () { state = defaults(); persist(); Store.emit('reset'); },
    sanitize: sanitize,
    exportJSON: function () { return JSON.stringify(state, null, 2); },
    importJSON: function (text) {
      var s = JSON.parse(text);
      if (!s || !s.points || !s.faces) throw new Error('数据结构不正确');
      state = sanitize(s);
      state.version = 1;
      state.meta = state.meta || {};
      state.meta.updatedAt = new Date().toISOString();
      persist(); Store.emit('import');
    },
    stats: function () {
      var t = U.day(new Date());
      var todayAlerts = state.alerts.filter(function (a) { return U.day(new Date(a.occurredAt)).getTime() === t.getTime(); }).length;
      var pending = state.alerts.filter(function (a) { return a.status === 'pending'; }).length;
      var online = state.points.filter(function (p) { return p.status === 'online'; }).length;
      var bytes = state.archives.reduce(function (n, a) { return n + (a.size || 0); }, 0) +
        state.faces.reduce(function (n, f) { return n + U.base64Size(f.photo); }, 0);
      return {
        todayAlerts: todayAlerts, pending: pending, faces: state.faces.length,
        online: online, points: state.points.length, archives: state.archives.length,
        bytes: bytes, suspects: state.faces.filter(function (f) { return f.cat === 'suspect'; }).length,
        synced: state.faces.filter(function (f) { return f.featStatus === 'synced'; }).length,
        passToday: state.archives.filter(function (a) { return a.kind === 'pass' && U.isToday(a.occurredAt); }).length,
        strangerToday: state.archives.filter(function (a) { return a.kind === 'stranger' && U.isToday(a.occurredAt); }).length,
        passTotal: state.archives.filter(function (a) { return a.kind === 'pass'; }).length,
        strangerTotal: state.archives.filter(function (a) { return a.kind === 'stranger'; }).length
      };
    },
    currentPoint: function () {
      return state.points.filter(function (p) { return p.id === state.currentPointId; })[0] || state.points[0];
    },
    pointById: function (id) { return state.points.filter(function (p) { return p.id === id; })[0]; },
    faceById: function (id) { return state.faces.filter(function (f) { return f.id === id; })[0]; },
    alertById: function (id) { return state.alerts.filter(function (a) { return a.id === id; })[0]; },
    nextFaceCode: function () {
      var nums = state.faces.map(function (f) { return parseInt(String(f.code).replace(/\D/g, ''), 10) || 0; });
      var base = nums.length ? Math.max.apply(null, nums) : 1000;
      return 'F-' + (base + 1);
    },
    nextAlertCode: function (d) {
      d = d ? new Date(d) : new Date();
      var pre = 'AL-' + U.fmtDate(d).replace(/-/g, '') + '-';
      var n = state.alerts.filter(function (a) { return a.code.indexOf(pre) === 0; }).length + 1;
      return pre + U.pad(n, 3);
    }
  };

  A.Store = Store;
})(window.App);
