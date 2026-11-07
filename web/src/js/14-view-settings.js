/* ============================================================
   14 · view · 系统设置
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;

  function render(root) {
    var st = S.get();
    var set = st.settings;
    var sess = A.Auth.session();
    var tpl = set.speaker.template;

    root.innerHTML =
      '<div class="view-anim">' +
      '<div class="sec-head"><div><h2>系统设置</h2>' +
      '<p>组织信息、告警策略、播报模板与账号数据管理</p></div></div>' +

      '<div class="split-2">' +
      /* 组织信息 */
      '<div class="card"><div class="card-head"><h3>' + I('shield') + '组织信息</h3></div>' +
      '<div class="card-body"><div class="form-grid">' +
      f('园区名称', '<input class="input" id="stOrgName" value="' + U.esc(set.org.name) + '">') +
      f('系统名称', '<input class="input" id="stSysName" value="' + U.esc(set.org.system) + '">') +
      f('区域范围', '<input class="input" id="stSite" value="' + U.esc(set.org.site) + '">') +
      f('值班电话', '<input class="input" id="stContact" value="' + U.esc(set.org.contact) + '">') +
      '</div><button class="btn primary" id="stSaveOrg">' + I('check') + '保存组织信息</button></div></div>' +

      /* 告警策略 */
      '<div class="card"><div class="card-head"><h3>' + I('target') + '告警策略</h3>' +
      '<div class="grow"></div><span class="sub">影响 K1 端比对判定</span></div>' +
      '<div class="card-body">' +
      '<div class="field"><label>人脸比对阈值 <span class="req">·</span> 余弦相似度</label>' +
      '<div class="bar-line"><input type="range" id="stTh" min="0.6" max="0.98" step="0.01" value="' + set.alert.threshold + '" style="flex:1;accent-color:var(--primary)">' +
      '<b class="val" id="stThVal">' + (set.alert.threshold * 100).toFixed(0) + '%</b></div>' +
      '<div class="hint">低于该相似度不产生告警；建议 0.80 ~ 0.88 之间平衡误报与漏报。</div></div>' +
      '<div class="form-grid">' +
      f('高危阈值', '<input class="input" id="stHigh" type="number" step="0.01" min="0.8" max="0.99" value="' + set.alert.highLevel + '">') +
      f('中危阈值', '<input class="input" id="stMid" type="number" step="0.01" min="0.7" max="0.99" value="' + set.alert.midLevel + '">') +
      f('告警冷却（秒）', '<input class="input" id="stCool" type="number" min="5" max="600" value="' + set.alert.cooldown + '">') +
      f('特征维度', '<input class="input" value="512 维（INT8 量化）" disabled>') +
      '</div>' +
      '<div class="set-row" style="border-top:1px solid var(--border)"><div class="sr-main"><b>处置后自动归档到时间轴</b>' +
      '<span>确认告警时自动生成归档记录并上传云端</span></div>' +
      '<label class="switch"><input type="checkbox" id="stAutoArc"' + (set.alert.autoArchive ? ' checked' : '') + '><span class="track"></span></label></div>' +
      '<button class="btn primary" id="stSaveAlert" style="margin-top:12px">' + I('check') + '保存告警策略</button>' +
      '</div></div>' +

      /* 播报模板 */
      '<div class="card"><div class="card-head"><h3>' + I('volume') + '扬声器播报</h3>' +
      '<div class="grow"></div>' +
      '<label class="switch"><input type="checkbox" id="stSpk"' + (set.speaker.enabled ? ' checked' : '') + '><span class="track"></span>' +
      '<span class="sw-label">启用 TTS</span></label></div>' +
      '<div class="card-body">' +
      '<div class="field"><label>播报文案模板</label>' +
      '<textarea class="input" id="stTpl" style="min-height:72px">' + U.esc(tpl) + '</textarea>' +
      '<div class="hint">可用变量：<code class="mono">{point}</code> 点位名 · <code class="mono">{name}</code> 人员名 · <code class="mono">{sim}</code> 相似度数值</div></div>' +
      '<div class="form-grid">' +
      f('重复播报次数', '<input class="input" id="stRepeat" type="number" min="1" max="5" value="' + set.speaker.repeat + '">') +
      f('默认音量 (%)', '<input class="input" id="stVol" type="number" min="0" max="100" value="' + set.speaker.volume + '">') +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-3);margin-bottom:4px">效果预览</div>' +
      '<div class="tpl-preview" id="stTplPrev">' + tplPrev(tpl, st) + '</div>' +
      '<button class="btn primary" id="stSaveSpk" style="margin-top:12px">' + I('check') + '保存播报设置</button>' +
      '</div></div>' +

      /* 数据管理 */
      '<div class="card"><div class="card-head"><h3>' + I('database') + '数据管理</h3>' +
      '<div class="grow"></div><span class="sub">本地 ' + U.fmtBytes(JSON.stringify(st).length) + '</span></div>' +
      '<div class="card-body">' +
      '<div class="set-row" style="padding-top:0"><div class="sr-main"><b>导出全部数据</b>' +
      '<span>包含人脸库、点位、告警、归档与配置（JSON）</span></div>' +
      '<button class="btn" id="stExport">' + I('download') + '导出</button></div>' +
      '<div class="set-row"><div class="sr-main"><b>导入数据</b>' +
      '<span>从备份 JSON 恢复，将覆盖当前全部数据</span></div>' +
      '<button class="btn" id="stImport">' + I('upload') + '导入</button>' +
      '<input type="file" id="stFile" accept="application/json" style="display:none"></div>' +
      '<div class="set-row"><div class="sr-main"><b>重置演示数据</b>' +
      '<span>清空本地修改并恢复初始示例数据</span></div>' +
      '<button class="btn danger" id="stReset">' + I('refresh') + '重置</button></div>' +
      (st.cloud.enabled ? '<div class="note" style="margin-top:10px">' + I('cloud') +
        '<div>已启用华为云同步，数据变更后会自动推送快照至 OBS。</div></div>' : '') +
      '</div></div>' +

      /* 账号管理 */
      '<div class="card"><div class="card-head"><h3>' + I('user') + '账号与权限</h3>' +
      '<div class="grow"></div>' +
      (A.Auth.can('admin') ? '<button class="btn sm" id="stAddUser">' + I('plus') + '新增账号</button>' : '') + '</div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>账号</th><th class="h-sm">角色</th><th class="h-sm">上次登录</th><th style="text-align:right">操作</th></tr></thead><tbody>' +
      st.users.map(function (u) {
        return '<tr><td><div class="tbl-person" style="min-width:0"><div class="user-ava">' + U.esc(u.name.slice(0, 1)) + '</div>' +
          '<div><div class="cell-main">' + U.esc(u.name) + (sess && sess.userId === u.id ? ' <span class="badge info sm">当前</span>' : '') + '</div>' +
          '<div class="cell-sub mono">' + U.esc(u.username) + '</div></div></div></td>' +
          '<td class="h-sm">' + U.esc(u.roleName) + '</td>' +
          '<td class="h-sm cell-sub">' + (u.lastLogin ? U.esc(U.ago(u.lastLogin)) : '—') + '</td>' +
          '<td><div class="tbl-actions">' +
          '<button class="btn-icon" data-user="' + u.id + '" data-act="pwd" title="重置密码">' + I('key') + '</button>' +
          (u.role !== 'admin' ? '<button class="btn-icon danger" data-user="' + u.id + '" data-act="del" title="删除">' + I('trash') + '</button>' : '') +
          '</div></td></tr>';
      }).join('') +
      '</tbody></table></div></div>' +

      /* 关于 */
      '<div class="card"><div class="card-head"><h3>' + I('info') + '关于系统</h3></div>' +
      '<div class="card-body">' +
      '<div class="about-grid">' +
      '<div><dt class="muted">系统版本</dt><dd><b>K1 智巡 v1.0.0</b></dd></div>' +
      '<div><dt class="muted">边缘硬件</dt><dd>进迭时空 SpacemiT K1（8×RISC-V X60 + 2.0 TOPS NPU）</dd></div>' +
      '<div><dt class="muted">视频接入</dt><dd>MIPI-CSI 摄像头 · 1080P@25fps</dd></div>' +
      '<div><dt class="muted">识别能力</dt><dd>人脸检测 + 512 维特征 + 1:N 比对（底库 ' + st.faces.length + ' 人）</dd></div>' +
      '<div><dt class="muted">云端服务</dt><dd>华为云 OBS（对象存储 + 状态快照）</dd></div>' +
      '<div><dt class="muted">数据版本</dt><dd class="mono">rev ' + (st.meta.rev || 1) + ' · 更新于 ' + U.fmtDT(st.meta.updatedAt) + '</dd></div>' +
      '</div>' +
      '<div class="note" style="margin-top:12px">' + I('info') +
      '<div>本项目为 RISC-V 大赛参赛作品的管理端演示：数据默认保存在浏览器本地，开启华为云 OBS 后所有对象与状态快照将持久化到云端，' +
      'K1 端与网页端共享同一份桶内数据。</div></div>' +
      '</div></div>' +
      '</div>';

    /* 组织 */
    U.q('#stSaveOrg').addEventListener('click', function () {
      S.set(function (s) {
        s.settings.org.name = U.q('#stOrgName').value.trim() || s.settings.org.name;
        s.settings.org.system = U.q('#stSysName').value.trim();
        s.settings.org.site = U.q('#stSite').value.trim();
        s.settings.org.contact = U.q('#stContact').value.trim();
      }, 'settings');
      A.Shell.setTitle({ id: 'settings', name: '系统设置' });
      A.UI.toast({ type: 'ok', title: '组织信息已保存' });
    });

    /* 告警策略 */
    var th = U.q('#stTh'), thVal = U.q('#stThVal');
    th.addEventListener('input', function () { thVal.textContent = (parseFloat(th.value) * 100).toFixed(0) + '%'; });
    U.q('#stSaveAlert').addEventListener('click', function () {
      S.set(function (s) {
        s.settings.alert.threshold = parseFloat(th.value);
        s.settings.alert.highLevel = parseFloat(U.q('#stHigh').value) || 0.92;
        s.settings.alert.midLevel = parseFloat(U.q('#stMid').value) || 0.85;
        s.settings.alert.cooldown = parseInt(U.q('#stCool').value, 10) || 30;
        s.settings.alert.autoArchive = U.q('#stAutoArc').checked;
      }, 'settings');
      A.UI.toast({ type: 'ok', title: '告警策略已保存', desc: '新阈值将在下一次模型下发后生效' });
    });

    /* 播报 */
    var tplEl = U.q('#stTpl');
    tplEl.addEventListener('input', function () {
      U.q('#stTplPrev').innerHTML = tplPrev(tplEl.value, S.get());
    });
    U.q('#stSaveSpk').addEventListener('click', function () {
      S.set(function (s) {
        s.settings.speaker.enabled = U.q('#stSpk').checked;
        s.settings.speaker.template = tplEl.value.trim() || s.settings.speaker.template;
        s.settings.speaker.repeat = U.clamp(parseInt(U.q('#stRepeat').value, 10) || 2, 1, 5);
        s.settings.speaker.volume = U.clamp(parseInt(U.q('#stVol').value, 10) || 70, 0, 100);
      }, 'settings');
      A.UI.toast({ type: 'ok', title: '播报设置已保存' });
    });

    /* 数据 */
    U.q('#stExport').addEventListener('click', function () {
      U.download('k1智巡数据备份_' + U.stamp(new Date()) + '.json', S.exportJSON(), 'application/json');
      A.UI.toast({ type: 'ok', title: '数据已导出' });
    });
    U.q('#stImport').addEventListener('click', function () { U.q('#stFile').click(); });
    U.q('#stFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      U.readFile(f, 'text').then(function (txt) {
        try {
          S.importJSON(txt);
          A.UI.toast({ type: 'ok', title: '数据导入成功' });
          A.Shell.mount();
        } catch (err) {
          A.UI.toast({ type: 'err', title: '导入失败', desc: err.message });
        }
      });
    });
    U.q('#stReset').addEventListener('click', function () {
      A.UI.confirm({
        title: '重置演示数据', danger: true, okText: '确认重置',
        html: '将清空当前全部人脸、告警与归档数据，并恢复初始示例数据。<br>' +
          '<b style="color:var(--danger)">此操作不可撤销</b>，建议先导出备份。'
      }).then(function (ok) {
        if (!ok) return;
        S.reset();
        A.UI.toast({ type: 'ok', title: '已重置为初始数据' });
        A.Shell.mount();
      });
    });

    /* 账号 */
    U.on(root, 'click', '[data-user]', function (e, t) {
      var id = t.getAttribute('data-user');
      var u = S.get().users.filter(function (x) { return x.id === id; })[0];
      var act = t.getAttribute('data-act');
      if (act === 'pwd') {
        A.UI.modal({
          title: '重置密码 · ' + u.name,
          size: 'narrow',
          body: '<div class="field"><label>新密码</label><input class="input" id="npw" type="text" value="k1@2026" placeholder="至少 6 位"></div>' +
            '<div class="hint">密码将以哈希形式保存在本地，演示环境请勿使用真实密码。</div>',
          footer: '<button class="btn" data-act="c">取消</button><button class="btn primary" data-act="ok">确认重置</button>',
          onMount: function (h) {
            h.foot.querySelector('[data-act="c"]').onclick = h.close;
            h.foot.querySelector('[data-act="ok"]').onclick = function () {
              var v = U.q('#npw').value.trim();
              if (v.length < 6) { A.UI.toast({ type: 'err', title: '密码至少 6 位' }); return; }
              S.set(function (s) {
                var t = s.users.filter(function (x) { return x.id === id; })[0];
                t.pwd = A.Auth.hashPwd(v);
              }, 'users');
              h.close();
              A.UI.toast({ type: 'ok', title: '密码已重置', desc: u.username + ' → ' + v });
            };
          }
        });
      }
      if (act === 'del') {
        A.UI.confirm({ title: '删除账号', danger: true, okText: '删除', text: '确定删除账号 ' + u.name + '（' + u.username + '）吗？' })
          .then(function (ok) {
            if (!ok) return;
            S.set(function (s) { s.users = s.users.filter(function (x) { return x.id !== id; }); }, 'users');
            A.UI.toast({ type: 'ok', title: '账号已删除' });
            A.Router.refresh();
          });
      }
    });
    var addBtn = U.q('#stAddUser');
    if (addBtn) addBtn.addEventListener('click', function () {
      A.UI.modal({
        title: '新增账号',
        body: '<div class="form-grid">' +
          f('登录账号', '<input class="input" id="nuName" placeholder="英文/数字">') +
          f('姓名', '<input class="input" id="nuReal" placeholder="显示名称">') +
          f('角色', '<select class="select" id="nuRole"><option value="patrol">巡逻员</option><option value="viewer">只读访客</option><option value="admin">管理员</option></select>') +
          f('初始密码', '<input class="input" id="nuPwd" value="k1@2026">') +
          '</div>',
        footer: '<button class="btn" data-act="c">取消</button><button class="btn primary" data-act="ok">创建</button>',
        onMount: function (h) {
          h.foot.querySelector('[data-act="c"]').onclick = h.close;
          h.foot.querySelector('[data-act="ok"]').onclick = function () {
            var un = U.q('#nuName').value.trim(), rn = U.q('#nuReal').value.trim();
            if (!un || !rn) { A.UI.toast({ type: 'err', title: '请填写账号与姓名' }); return; }
            if (S.get().users.some(function (x) { return x.username === un; })) {
              A.UI.toast({ type: 'err', title: '账号已存在' }); return;
            }
            var role = U.q('#nuRole').value;
            var roleName = { admin: '超级管理员', patrol: '巡逻员', viewer: '只读访客' }[role];
            S.set(function (s) {
              s.users.push({
                id: 'u_' + Date.now().toString(36), username: un, name: rn, role: role, roleName: roleName,
                pwd: A.Auth.hashPwd(U.q('#nuPwd').value), phone: '', lastLogin: ''
              });
            }, 'users');
            h.close();
            A.UI.toast({ type: 'ok', title: '账号已创建', desc: un + ' / ' + U.q('#nuPwd').value });
            A.Router.refresh();
          };
        }
      });
    });
  }

  function f(label, ctl) {
    return '<div class="field"><label>' + label + '</label>' + ctl + '</div>';
  }
  function tplPrev(tpl, st) {
    var p = S.currentPoint();
    var f0 = st.faces[0] || { name: '张伟' };
    return U.esc(S.speakerText(p.name, f0.name, '93', tpl))
      .replace(/请注意/g, '<u>请注意</u>')
      .replace(new RegExp(U.esc(p.name), 'g'), '<u>' + U.esc(p.name) + '</u>')
      .replace(new RegExp(U.esc(f0.name), 'g'), '<u>' + U.esc(f0.name) + '</u>')
      .replace(/93/g, '<u>93</u>');
  }

  A.Views = A.Views || {};
  A.Views.settings = { render: render };
})(window.App);
