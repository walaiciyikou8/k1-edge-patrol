/* ============================================================
   09 · view · 人脸库管理
   ============================================================ */
(function (A) {
  var U = A.U, I = A.UI.icon, S = A.Store;
  var PAGE_SIZE = 10;

  var state = { q: '', cat: 'all', feat: 'all', sort: 'updated', page: 1 };

  function filtered() {
    var st = S.get();
    var list = st.faces.slice();
    if (state.cat !== 'all') list = list.filter(function (f) { return f.cat === state.cat; });
    if (state.feat !== 'all') list = list.filter(function (f) { return f.featStatus === state.feat; });
    if (state.q) {
      var q = state.q.toLowerCase();
      list = list.filter(function (f) {
        return (f.name + ' ' + f.code + ' ' + (f.dept || '') + ' ' + (f.tags || []).join(' ')).toLowerCase().indexOf(q) >= 0;
      });
    }
    list.sort(function (a, b) {
      if (state.sort === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (state.sort === 'level') return b.level - a.level;
      if (state.sort === 'name') return a.name.localeCompare(b.name, 'zh');
      if (state.sort === 'hits') return (b.hitCount || 0) - (a.hitCount || 0);
      return 0;
    });
    return list;
  }

  function catName(id) { var c = S.CATS.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; }

  function render(root) {
    var st = S.get();
    var list = filtered();
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = U.clamp(state.page, 1, pages);
    var rows = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var narrow = A.UI.isNarrow();
    var counts = { all: st.faces.length };
    S.CATS.forEach(function (c) { counts[c.id] = st.faces.filter(function (f) { return f.cat === c.id; }).length; });

    root.innerHTML =
      '<div class="view-anim">' +
      '<div class="sec-head"><div><h2>人脸库管理</h2>' +
      '<p>维护比对底库 · 特征向量由 K1 NPU 提取后同步至云端对象存储</p></div><div class="grow"></div>' +
      '<div class="btn-group">' +
      '<button class="btn" id="faceExport">' + I('download') + '导出 CSV</button>' +
      '<button class="btn" id="faceSync">' + I('cloud') + '批量同步云端</button>' +
      '<button class="btn primary" id="faceAdd">' + I('plus') + '新增人员</button>' +
      '</div></div>' +

      '<div class="card"><div class="card-head" style="gap:10px">' +
      '<div class="search-box" style="min-width:210px;flex:1;max-width:300px">' + I('search') +
      '<input class="input" id="faceSearch" placeholder="搜索姓名 / 编号 / 部门 / 标签" value="' + U.esc(state.q) + '"></div>' +
      '<div class="segmented" id="faceCat">' +
      '<button data-c="all" class="' + (state.cat === 'all' ? 'on' : '') + '">全部 ' + counts.all + '</button>' +
      S.REG_CATS.map(function (c) {
        return '<button data-c="' + c.id + '" class="' + (state.cat === c.id ? 'on' : '') + '">' + c.name + ' ' + counts[c.id] + '</button>';
      }).join('') + '</div>' +
      '<div class="grow"></div>' +
      '<select class="select" id="faceFeat" style="width:auto">' +
      '<option value="all">全部状态</option>' +
      '<option value="synced"' + (state.feat === 'synced' ? ' selected' : '') + '>已同步</option>' +
      '<option value="pending"' + (state.feat === 'pending' ? ' selected' : '') + '>待同步</option>' +
      '<option value="failed"' + (state.feat === 'failed' ? ' selected' : '') + '>同步失败</option></select>' +
      '<select class="select" id="faceSort" style="width:auto">' +
      '<option value="updated"' + (state.sort === 'updated' ? ' selected' : '') + '>最近更新</option>' +
      '<option value="level"' + (state.sort === 'level' ? ' selected' : '') + '>告警级别</option>' +
      '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>姓名排序</option>' +
      '<option value="hits"' + (state.sort === 'hits' ? ' selected' : '') + '>命中次数</option></select>' +
      '</div>' +

      (total ? (narrow ? '<div class="face-list">' + rows.map(function (f) {
        var hit = S.get().alerts.filter(function (a) { return a.faceId === f.id; }).length;
        return '<div class="face-row" data-face="' + f.id + '">' +
          '<img src="' + f.photo + '" alt="">' +
          '<div class="fr-main"><b>' + U.esc(f.name) + A.UI.catBadge(f.cat) + (hit ? '<span class="badge danger sm">命中 ' + hit + '</span>' : '') + '</b>' +
          '<div class="fr-sub">' + U.esc(f.code) + ' · ' + U.esc(f.gender || '') + ' ' + U.esc(f.age || '') + '</div>' +
          '<div class="fr-tags">' + A.UI.levelTag(f.level) + A.UI.featBadge(f.featStatus) +
          (f.dept && f.dept !== '—' ? '<span class="tag">' + U.esc(f.dept) + '</span>' : '') + '</div></div>' +
          '<div class="fr-act">' +
          '<button class="btn-icon" data-act="edit" title="编辑">' + I('edit') + '</button>' +
          '<button class="btn-icon danger" data-act="del" title="删除">' + I('trash') + '</button>' +
          '</div></div>';
      }).join('') + '</div>' : '') +
        '<div class="table-wrap' + (narrow ? ' hide' : '') + '"><table class="tbl"><thead><tr>' +
        '<th style="min-width:190px">人员</th><th>分类</th><th>级别</th>' +
        '<th class="h-sm">部门 / 单位</th><th>特征状态</th><th class="h-sm">更新时间</th><th style="text-align:right">操作</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (f) {
          var hit = S.get().alerts.filter(function (a) { return a.faceId === f.id; }).length;
          return '<tr data-face="' + f.id + '">' +
            '<td><div class="tbl-person"><img class="tbl-thumb" src="' + f.photo + '" alt="">' +
            '<div><div class="cell-main">' + U.esc(f.name) + (hit ? ' <span class="badge danger sm">命中 ' + hit + '</span>' : '') + '</div>' +
            '<div class="cell-sub mono">' + U.esc(f.code) + ' · ' + U.esc(f.gender || '—') + ' ' + U.esc(f.age || '') + '</div></div></div></td>' +
            '<td>' + A.UI.catBadge(f.cat) + '</td>' +
            '<td>' + A.UI.levelTag(f.level) + '</td>' +
            '<td class="h-sm"><div class="cell-main" style="font-weight:500">' + U.esc(f.dept || '—') + '</div>' +
            '<div class="cell-sub">' + U.esc(f.idNo || '—') + '</div></td>' +
            '<td>' + A.UI.featBadge(f.featStatus) + '</td>' +
            '<td class="h-sm cell-sub">' + U.esc(U.ago(f.updatedAt)) + '</td>' +
            '<td><div class="tbl-actions">' +
            '<button class="btn-icon" data-act="view" title="详情">' + I('eye') + '</button>' +
            '<button class="btn-icon" data-act="edit" title="编辑">' + I('edit') + '</button>' +
            '<button class="btn-icon" data-act="sync" title="同步云端">' + I('cloud') + '</button>' +
            '<button class="btn-icon danger" data-act="del" title="删除">' + I('trash') + '</button>' +
            '</div></td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<div class="card-foot"><div class="pager" style="width:100%">' +
        '<span class="pg-info">共 ' + total + ' 人 · 第 ' + state.page + '/' + pages + ' 页</span>' +
        '<button data-pg="prev"' + (state.page === 1 ? ' disabled' : '') + '>' + I('left') + '</button>' +
        pageButtons(state.page, pages) +
        '<button data-pg="next"' + (state.page === pages ? ' disabled' : '') + '>' + I('right') + '</button>' +
        '</div></div>'
        : A.UI.emptyBox('没有匹配的人员', '调整筛选条件或新增一条人员记录', 'faces')) +
      '</div></div>';

    /* 事件 */
    var si = U.q('#faceSearch');
    si.addEventListener('input', U.debounce(function () {
      state.q = si.value; state.page = 1; render(root);
      var n = U.q('#faceSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
    }, 220));
    U.qa('#faceCat button').forEach(function (b) {
      b.addEventListener('click', function () { state.cat = b.getAttribute('data-c'); state.page = 1; render(root); });
    });
    U.q('#faceFeat').addEventListener('change', function (e) { state.feat = e.target.value; state.page = 1; render(root); });
    U.q('#faceSort').addEventListener('change', function (e) { state.sort = e.target.value; render(root); });
    U.on(root, 'click', '[data-pg]', function (e, t) {
      state.page += t.getAttribute('data-pg') === 'next' ? 1 : -1; render(root);
    });
    U.on(root, 'click', '[data-page]', function (e, t) { state.page = parseInt(t.getAttribute('data-page'), 10); render(root); });

    U.on(root, 'click', '.face-row .btn-icon', function (e, t) {
      e.stopPropagation();
      var id = t.closest('.face-row').getAttribute('data-face');
      var act = t.getAttribute('data-act');
      if (act === 'edit') openForm(id, root);
      if (act === 'del') removeFace(id, root);
    });
    U.on(root, 'click', '.face-row', function (e, t) {
      if (e.target.closest('.btn-icon')) return;
      openDetail(t.getAttribute('data-face'));
    });
    U.on(root, 'click', 'tr[data-face] .btn-icon', function (e, t) {
      e.stopPropagation();
      var id = t.closest('tr').getAttribute('data-face');
      var act = t.getAttribute('data-act');
      if (act === 'view') openDetail(id);
      if (act === 'edit') openForm(id);
      if (act === 'sync') syncOne(id, root);
      if (act === 'del') removeFace(id, root);
    });
    U.on(root, 'click', 'tr[data-face]', function (e, t) {
      if (e.target.closest('.btn-icon')) return;
      openDetail(t.getAttribute('data-face'));
    });

    U.q('#faceAdd').addEventListener('click', function () { openForm(null, root); });
    U.q('#faceSync').addEventListener('click', function () { batchSync(root); });
    U.q('#faceExport').addEventListener('click', function () { exportCsv(); });
  }

  function pageButtons(cur, pages) {
    var out = '', from = Math.max(1, cur - 2), to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);
    for (var i = from; i <= to; i++) out += '<button data-page="' + i + '" class="' + (i === cur ? 'on' : '') + '">' + i + '</button>';
    return out;
  }

  /* ---------------- 新增 / 编辑表单 ---------------- */
  function openForm(id, root) {
    var st = S.get();
    var f = id ? S.faceById(id) : null;
    var photo = f ? f.photo : '';
    var tags = f ? (f.tags || []).slice() : [];
    var isNew = !f;

    var body =
      '<div class="upload-zone" id="fcZone"' + (photo ? ' style="display:none"' : '') + '>' +
      I('image') +
      '<b>点击任意位置选择本地照片 · 也可拖拽图片到这里 · 或 Ctrl + V 粘贴截图</b>' +
      '<span>支持 JPG / PNG / WebP，自动压缩到 512px；正脸免冠效果最好，导入后保存即入库</span>' +
      '<button type="button" class="btn sm" id="fcPick" style="display:block;margin:11px auto 0">' + I('upload') + '从电脑选择文件</button>' +
      '</div>' +
      '<div class="upload-preview' + (photo ? '' : ' hide') + '" id="fcPrev" style="margin-bottom:16px">' +
      '<img class="up-img" id="fcPhoto" src="' + (photo || '') + '" alt="">' +
      '<div class="up-actions">' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap">' +
      '<button class="btn sm" id="fcUpload">' + I('upload') + '换一张</button>' +
      '<button class="btn sm" id="fcGen">' + I('sparkles') + '生成示例</button>' +
      '<button class="btn sm danger" id="fcClear">' + I('trash') + '移除</button>' +
      '</div>' +
      '<div class="hint" id="fcMeta"></div>' +
      '</div></div>' +
      '<div class="form-grid">' +
      field('姓名', '<input class="input" id="fName" value="' + U.esc(f ? f.name : '') + '" placeholder="请输入真实姓名">', true) +
      field('编号', '<input class="input mono" id="fCode" value="' + U.esc(f ? f.code : S.nextFaceCode()) + '" ' + (isNew ? '' : '') + '>') +
      field('人员分类', '<select class="select" id="fCat">' +
        S.REG_CATS.map(function (c) { return '<option value="' + c.id + '"' + (f && f.cat === c.id ? ' selected' : '') + '>' + c.name + '</option>'; }).join('') + '</select>', true) +
      field('告警级别', '<select class="select" id="fLevel">' +
        [3, 2, 1, 0].map(function (l) { return '<option value="' + l + '"' + (f && f.level === l ? ' selected' : (!f && l === 1 ? ' selected' : '')) + '>' + S.LEVELS[l].name + '</option>'; }).join('') + '</select>') +
      field('性别', '<select class="select" id="fGender">' +
        ['男', '女'].map(function (g) { return '<option' + (f && f.gender === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select>') +
      field('年龄段', '<input class="input" id="fAge" value="' + U.esc(f ? f.age : '') + '" placeholder="如 30-40">') +
      field('部门 / 单位', '<input class="input" id="fDept" value="' + U.esc(f ? f.dept : '') + '" placeholder="如 设施运维部 / 外部访客">') +
      field('证件 / 工号', '<input class="input" id="fIdNo" value="' + U.esc(f ? f.idNo : '') + '" placeholder="身份证号或工号">') +
      field('联系电话', '<input class="input" id="fPhone" value="' + U.esc(f ? f.phone : '') + '" placeholder="选填">') +
      '<div class="field span2"><label>标签</label>' +
      '<div class="input-group"><input class="input" id="fTagInput" placeholder="输入后回车添加，如：夜间活动">' +
      '<button class="btn" type="button" id="fTagAdd">添加</button></div>' +
      '<div class="chip-row" id="fTags" style="margin-top:7px"></div></div>' +
      '<div class="field span2"><label>备注</label>' +
      '<textarea class="input" id="fNote" placeholder="记录人员背景、授权范围或历史告警说明">' + U.esc(f ? f.note : '') + '</textarea></div>' +
      '</div>' +
      '<input type="file" id="fcFile" accept="image/*" style="display:none">';

    var h = A.UI.modal({
      title: isNew ? '新增人员到人脸库' : '编辑人员信息',
      sub: (isNew ? '照片与特征向量将在保存后同步至云端' : f.code) + ' · 特征维度 512',
      size: 'wide',
      body: body,
      footer: '<button class="btn" data-act="cancel">取消</button>' +
        '<button class="btn primary" data-act="save">' + I('check') + (isNew ? '保存并入库' : '保存修改') + '</button>',
      onMount: function (h) {
        paintTags();
        var fileEl = U.q('#fcFile');

        function setPhoto(url, meta) {
          photo = url;
          U.q('#fcPrev').classList.remove('hide');
          U.q('#fcZone').style.display = 'none';
          U.q('#fcPhoto').src = url;
          U.q('#fcMeta').textContent = meta || '';
        }
        function importImage(dataUrl, name, rawSize) {
          U.shrinkImage(dataUrl, 512, 0.85).then(function (small) {
            var probe = new Image();
            probe.onload = function () {
              var old = U.base64Size(small);
              setPhoto(small, (name ? name + ' · ' : '') + probe.naturalWidth + '×' + probe.naturalHeight +
                ' · ' + U.fmtBytes(old) + (rawSize && rawSize > old ? '（已自动压缩）' : ''));
            };
            probe.src = small;
          });
        }
        function handleFile(file, name) {
          if (!file) return;
          if (!/^image\//.test(file.type)) { A.UI.toast({ type: 'err', title: '请选择图片文件', desc: '支持 JPG / PNG / WebP' }); return; }
          U.readFile(file).then(function (url) { importImage(url, name || file.name, file.size); });
        }
        U.q('#fcUpload').addEventListener('click', function () { fileEl.click(); });
        fileEl.addEventListener('change', function () { handleFile(fileEl.files[0]); fileEl.value = ''; });
        /* 点击上传区任意位置 → 打开本地文件选择框（原先只支持拖拽/粘贴，点击没反应） */
        var zone = U.q('#fcZone');
        zone.addEventListener('click', function (e) {
          if (e.target.closest('button[data-nopick]')) return;
          fileEl.click();
        });
        U.q('#fcGen').addEventListener('click', function () {
          var nm = U.q('#fName').value || 'demo';
          setPhoto(A.Mock.avatar(nm + Date.now(), nm), '示例人像（演示用插画）');
        });
        U.q('#fcClear').addEventListener('click', function () {
          photo = '';
          U.q('#fcPrev').classList.add('hide');
          U.q('#fcZone').style.display = '';
          U.q('#fcMeta').textContent = '';
        });
        /* 拖拽导入 */
        ['dragover', 'dragenter'].forEach(function (evn) {
          zone.addEventListener(evn, function (e) { e.preventDefault(); zone.classList.add('drag'); });
        });
        ['dragleave', 'drop'].forEach(function (evn) {
          zone.addEventListener(evn, function (e) { e.preventDefault(); zone.classList.remove('drag'); });
        });
        zone.addEventListener('drop', function (e) {
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        /* Ctrl+V 粘贴截图导入 */
        function onPaste(e) {
          if (!U.q('#fcZone') || U.q('#fcZone').style.display === 'none') {
            /* 已有照片时也允许覆盖粘贴 */
          }
          var items = e.clipboardData && e.clipboardData.items;
          if (!items) return;
          for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf('image') === 0) {
              var file = items[i].getAsFile();
              if (file) handleFile(file, '剪贴板图片');
              e.preventDefault();
              break;
            }
          }
        }
        document.addEventListener('paste', onPaste);
        var _origClose = h.close;
        h.close = function () {
          document.removeEventListener('paste', onPaste);
          _origClose();
        };

        U.q('#fTagAdd').addEventListener('click', addTag);
        U.q('#fTagInput').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); addTag(); }
        });
        U.on(U.q('#fTags'), 'click', 'button', function (e, t) {
          var i = parseInt(t.getAttribute('data-i'), 10);
          tags.splice(i, 1); paintTags();
        });

        function addTag() {
          var el = U.q('#fTagInput');
          var v = el.value.trim();
          if (!v) return;
          if (tags.indexOf(v) < 0) tags.push(v);
          el.value = ''; paintTags();
        }
        function paintTags() {
          var box = U.q('#fTags');
          if (!box) return;
          box.innerHTML = tags.length ? tags.map(function (t, i) {
            return '<span class="tag">' + U.esc(t) + '<button data-i="' + i + '">' + I('x') + '</button></span>';
          }).join('') : '<span class="hint">尚未添加标签</span>';
        }

        h.foot.querySelector('[data-act="cancel"]').onclick = h.close;
        h.foot.querySelector('[data-act="save"]').onclick = function () {
          var name = U.q('#fName').value.trim();
          var code = U.q('#fCode').value.trim();
          if (!name) { A.UI.toast({ type: 'err', title: '请填写姓名' }); return; }
          if (!code) { A.UI.toast({ type: 'err', title: '请填写编号' }); return; }
          var dup = S.get().faces.filter(function (x) { return x.code === code && x.id !== id; })[0];
          if (dup) { A.UI.toast({ type: 'err', title: '编号已存在', desc: '请更换为唯一编号' }); return; }
          if (!photo) { A.UI.toast({ type: 'err', title: '请上传人脸照片', desc: '底库需要一张清晰的正面照' }); return; }

          var data = {
            name: name, code: code,
            cat: U.q('#fCat').value, level: parseInt(U.q('#fLevel').value, 10),
            gender: U.q('#fGender').value, age: U.q('#fAge').value.trim(),
            dept: U.q('#fDept').value.trim(), idNo: U.q('#fIdNo').value.trim(),
            phone: U.q('#fPhone').value.trim(), note: U.q('#fNote').value.trim(),
            tags: tags.slice(), photo: photo,
            updatedAt: new Date().toISOString()
          };
          var photoChanged = !f || f.photo !== photo;
          S.set(function (st) {
            if (id) {
              var t = st.faces.filter(function (x) { return x.id === id; })[0];
              for (var k in data) t[k] = data[k];
              if (photoChanged) { t.featStatus = 'pending'; t.photoKey = ''; }
            } else {
              st.faces.unshift(Object.assign({
                id: 'f_' + code + '_' + Date.now(), featStatus: 'pending', featDim: 512,
                hitCount: 0, photoKey: '', createdAt: new Date().toISOString()
              }, data));
            }
          }, 'faces');
          h.close();
          A.UI.toast({ type: 'ok', title: id ? '已保存修改' : '已添加 ' + name, desc: '特征状态：待同步至云端' });
          A.Views.faces.render(root);

          var nf = S.get().faces.filter(function (x) { return x.code === code; })[0];
          if (nf) {
            syncOne(nf.id, root, true);
            // 同步到 K1 端侧底库（否则 K1 认不出这个人，只会报陌生访客）
            if (A.Live && A.Live.pushFace) {
              nf.k1Synced = false;
              A.Live.pushFace(nf).then(function (r) {
                if (r && r.ok) A.UI.toast({ type: 'ok', title: '已同步到 K1 底库', desc: name + ' · K1 3 秒内生效', timeout: 3200 });
                else A.UI.toast({ type: 'warn', title: 'K1 底库同步失败', desc: (r && r.error) || '检查 K1 是否在线', timeout: 4200 });
              });
            }
          }
        };
      }
    });

    function field(label, control, req) {
      return '<div class="field"><label>' + label + (req ? '<span class="req">*</span>' : '') + '</label>' + control + '</div>';
    }
  }

  /* ---------------- 详情 ---------------- */
  function openDetail(id) {
    var f = S.faceById(id);
    if (!f) return;
    var st = S.get();
    var hits = st.alerts.filter(function (a) { return a.faceId === id; }).sort(function (a, b) { return new Date(b.occurredAt) - new Date(a.occurredAt); });
    var vec = A.Mock.feature(f.code, 512);
    var heat = vec.slice(0, 256).map(function (v) {
      var a = 0.12 + v * 0.88;
      return '<i style="background:rgba(31,111,235,' + a.toFixed(2) + ')"></i>';
    }).join('');

    A.UI.drawer({
      title: f.name,
      sub: f.code + ' · ' + catName(f.cat),
      size: 'wide',
      body:
        '<div class="face-detail">' +
        '<div class="fd-photo"><img src="' + f.photo + '" alt="">' +
        '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">' + A.UI.catBadge(f.cat) +
        '<div>' + A.UI.levelTag(f.level) + '</div>' + A.UI.featBadge(f.featStatus) + '</div></div>' +
        '<div>' +
        '<dl class="kv">' +
        '<dt>编号</dt><dd class="mono">' + U.esc(f.code) + '</dd>' +
        '<dt>性别 / 年龄</dt><dd>' + U.esc(f.gender || '—') + ' · ' + U.esc(f.age || '—') + '</dd>' +
        '<dt>部门 / 单位</dt><dd>' + U.esc(f.dept || '—') + '</dd>' +
        '<dt>证件 / 工号</dt><dd class="mono">' + U.esc(f.idNo || '—') + '</dd>' +
        '<dt>联系电话</dt><dd>' + U.esc(f.phone || '—') + '</dd>' +
        '<dt>标签</dt><dd>' + ((f.tags && f.tags.length) ? f.tags.map(function (t) { return '<span class="tag">' + U.esc(t) + '</span>'; }).join(' ') : '—') + '</dd>' +
        '<dt>创建时间</dt><dd>' + U.esc(U.fmtDT(f.createdAt)) + '</dd>' +
        '<dt>最近更新</dt><dd>' + U.esc(U.fmtDT(f.updatedAt)) + '</dd>' +
        '<dt>云端对象</dt><dd class="mono" style="font-size:11px">' + U.esc(f.photoKey || '未上传') + '</dd>' +
        '<dt>命中告警</dt><dd>' + hits.length + ' 次</dd>' +
        '</dl>' +
        (f.note ? '<div class="note" style="margin-top:12px">' + I('info') + '<div>' + U.esc(f.note) + '</div></div>' : '') +
        '<div class="divider"></div>' +
        '<div style="font-size:12.5px;font-weight:600;margin-bottom:6px">NPU 特征向量（512 维 · 展示前 256 维）</div>' +
        '<div class="feat-map">' + heat + '</div>' +
        '<div class="hint" style="font-size:11px;color:var(--text-3);margin-top:6px">由 K1 NPU 以 INT8 量化模型提取，余弦相似度阈值 ' +
        (st.settings.alert.threshold * 100).toFixed(0) + '% 时触发告警</div>' +
        '</div></div>' +
        '<div class="divider"></div>' +
        '<div style="font-size:12.5px;font-weight:600;margin-bottom:9px">命中记录</div>' +
        (hits.length ? '<div style="display:flex;flex-direction:column;gap:8px">' + hits.slice(0, 6).map(function (a) {
          return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:10px">' +
            '<img src="' + a.snapshot + '" style="width:64px;height:42px;object-fit:cover;border-radius:6px">' +
            '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600">' + U.esc(a.pointName) + '</div>' +
            '<div style="font-size:11px;color:var(--text-3)">' + U.esc(U.fmtDT(a.occurredAt)) + ' · 相似度 ' + (a.similarity * 100).toFixed(1) + '%</div></div>' +
            A.UI.statusBadge(a.status) + '</div>';
        }).join('') + '</div>' : '<div class="hint">暂无命中记录</div>'),
      footer: '<button class="btn danger left" data-act="del">' + I('trash') + '删除</button>' +
        '<button class="btn" data-act="sync">' + I('cloud') + '同步云端</button>' +
        '<button class="btn primary" data-act="edit">' + I('edit') + '编辑资料</button>',
      onMount: function (h) {
        h.foot.querySelector('[data-act="edit"]').onclick = function () { h.close(); openForm(id); };
        h.foot.querySelector('[data-act="sync"]').onclick = function () { h.close(); syncOne(id); };
        h.foot.querySelector('[data-act="del"]').onclick = function () { h.close(); removeFace(id); };
      }
    });
  }

  /* ---------------- 同步 / 删除 / 导出 ---------------- */
  function syncOne(id, root, silent) {
    var f = S.faceById(id);
    if (!f) return;
    if (!A.Cloud.ready()) {
      S.set(function () {
        var t = S.faceById(id);
        t.featStatus = 'synced';
        t.photoKey = 'faces/' + t.code + '_' + t.name + '.jpg';
      }, 'faces');
      if (!silent) A.UI.toast({ type: 'warn', title: '未配置华为云', desc: '已在本地演示模式标记为已同步；填入 OBS 配置后将真实上传' });
      if (root) render(root);
      return;
    }
    A.UI.toast({ type: 'info', title: '正在上传 ' + f.name + '…' });
    A.Cloud.uploadFace(f).then(function (r) {
      S.commit('faces');
      A.UI.toast(r.ok
        ? { type: 'ok', title: f.name + ' 已同步至云端', desc: f.photoKey }
        : { type: 'err', title: '同步失败', desc: r.error || '' });
      if (root) render(root);
    });
  }

  function batchSync(root) {
    var st = S.get();
    var pend = st.faces.filter(function (f) { return f.featStatus !== 'synced'; });
    if (!pend.length) { A.UI.toast({ type: 'ok', title: '全部人脸已同步', desc: '当前底库无待同步记录' }); return; }
    if (!A.Cloud.ready()) {
      S.set(function (s) {
        s.faces.forEach(function (f) {
          if (f.featStatus !== 'synced') { f.featStatus = 'synced'; f.photoKey = 'faces/' + f.code + '_' + f.name + '.jpg'; }
        });
      }, 'faces');
      A.UI.toast({ type: 'warn', title: pend.length + ' 条已在本地标记同步', desc: '配置华为云 OBS 后可执行真实上传' });
      render(root);
      return;
    }
    var t = A.UI.toast({ type: 'info', title: '正在同步 ' + pend.length + ' 条人员…', desc: '上传照片至华为云 OBS' });
    A.Cloud.syncAll().then(function (r) {
      S.commit('faces');
      A.UI.toast(r.ok ? { type: 'ok', title: '同步完成', desc: '详见「华为云对接」同步日志' } : { type: 'err', title: '同步异常', desc: r.error || '' });
      render(root);
    });
  }

  function removeFace(id, root) {
    var f = S.faceById(id);
    A.UI.confirm({
      title: '删除人员', danger: true, okText: '确认删除',
      html: '确定从人脸库中删除 <b>' + U.esc(f.name) + '</b>（' + U.esc(f.code) + '）吗？<br>' +
        '<span style="color:var(--text-3);font-size:12px">删除后 K1 端比对底库将同步移除该特征，历史归档记录会保留。</span>'
    }).then(function (ok) {
      if (!ok) return;
      S.set(function (st) {
        st.faces = st.faces.filter(function (x) { return x.id !== id; });
      }, 'faces');
      A.UI.toast({ type: 'ok', title: '已删除 ' + f.name });
      A.Views.faces.render(U.q('#viewRoot'));
    });
  }

  function exportCsv() {
    var list = filtered();
    var rows = [['编号', '姓名', '分类', '级别', '性别', '年龄段', '部门', '证件/工号', '电话', '标签', '特征状态', '更新时间', '备注']];
    list.forEach(function (f) {
      rows.push([f.code, f.name, catName(f.cat), S.LEVELS[f.level].name, f.gender, f.age, f.dept, f.idNo, f.phone,
        (f.tags || []).join('/'), f.featStatus, U.fmtDT(f.updatedAt), f.note]);
    });
    U.download('人脸库_' + U.fmtDate(new Date()) + '.csv', U.csv(rows), 'text/csv;charset=utf-8');
    A.UI.toast({ type: 'ok', title: '已导出 ' + list.length + ' 条记录' });
  }

  A.Views = A.Views || {};
  A.Views.faces = { render: render, openForm: openForm, openDetail: openDetail, state: state };
})(window.App);
