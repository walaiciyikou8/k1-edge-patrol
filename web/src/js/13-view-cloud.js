/* ============================================================
   13 · view · 华为云对接
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;

  /* ---------------- 静态素材启动时初始化（在 app.js 中调用） ---------------- */
  A.SCENE = {
    cover: A.Mock.scene('hero-cover', { person: false }),
    chip: A.Mock.scene('hero-chip', { person: false })
  };

  var SERVICES = [
    { name: '对象存储 OBS', use: '人脸底库、抓拍图、状态快照持久化', on: true, icon: 'cloud' },
    { name: 'API 网关 APIG', use: '统一承接 K1 上报与网页端读写鉴权', on: false, icon: 'link' },
    { name: '函数工作流 FunctionGraph', use: '告警落库、图像压缩、消息分发', on: false, icon: 'bolt' },
    { name: '云数据库 RDS for MySQL', use: '结构化告警/人员/点位数据（可选）', on: false, icon: 'database' },
    { name: '消息通知 SMN', use: '高危告警短信/邮件推送巡逻负责人', on: false, icon: 'bell' },
    { name: '监控服务 CES', use: 'OBS 流量与端侧上报健康度看护', on: false, icon: 'activity' }
  ];

  function render(root) {
    var st = S.get();
    var c = st.cloud;
    var o = c.obs;
    var usage = A.Cloud.estimateUsage();
    var pct = U.clamp(usage.bytes / usage.quota * 100, 0.4, 100);
    var secure = A.Cloud.cryptoReady();
    var statusText = !c.enabled ? '未启用（本地演示模式）' : (A.Cloud.ready() ? '已配置' : '配置不完整');
    var statusCls = !c.enabled ? 'warn' : (A.Cloud.ready() ? 'ok' : 'danger');

    root.innerHTML =
      '<div class="view-anim">' +
      '<div class="cloud-hero">' +
      '<div><h2>华为云对接</h2>' +
      '<p>平台采用「端侧实时识别 + 云端持久化」架构：K1 在边缘完成人脸检测与比对，' +
      '抓拍图按「时间 + 地点 + 人名」命名后直传华为云 OBS；管理端读取云端快照与对象列表，实现跨设备一致的数据视图。</p>' +
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<span class="badge ' + statusCls + '"><i></i>' + statusText + '</span>' +
      '<span class="badge info">OBS 对象存储</span>' +
      '<span class="badge">SigV4 直传</span>' +
      (secure ? '' : '<span class="badge danger">当前非 https 环境，无法签名</span>') +
      '</div></div>' +
      '<div class="ch-flow">' +
      '<div class="flow-node"><span class="fn-ico" style="background:#1f6feb">' + I('chip') + '</span>' +
      '<div><b>K1 边缘节点</b> · 检测 + 比对 + 抓拍 + 播报</div></div>' +
      '<div class="flow-arrow">↓ PUT captures/…</div>' +
      '<div class="flow-node"><span class="fn-ico" style="background:#0aa6bd">' + I('cloud') + '</span>' +
      '<div><b>华为云 OBS</b> · ' + U.esc(o.bucket || '（未配置桶）') + '</div></div>' +
      '<div class="flow-arrow">↓ 快照 / 对象列表</div>' +
      '<div class="flow-node"><span class="fn-ico" style="background:#12a06a">' + I('dashboard') + '</span>' +
      '<div><b>管理端</b> · 人脸库 / 告警 / 时间轴</div></div>' +
      '</div></div>' +

      '<div class="split-2">' +
      /* 配置卡 */
      '<div class="card"><div class="card-head"><h3>' + I('settings') + 'OBS 连接配置</h3>' +
      '<div class="grow"></div>' +
      '<label class="switch"><input type="checkbox" id="clEnabled"' + (c.enabled ? ' checked' : '') + '>' +
      '<span class="track"></span><span class="sw-label">启用云端</span></label></div>' +
      '<div class="card-body">' +
      '<div class="form-grid">' +
      fld('Endpoint', '<input class="input mono" id="clEndpoint" value="' + U.esc(o.endpoint) + '" placeholder="obs.cn-north-4.myhuaweicloud.com">') +
      fld('Region', '<input class="input mono" id="clRegion" value="' + U.esc(o.region) + '">') +
      fld('Bucket 桶名', '<input class="input mono" id="clBucket" value="' + U.esc(o.bucket) + '" placeholder="k1-patrol-demo">') +
      fld('对象前缀', '<input class="input mono" id="clPrefix" value="' + U.esc(o.prefix) + '" placeholder="k1-patrol/">') +
      fld('Access Key（AK）', '<input class="input mono" id="clAk" value="' + U.esc(o.ak) + '" placeholder="AK 仅保存在本机浏览器">') +
      fld('Secret Key（SK）', '<input class="input mono" id="clSk" type="password" value="' + U.esc(o.sk) + '" placeholder="••••••••">') +
      '</div>' +
      '<div class="set-row" style="padding-top:0"><div class="sr-main"><b>自动同步状态快照</b>' +
      '<span>数据变更后 2.5 秒内将 app-state.json 推送至云端</span></div>' +
      '<label class="switch"><input type="checkbox" id="clAuto"' + (c.autoSync ? ' checked' : '') + '>' +
      '<span class="track"></span></label></div>' +
      '<div class="note warn">' + I('warn') +
      '<div><b>使用前必读：</b>需在 OBS 控制台为该桶配置 CORS（允许本站来源的 <code>GET/PUT/DELETE</code> 与 <code>Authorization</code> 头），' +
      '并保证通过 <b>https</b> 访问本页面（浏览器 WebCrypto 限制）。演示环境下的 AK/SK 仅存于本机 localStorage，' +
      '生产环境请改用 STS 临时凭证。</div></div>' +
      '<div class="btn-group" style="margin-top:13px">' +
      '<button class="btn primary" id="clSave">' + I('check') + '保存配置</button>' +
      '<button class="btn" id="clTest">' + I('wifi') + '测试连接</button>' +
      '<button class="btn" id="clSyncAll">' + I('upload') + '立即全量同步</button>' +
      '<button class="btn" id="clPull">' + I('download') + '拉取云端快照</button>' +
      '</div></div></div>' +

      /* 用量与日志 */
      '<div class="card"><div class="card-head"><h3>' + I('database') + '持久化状态</h3>' +
      '<div class="grow"></div><span class="badge ' + statusCls + '">' + statusText + '</span></div>' +
      '<div class="card-body">' +
      '<div class="usage-donut"><div id="usageRing"></div>' +
      '<div style="flex:1"><div style="font-size:12.5px;color:var(--text-2)">已用对象存储</div>' +
      '<div style="font-size:21px;font-weight:700;letter-spacing:-.02em;margin:2px 0 4px">' + U.fmtBytes(usage.bytes) + '</div>' +
      '<div style="font-size:11.5px;color:var(--text-3)">配额 5 GB · 对象 ' + (st.archives.length + st.faces.length) + ' 个</div></div></div>' +
      '<div class="divider"></div>' +
      '<dl class="kv" style="font-size:12px">' +
      '<dt>状态对象</dt><dd class="mono" style="font-size:11px">' + U.esc(A.Cloud.objectKeyPrefix() + 'state/app-state.json') + '</dd>' +
      '<dt>最近同步</dt><dd>' + (c.lastSyncAt ? U.fmtDT(c.lastSyncAt) + '（' + U.ago(c.lastSyncAt) + '）' : '尚未同步') + '</dd>' +
      '<dt>本地版本</dt><dd class="mono">rev ' + (st.meta.rev || 1) + '</dd>' +
      '</dl>' +
      '<div class="divider"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="font-size:12.5px;font-weight:600">同步日志</span><div class="grow" style="flex:1"></div>' +
      '<span class="sub" style="font-size:11px;color:var(--text-3)">最近 24 条</span></div>' +
      '<div class="sync-log">' + ((c.syncLog && c.syncLog.length) ? c.syncLog.map(function (l) {
        return '<div class="sync-row"><span class="sr-time">' + U.fmtTimeShort(l.at) + '</span>' +
          '<span class="badge ' + (l.ok ? 'ok' : 'danger') + ' sm">' + (l.ok ? '成功' : '失败') + '</span>' +
          '<span class="sr-txt" title="' + U.esc(l.text) + '">' + U.esc(l.text) + '</span></div>';
      }).join('') : '<div class="hint" style="font-size:11.5px;color:var(--text-3)">暂无同步记录</div>') + '</div>' +
      '</div></div>' +
      '</div>' +

      /* K1 端对接 */
      '<div class="card" style="margin-top:14px"><div class="card-head"><h3>' + I('chip') + 'K1 端对接规范</h3>' +
      '<div class="grow"></div><span class="sub">RISC-V · SpacemiT K1（8×X60 + 2.0 TOPS NPU）</span></div>' +
      '<div class="card-body">' +
      '<div class="split-2">' +
      '<div><div style="font-size:12.5px;font-weight:600;margin-bottom:8px">对象命名规范</div>' +
      '<div class="code-block">k1-patrol/\n' +
      '├─ faces/<span class="tok-s">F-1001_张伟.jpg</span>            <span class="tok-c"># 人脸底库</span>\n' +
      '├─ captures/<span class="tok-s">20261030/</span>\n' +
      '│    └─ <span class="tok-s">20261030_142311_东门主入口_张伟.jpg</span>\n' +
      '└─ state/<span class="tok-s">app-state.json</span>            <span class="tok-c"># 管理端快照</span></div>' +
      '<div class="note" style="margin-top:11px">' + I('info') +
      '<div>文件名固定为「<b>年月日_时分秒_点位名_人名</b>」，管理端据此还原时间轴，同时作为巡逻人员现场检索的唯一凭据。</div></div>' +
      '</div>' +
      '<div><div style="font-size:12.5px;font-weight:600;margin-bottom:8px">两类算力分工</div>' +
      '<div class="dual-flow" style="flex-direction:column;gap:7px">' +
      '<div class="step" style="text-align:left"><b>CPU（8×X60 @1.6GHz）</b><span>MIPI 采集 / H.264 硬解 / 图像缩放与色彩空间转换 / 告警封装 / TTS 播报 / OBS 上传</span></div>' +
      '<div class="step" style="text-align:left"><b>NPU（2.0 TOPS，INT8）</b><span>人脸检测（RetinaFace） → 五点对齐 → 512 维特征提取 → 1:N 余弦比对</span></div>' +
      '</div>' +
      '<div class="dual-metrics" style="margin-top:9px"><div><b>≈21ms</b><span>NPU 单帧推理</span></div>' +
      '<div><b>≈6ms</b><span>CPU 预处理</span></div><div><b>≈24fps</b><span>双引擎并行吞吐</span></div></div>' +
      '</div></div>' +
      '</div></div>' +

      /* 服务清单 */
      '<div class="card" style="margin-top:14px"><div class="card-head"><h3>' + I('puzzle') + '华为云服务清单</h3>' +
      '<div class="grow"></div><span class="sub">当前方案使用 OBS，其余为可扩展项</span></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>云服务</th><th>在本方案中的作用</th><th style="text-align:right">接入状态</th></tr></thead><tbody>' +
      SERVICES.map(function (s) {
        return '<tr><td><div class="cell-main" style="display:flex;align-items:center;gap:7px">' +
          '<span style="color:var(--primary)">' + I(s.icon) + '</span>' + s.name + '</div></td>' +
          '<td class="cell-sub">' + s.use + '</td>' +
          '<td style="text-align:right">' + (s.on ? '<span class="badge ok">已接入</span>' : '<span class="badge">可扩展</span>') + '</td></tr>';
      }).join('') +
      '</tbody></table></div></div>' +
      '</div>';

    /* 图表 */
    A.Chart.ring(U.q('#usageRing'), {
      size: 96, thickness: 9, value: pct / 100, color: '#1f6feb',
      text: (pct < 1 ? pct.toFixed(1) : U.round(pct, 0)) + '%', sub: '用量'
    });

    /* 事件 */
    U.q('#clSave').addEventListener('click', function () {
      var cfg = {
        endpoint: U.q('#clEndpoint').value.trim().replace(/^https?:\/\//, ''),
        region: U.q('#clRegion').value.trim(),
        bucket: U.q('#clBucket').value.trim(),
        prefix: U.q('#clPrefix').value.trim(),
        ak: U.q('#clAk').value.trim(),
        sk: U.q('#clSk').value.trim()
      };
      S.set(function (st) {
        st.cloud.obs = Object.assign(st.cloud.obs, cfg);
        st.cloud.enabled = U.q('#clEnabled').checked;
        st.cloud.autoSync = U.q('#clAuto').checked;
      }, 'cloud');
      A.Shell.updateCloudChip();
      A.UI.toast({
        type: 'ok', title: '配置已保存',
        desc: S.get().cloud.enabled ? '可点击「测试连接」验证 OBS 权限' : '当前仍为本地演示模式'
      });
      render(root);
    });
    U.q('#clEnabled').addEventListener('change', function (e) {
      S.set(function (st) { st.cloud.enabled = e.target.checked; }, 'cloud');
      A.Shell.updateCloudChip(); render(root);
    });
    U.q('#clAuto').addEventListener('change', function (e) {
      S.set(function (st) { st.cloud.autoSync = e.target.checked; }, 'cloud');
    });
    U.q('#clTest').addEventListener('click', function () {
      A.UI.toast({ type: 'info', title: '正在测试 OBS 连接…' });
      A.Cloud.test().then(function (r) {
        A.UI.toast(r.ok
          ? { type: 'ok', title: '连接成功', desc: '桶内已存在 ' + r.count + ' 个状态对象' }
          : { type: 'err', title: '连接失败', desc: r.error });
        render(root);
      });
    });
    U.q('#clSyncAll').addEventListener('click', function () {
      if (!A.Cloud.ready()) { A.UI.toast({ type: 'warn', title: '请先完成 OBS 配置并启用' }); return; }
      A.UI.toast({ type: 'info', title: '开始全量同步…' });
      A.Cloud.syncAll().then(function (r) {
        A.UI.toast(r.ok ? { type: 'ok', title: '全量同步完成' } : { type: 'err', title: '同步失败', desc: r.error });
        render(root);
      });
    });
    U.q('#clPull').addEventListener('click', function () {
      if (!A.Cloud.ready()) { A.UI.toast({ type: 'warn', title: '请先完成 OBS 配置并启用' }); return; }
      A.Cloud.pullState().then(function (r) {
        if (!r.ok) { A.UI.toast({ type: 'err', title: '拉取失败', desc: r.error }); return; }
        var rev = (r.remote.meta && r.remote.meta.rev) || 0;
        A.UI.confirm({
          title: '覆盖本地数据？', danger: true, okText: '使用云端数据',
          html: '云端快照版本 rev ' + rev + '，本地版本 rev ' + (S.get().meta.rev || 1) + '。<br>' +
            '<span style="font-size:12px;color:var(--text-3)">导入后本地人脸库、告警与归档将替换为云端内容（照片缩略图会按需重建）。</span>'
        }).then(function (ok) {
          if (!ok) return;
          var st = S.get();
          var remote = r.remote;
          S.set(function (s) {
            s.points = remote.points || s.points;
            s.settings = remote.settings || s.settings;
            if (remote.faces) {
              s.faces = remote.faces.map(function (f) {
                f.photo = f.photo || A.Mock.avatar(f.code + f.name, f.name);
                return f;
              });
            }
          }, 'import');
          A.UI.toast({ type: 'ok', title: '已导入云端快照' });
          A.Router.refresh();
        });
      });
    });

    A.UI.bindCopy(root);
  }

  function fld(label, ctl) {
    return '<div class="field"><label>' + label + '</label>' + ctl + '</div>';
  }

  A.Views = A.Views || {};
  A.Views.cloud = { render: render };
})(window.App);
