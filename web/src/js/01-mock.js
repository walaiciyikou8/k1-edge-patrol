/* ============================================================
   01 · mock —— 演示用图像与遥测数据生成（纯 SVG，无外部请求）
   ============================================================ */
(function (A) {
  var U = A.U;
  var enc = function (svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s{2,}/g, ' ')); };

  var SKIN = [['#f2d3bd', '#e6bda3'], ['#ecc9ae', '#dcb094'], ['#e0b391', '#cfa07c'], ['#c99572', '#b8815f'], ['#f7ddc9', '#eccaae']];
  var HAIR = ['#2c2c33', '#3b2b26', '#1f2937', '#4a3a34', '#242038'];
  var CLOTH = ['#3f5f8f', '#4b6b52', '#7a4a54', '#2f4858', '#5b5f7a', '#8a6a3f', '#39626b'];
  var BGS = [['#dfeafb', '#c9dcf6'], ['#e6f2f6', '#cfe6ee'], ['#e9e6f8', '#d7d3f2'], ['#e8f0e6', '#d3e4d0'], ['#f7e9e4', '#ecd7ce']];

  /* ---------- 人像（人脸库证件照风格插画） ---------- */
  function avatar(seed, name) {
    var r = U.rng(seed || name || 'x');
    var skin = SKIN[Math.floor(r() * SKIN.length)];
    var hair = HAIR[Math.floor(r() * HAIR.length)];
    var cloth = CLOTH[Math.floor(r() * CLOTH.length)];
    var bg = BGS[Math.floor(r() * BGS.length)];
    var hairStyle = Math.floor(r() * 5);
    var glasses = r() > 0.72;
    var female = hairStyle === 1;

    var s = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200'>";
    s += "<defs><linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'>";
    s += "<stop offset='0' stop-color='" + bg[0] + "'/><stop offset='1' stop-color='" + bg[1] + "'/></linearGradient></defs>";
    s += "<rect width='200' height='200' fill='url(#bg)'/>";
    /* 肩部 */
    s += "<path d='M20 200c0-38 34-62 80-62s80 24 80 62z' fill='" + cloth + "'/>";
    s += "<path d='M84 132h32v20a16 16 0 0 1-32 0z' fill='" + cloth + "' opacity='.55'/>";
    /* 脖子 */
    s += "<rect x='87' y='102' width='26' height='28' rx='12' fill='" + skin[1] + "'/>";
    /* 长发后层 */
    if (hairStyle === 1) s += "<path d='M57 84c0-30 19-46 43-46s43 16 43 46v50c0 8-9 12-16 8V88H73v54c-7 4-16 0-16-8z' fill='" + hair + "'/>";
    /* 头 */
    s += "<ellipse cx='100' cy='82' rx='36' ry='39' fill='" + skin[0] + "'/>";
    /* 耳朵 */
    s += "<ellipse cx='63' cy='86' rx='5.5' ry='8' fill='" + skin[1] + "'/><ellipse cx='137' cy='86' rx='5.5' ry='8' fill='" + skin[1] + "'/>";
    /* 头发 */
    if (hairStyle === 0) s += "<path d='M63 80a37 37 0 0 1 74 0c0-31-17-45-37-45S63 49 63 80z' fill='" + hair + "'/>";
    if (hairStyle === 2) {
      s += "<path d='M63 80a37 37 0 0 1 74 0c0-31-17-45-37-45S63 49 63 80z' fill='" + hair + "'/>";
      s += "<circle cx='134' cy='46' r='13' fill='" + hair + "'/>";
    }
    if (hairStyle === 3) {
      s += "<path d='M60 72a41 41 0 0 1 80 0z' fill='#33456b'/><rect x='54' y='68' width='92' height='9' rx='4.5' fill='#243456'/>";
    }
    if (hairStyle === 4) {
      s += "<path d='M65 78c4-24 18-38 35-38s31 14 35 38c-8-16-20-22-35-22s-27 6-35 22z' fill='" + hair + "'/>";
    }
    /* 眉毛 */
    s += "<path d='M80 74q8-4 15 0' stroke='" + hair + "' stroke-width='2.6' fill='none' stroke-linecap='round' opacity='.8'/>";
    s += "<path d='M105 74q7-4 15 0' stroke='" + hair + "' stroke-width='2.6' fill='none' stroke-linecap='round' opacity='.8'/>";
    /* 眼睛 */
    s += "<ellipse cx='87' cy='84' rx='3.4' ry='4' fill='#2b3440'/><ellipse cx='113' cy='84' rx='3.4' ry='4' fill='#2b3440'/>";
    if (glasses) {
      s += "<g fill='none' stroke='#43536b' stroke-width='1.8'><rect x='78' y='77' width='18' height='14' rx='5'/><rect x='104' y='77' width='18' height='14' rx='5'/><path d='M96 83h8'/></g>";
    }
    /* 鼻子 / 口 */
    s += "<path d='M100 88v8q0 3 3 4' stroke='" + skin[1] + "' stroke-width='2.2' fill='none' stroke-linecap='round'/>";
    s += "<path d='M92 105q8 5 16 0' stroke='#b5625f' stroke-width='2.8' fill='none' stroke-linecap='round'/>";
    if (female) s += "<circle cx='74' cy='96' r='3' fill='#e7a9a4' opacity='.5'/><circle cx='126' cy='96' r='3' fill='#e7a9a4' opacity='.5'/>";
    s += "</svg>";
    return enc(s);
  }

  /* ---------- 监控画面（一点透视夜间走廊） ---------- */
  function scene(seed, opts) {
    opts = opts || {};
    var r = U.rng(seed || 'scene');
    var withPerson = opts.person !== false;
    var vpx = 320;
    var s = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 400' width='640' height='400'>";
    s += "<defs>";
    s += "<linearGradient id='sk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1b2e45'/><stop offset='1' stop-color='#0c1626'/></linearGradient>";
    s += "<linearGradient id='fl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#23415c'/><stop offset='1' stop-color='#122032'/></linearGradient>";
    s += "<radialGradient id='lg' cx='50%' cy='50%' r='50%'><stop offset='0' stop-color='#ffeec2' stop-opacity='.5'/><stop offset='1' stop-color='#ffeec2' stop-opacity='0'/></radialGradient>";
    s += "<radialGradient id='vg' cx='50%' cy='46%' r='72%'><stop offset='50%' stop-color='#000' stop-opacity='0'/><stop offset='100%' stop-color='#000' stop-opacity='.62'/></radialGradient>";
    s += "</defs>";
    s += "<rect width='640' height='400' fill='url(#sk)'/>";
    /* 天花板 */
    s += "<path d='M0 0h640L392 138H248Z' fill='#16263a'/>";
    /* 远端墙面 */
    s += "<rect x='248' y='138' width='144' height='124' fill='#11202f'/>";
    /* 远端门洞 */
    s += "<rect x='282' y='168' width='58' height='94' fill='#0a1622' stroke='#2b4762' stroke-width='1.2'/>";
    s += "<rect x='306' y='172' width='20' height='8' rx='2' fill='#1c8f60' opacity='.9'/>";
    s += "<rect x='386' y='176' width='2' height='86' fill='#2b4762' opacity='.6'/>";
    /* 左右墙 */
    s += "<path d='M0 0l248 138v124L0 400Z' fill='#1e334a'/>";
    s += "<path d='M640 0l-248 138v124L640 400Z' fill='#18293d'/>";
    /* 地面 */
    s += "<path d='M0 400h640L392 262H248Z' fill='url(#fl)'/>";
    /* 地面透视网格 */
    s += "<g stroke='#31506d' stroke-width='1' opacity='.45'>";
    [-320, -213, -107, 0, 107, 213, 320].forEach(function (dx) {
      s += "<path d='M" + vpx + " 262L" + (vpx + dx) + " 400'/>";
    });
    [0.28, 0.46, 0.64, 0.82].forEach(function (t) {
      var y = 262 + (400 - 262) * t;
      var hw = ((y - 200) / 200) * 320;
      s += "<path d='M" + (vpx - hw) + " " + y.toFixed(1) + "h" + (hw * 2).toFixed(1) + "'/>";
    });
    s += "</g>";
    /* 墙面踢脚线 */
    s += "<g stroke='#2e4b66' stroke-width='2' opacity='.7'>";
    s += "<path d='M0 372L248 250'/><path d='M640 372L392 250'/>";
    s += "</g>";
    /* 顶灯（近大远小） */
    [[-170, 22, 340, 8, 190], [-118, 62, 236, 6, 130], [-72, 98, 144, 5, 84], [-40, 122, 80, 4, 48]].forEach(function (L) {
      var lx = vpx + L[0] + L[2] / 2;
      s += "<ellipse cx='" + lx + "' cy='" + (L[1] + 34) + "' rx='" + L[4] + "' ry='" + (L[4] * 0.55) + "' fill='url(#lg)'/>";
      s += "<rect x='" + (vpx + L[0]) + "' y='" + L[1] + "' width='" + L[2] + "' height='" + L[3] + "' rx='" + (L[3] / 2) + "' fill='#f7ecc9' opacity='.82'/>";
    });
    /* 人物剪影 */
    if (withPerson) {
      var sc = 0.92 + r() * 0.22;
      var cx = U.clamp(200 + r() * 240, 150, 480);
      var headY = 198 + r() * 18, headR = 15 * sc;
      var hipY = headY + 96 * sc, footY = 336 + r() * 14;
      s += "<ellipse cx='" + cx + "' cy='" + (footY + 3) + "' rx='" + (26 * sc) + "' ry='" + (6 * sc) + "' fill='#08121d' opacity='.6'/>";
      /* 腿 */
      s += "<path d='M" + (cx - 13 * sc) + " " + hipY + "L" + (cx - 15 * sc) + " " + footY + "h" + (10 * sc) + "L" + (cx - 2 * sc) + " " + hipY + "Z' fill='#0c1725'/>";
      s += "<path d='M" + (cx + 2 * sc) + " " + hipY + "L" + (cx + 6 * sc) + " " + footY + "h" + (10 * sc) + "L" + (cx + 14 * sc) + " " + hipY + "Z' fill='#0e1b2b'/>";
      /* 躯干 */
      s += "<path d='M" + (cx - 22 * sc) + " " + (headY + 20 * sc) + "q" + (22 * sc) + " -8 " + (44 * sc) + " 0l" + (6 * sc) + " " + (76 * sc) + "h" + (-56 * sc) + "Z' fill='#101f30'/>";
      /* 手臂 */
      s += "<path d='M" + (cx - 21 * sc) + " " + (headY + 26 * sc) + "L" + (cx - 30 * sc) + " " + (hipY - 4 * sc) + "' stroke='#0c1927' stroke-width='" + (9 * sc) + "' stroke-linecap='round'/>";
      s += "<path d='M" + (cx + 21 * sc) + " " + (headY + 26 * sc) + "L" + (cx + 31 * sc) + " " + (hipY - 8 * sc) + "' stroke='#0c1927' stroke-width='" + (9 * sc) + "' stroke-linecap='round'/>";
      /* 头 */
      s += "<circle cx='" + cx + "' cy='" + headY + "' r='" + headR + "' fill='#152538'/>";
      /* 边缘轮廓光 */
      s += "<path d='M" + (cx + headR * 0.92) + " " + (headY - headR * 0.4) + "a" + headR + " " + headR + " 0 0 1 0 " + (headR * 0.8) +
        "' stroke='#4b7196' stroke-width='1.5' fill='none' opacity='.8'/>";
      /* 人脸检测框 */
      if (opts.box !== false) {
        var bw = headR * 2.5, bh = headR * 2.9, bx = cx - bw / 2, by = headY - bh / 2, cl = 8;
        s += "<g stroke='#4ade80' stroke-width='1.8' fill='none' opacity='.95'>";
        s += "<path d='M" + bx + " " + (by + cl) + "V" + by + "h" + cl + "'/>";
        s += "<path d='M" + (bx + bw - cl) + " " + by + "h" + cl + "v" + cl + "'/>";
        s += "<path d='M" + bx + " " + (by + bh - cl) + "v" + cl + "h" + cl + "'/>";
        s += "<path d='M" + (bx + bw) + " " + (by + bh - cl) + "v" + cl + "h" + (-cl) + "'/>";
        s += "</g>";
        var label = 'face ' + (0.88 + r() * 0.1).toFixed(2);
        s += "<rect x='" + (bx - 1) + "' y='" + (by - 16) + "' width='" + (String(label).length * 6.6 + 8) + "' height='15' rx='3' fill='rgba(74,222,128,.18)'/>";
        s += "<text x='" + (bx + 3) + "' y='" + (by - 5) + "' font-size='10.5' font-family='monospace' fill='#86efac'>" + label + "</text>";
      }
    }
    /* 扫描线 + 暗角 */
    s += "<g opacity='.05' stroke='#fff' stroke-width='1'>";
    for (var k = 0; k < 40; k++) s += "<path d='M0 " + (k * 10) + "h640'/>";
    s += "</g>";
    s += "<rect width='640' height='400' fill='url(#vg)'/>";
    s += "</svg>";
    return enc(s);
  }

  /* ---------- 人脸特征向量（512 维，用于展示 NPU 输出） ---------- */
  function feature(seed, dim) {
    dim = dim || 512;
    var r = U.rng('f' + seed), out = [];
    for (var i = 0; i < dim; i++) {
      var v = 0.5 + (r() - 0.5) * 0.9;
      if (i % 17 === 0) v = Math.min(1, v + 0.28);
      out.push(U.clamp(v, 0, 1));
    }
    return out;
  }

  /* ---------- K1 端侧遥测（CPU 8 核 + NPU） ---------- */
  function telemetry(prev, opts) {
    opts = opts || {};
    var stress = opts.stress || 0;
    var t = Date.now() / 1000;
    var base = 34 + stress * 26;
    var cores = [];
    for (var i = 0; i < 8; i++) {
      var w = Math.sin(t * (0.55 + i * 0.11) + i) * 7 + Math.sin(t * 0.23 + i * 2) * 4;
      cores.push(Math.round(U.clamp(base + w + (prev && prev.cores ? prev.cores[i] * 0.45 - 45 * 0.45 : 0), 6, 97)));
    }
    var avgCpu = Math.round(cores.reduce(function (a, b) { return a + b; }, 0) / 8);
    return {
      cpu: avgCpu,
      cores: cores,
      npu: Math.round(U.clamp(28 + stress * 46 + Math.sin(t * 0.7) * 6, 5, 99)),
      tops: 2.0,
      fps: U.round(U.clamp(24.2 - stress * 5 + Math.sin(t * 1.1) * 1.1, 8, 25), 1),
      decodeMs: U.round(6.4 + stress * 5 + Math.random() * 0.6, 1),
      inferMs: U.round(21.5 + stress * 12 + Math.random() * 1.4, 1),
      matchMs: U.round(5.8 + stress * 2 + Math.random() * 0.5, 1),
      temp: U.round(48.5 + stress * 9 + Math.sin(t * 0.33) * 1.6, 1),
      power: U.round(3.6 + stress * 1.5, 2)
    };
  }

  A.Mock = { avatar: avatar, scene: scene, feature: feature, telemetry: telemetry };
})(window.App);
