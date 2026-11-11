/* ============================================================
 * SVG 渲染器：把布局场景序列化为 SVG 字符串
 * 浏览器内直接注入 DOM；Node 端导出静态 .svg 文件。
 * ============================================================ */
(function (g) {
  'use strict';

  var T = g.FBText;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function n(v) { return Math.round(v * 100) / 100; }

  /* 文本行基线：行块垂直居中 */
  function baselines(row) {
    var lines = row.lines || [];
    var lh = row.h / Math.max(1, lines.length);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      out.push({ text: lines[i], y: row.y + i * lh + lh / 2 + row.fs * 0.35, x: row.x });
    }
    return out;
  }

  function render(scene, opts) {
    opts = opts || {};
    var o = scene.o, th = scene.theme;
    var W = scene.width, H = scene.height;
    var S = [];
    var defs = [];
    var uid = 0;

    S.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'font-family="' + th.font.replace(/"/g, "'") + '" ' +
      'class="fb-svg" role="img" aria-label="' + esc(scene.title) + '">');

    /* ---------- 样式 ---------- */
    S.push('<style>' +
      '.fb-svg text{font-family:' + th.font + ';}' +
      '.fb-svg .sans{font-family:' + th.fontSans + ';}' +
      '.ev .ev-hit{fill:#000;fill-opacity:0;pointer-events:all;}' +
      '.ev:hover .ev-hit{fill-opacity:.045;}' +
      '.ev:hover .ev-bone{stroke-width:2.2;}' +
      '</style>');

    /* ---------- defs ---------- */
    defs.push('<radialGradient id="paper" cx="30%" cy="12%" r="95%">' +
      '<stop offset="0" stop-color="' + th.bg + '"/><stop offset="1" stop-color="' + th.bg2 + '"/></radialGradient>');
    defs.push('<linearGradient id="axisGrad" x1="0" x2="1"><stop offset="0" stop-color="' + th.line + '"/>' +
      '<stop offset="1" stop-color="' + th.ink2 + '"/></linearGradient>');
    defs.push('<filter id="soft" x="-20%" y="-20%" width="140%" height="140%">' +
      '<feDropShadow dx="0" dy="1.5" stdDeviation="2.2" flood-color="' + th.ink + '" flood-opacity="0.18"/></filter>');

    var clipIds = {};

    S.push('<defs>' + defs.join('') + '</defs>');

    /* ---------- 背景 ---------- */
    S.push('<rect width="' + W + '" height="' + H + '" fill="url(#paper)"/>');

    /* ---------- 卷 / 年代带 / 脊线 / 骨刺 ---------- */
    var body = [];

    scene.segments.forEach(function (seg) {
      /* 年代带 */
      seg.bands.forEach(function (b) {
        body.push('<rect x="' + n(b.x1) + '" y="' + n(seg.labelY - 6) + '" width="' + n(b.x2 - b.x1) +
          '" height="' + n(seg.bottom - seg.labelY + 6) + '" fill="' + b.color + '" fill-opacity="0.055"/>');
        if (b.x1 > 2) {
          body.push('<line x1="' + n(b.x1) + '" y1="' + n(seg.labelY - 6) + '" x2="' + n(b.x1) + '" y2="' + n(seg.bottom + 4) +
            '" stroke="' + b.color + '" stroke-opacity="0.18" stroke-width="1" stroke-dasharray="2 6"/>');
        }
        /* 年代名（放不下就退化为简称） */
        var bw = b.x2 - b.x1 - 24;
        var label = b.short + ' · ' + (b.name || '').split(' · ')[1] + '  ' + b.span;
        var fs = 11.5;
        if (T.measure(label, fs, false) + 4 > bw) label = b.short + '  ' + b.span;
        if (T.measure(label, fs, false) + 4 > bw) label = b.short;
        if (bw > 46) {
          body.push('<text x="' + n(b.x1 + 12) + '" y="' + n(seg.labelY + 10) + '" font-size="' + fs +
            '" fill="' + b.color + '" fill-opacity="0.88" letter-spacing="1.2" class="sans">' + esc(label) + '</text>');
        }
      });

      /* 卷标 */
      body.push('<rect x="26" y="' + n(seg.axisY - 15) + '" width="54" height="30" rx="6" fill="' + th.ink +
        '" fill-opacity="0.07"/>');
      body.push('<text x="53" y="' + n(seg.axisY + 4.5) + '" font-size="12.5" text-anchor="middle" fill="' + th.ink +
        '" letter-spacing="1" class="sans">' + esc(seg.name) + '</text>');
      body.push('<text x="53" y="' + n(seg.axisY + 27) + '" font-size="9.5" text-anchor="middle" fill="' + th.ink3 +
        '" class="sans">' + seg.from + '—' + seg.to + '</text>');

      /* 脊线 */
      var ax1 = o.padLeft + 2, ax2 = W - o.padRight + 52;
      body.push('<line x1="' + n(ax1) + '" y1="' + n(seg.axisY) + '" x2="' + n(ax2) + '" y2="' + n(seg.axisY) +
        '" stroke="' + th.ink + '" stroke-opacity="0.10" stroke-width="9" stroke-linecap="round"/>');
      body.push('<line x1="' + n(ax1) + '" y1="' + n(seg.axisY) + '" x2="' + n(ax2) + '" y2="' + n(seg.axisY) +
        '" stroke="' + th.ink2 + '" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>');
      /* 脊端：鱼尾 */
      body.push('<path d="M' + n(ax2) + ' ' + n(seg.axisY) + ' l14 -9 l-5 9 l5 9 z" fill="' + th.ink2 + '" fill-opacity="0.45"/>');

      /* 骨刺 + 文字 */
      seg.events.forEach(function (e) {
        var gid = 'ev-' + e.id;
        body.push('<g class="ev" data-id="' + e.id + '" data-tag="' + esc(e.tag) + '">');
        body.push('<rect class="ev-hit" x="' + n(e.hit.x) + '" y="' + n(e.hit.y) + '" width="' + n(e.hit.w) +
          '" height="' + n(e.hit.h) + '" rx="4"/>');

        /* 一级骨刺（斜线） */
        body.push('<line class="ev-bone" x1="' + n(e.bone.x1) + '" y1="' + n(e.bone.y1) + '" x2="' + n(e.bone.x2) +
          '" y2="' + n(e.bone.y2) + '" stroke="' + e.color + '" stroke-opacity="0.62" stroke-width="1.5" stroke-linecap="round"/>');
        /* 引线 */
        e.ribs.forEach(function (r) {
          body.push('<line x1="' + n(r.x1) + '" y1="' + n(r.y1) + '" x2="' + n(r.x2) + '" y2="' + n(r.y2) +
            '" stroke="' + e.color + '" stroke-opacity="0.34" stroke-width="1"/>');
        });
        /* 脊上刻度 */
        body.push('<circle cx="' + n(e.bone.x1) + '" cy="' + n(e.bone.y1) + '" r="4.6" fill="' + th.bg + '"/>');
        body.push('<circle cx="' + n(e.bone.x1) + '" cy="' + n(e.bone.y1) + '" r="2.7" fill="' + e.color + '"/>');
        /* 节点 */
        e.nodes.forEach(function (nd) {
          body.push('<circle cx="' + n(nd.x) + '" cy="' + n(nd.y) + '" r="2" fill="' + e.color + '" fill-opacity="0.85"/>');
        });

        /* 各行文字 */
        var imgRow = null;
        e.rows.forEach(function (r) {
          if (r.kind === 'image') { imgRow = r; return; }
          if (r.kind === 'year') {
            body.push('<text x="' + n(r.x) + '" y="' + n(r.y + r.h / 2 + r.fs * 0.35) + '" font-size="' + r.fs +
              '" fill="' + e.color + '" letter-spacing="1.4" class="sans" fill-opacity="0.95">' +
              esc((r.lines && r.lines[0]) || '') + '</text>');
            return;
          }
          if (r.kind === 'title') {
            var bl = baselines(r);
            /* 左侧色条 */
            body.push('<rect x="' + n(r.x - 10) + '" y="' + n(r.y + 2) + '" width="2.8" height="' + n(r.h - 4) +
              '" rx="1.4" fill="' + e.color + '" fill-opacity="0.9"/>');
            bl.forEach(function (b) {
              body.push('<text class="ev-title" x="' + n(b.x) + '" y="' + n(b.y) + '" font-size="' + r.fs +
                '" font-weight="600" fill="' + th.ink + '">' + esc(b.text) + '</text>');
            });
            return;
          }
          if (r.kind === 'bullet') {
            var bl2 = baselines(r);
            body.push('<rect x="' + n(r.x - 1) + '" y="' + n(bl2[0].y - 4.6) + '" width="4" height="4" rx="1" fill="' +
              e.color + '" fill-opacity="0.55"/>');
            bl2.forEach(function (b) {
              body.push('<text x="' + n(b.x + 9) + '" y="' + n(b.y) + '" font-size="' + r.fs + '" fill="' + th.ink2 +
                '" fill-opacity="0.94">' + esc(b.text) + '</text>');
            });
          }
        });

        /* 图片位 */
        if (imgRow) {
          var ix = imgRow.x, iy = imgRow.y, iw = o.imgW, ih = o.imgH;
          if (e.img) {
            var cid = 'clip-' + (uid++);
            S.push('<defs><clipPath id="' + cid + '"><rect x="' + n(ix) + '" y="' + n(iy) + '" width="' + iw +
              '" height="' + ih + '" rx="4"/></clipPath></defs>');
            body.push('<rect x="' + n(ix) + '" y="' + n(iy) + '" width="' + iw + '" height="' + ih + '" rx="4" fill="' +
              th.card + '" stroke="' + e.color + '" stroke-opacity="0.35" stroke-width="1"/>');
            body.push('<image x="' + n(ix) + '" y="' + n(iy) + '" width="' + iw + '" height="' + ih +
              '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + cid + ')" xlink:href="' + e.img.data + '" href="' + e.img.data + '"/>');
            body.push('<rect x="' + n(ix) + '" y="' + n(iy) + '" width="' + iw + '" height="' + ih +
              '" rx="4" fill="none" stroke="' + e.color + '" stroke-opacity="0.45" stroke-width="1"/>');
          } else {
            body.push('<rect x="' + n(ix) + '" y="' + n(iy) + '" width="' + iw + '" height="' + ih +
              '" rx="4" fill="none" stroke="' + e.color + '" stroke-opacity="0.30" stroke-width="1" stroke-dasharray="4 4"/>');
            body.push('<text x="' + n(ix + iw / 2) + '" y="' + n(iy + ih / 2 + 4) + '" font-size="11" text-anchor="middle" fill="' +
              th.ink3 + '" fill-opacity="0.75" class="sans">＋ 图</text>');
          }
        }

        body.push('</g>');
      });
    });

    S.push(body.join(''));

    /* ---------- 页首 ---------- */
    var x0 = 56;
    var head = [];
    head.push('<text x="' + x0 + '" y="78" font-size="37" font-weight="700" fill="' + th.ink +
      '" letter-spacing="4">' + esc(scene.title) + '</text>');
    var tw = T.measure(scene.title, 37, true) + 3 * 8;
    head.push('<rect x="' + x0 + '" y="92" width="96" height="3" rx="1.5" fill="' + th.accent + '"/>');
    /* 印章 */
    var sx = x0 + tw + 26;
    head.push('<g transform="rotate(-3.5 ' + (sx + 22) + ' 66)" filter="url(#soft)">' +
      '<rect x="' + sx + '" y="44" width="44" height="44" rx="4" fill="' + th.seal + '" fill-opacity="0.92"/>' +
      '<text x="' + (sx + 22) + '" y="77" font-size="27" text-anchor="middle" fill="' + th.bg + '">明</text></g>');

    head.push('<text x="' + x0 + '" y="118" font-size="12.5" fill="' + th.ink2 + '" letter-spacing="2.6" class="sans">' +
      esc(scene.subtitle) + '</text>');

    /* 图例（右对齐） */
    var legendW = 0;
    scene.tags.forEach(function (t, i) {
      legendW += 13 + T.measure(t.name, 11.5, false) + (i ? 24 : 0);
    });
    var lx = W - 56 - legendW, ly = 96;
    scene.tags.forEach(function (t) {
      head.push('<rect x="' + lx + '" y="' + (ly - 8) + '" width="7" height="7" rx="1.5" transform="rotate(45 ' +
        (lx + 3.5) + ' ' + (ly - 4.5) + ')" fill="' + t.color + '"/>');
      head.push('<text x="' + (lx + 13) + '" y="' + ly + '" font-size="11.5" fill="' + th.ink2 + '" class="sans" letter-spacing="1">' +
        esc(t.name) + '</text>');
      lx += 13 + T.measure(t.name, 11.5, false) + 24;
    });

    /* 算法标注 */
    var angLabel = '骨刺倾角 ' + o.angle + '° ｜ 水平位移 = 高 / tan' + o.angle + '°';
    head.push('<text x="' + (W - 56) + '" y="124" font-size="10.5" fill="' + th.ink3 +
      '" text-anchor="end" class="sans" letter-spacing="0.8">' + esc(angLabel) + '</text>');
    head.push('<line x1="56" y1="' + (scene.headerH - 10) + '" x2="' + (W - 56) + '" y2="' + (scene.headerH - 10) +
      '" stroke="' + th.line + '" stroke-opacity="0.45" stroke-width="1"/>');

    S.push('<g>' + head.join('') + '</g>');

    /* ---------- 页脚 ---------- */
    var foot = [];
    foot.push('<line x1="' + x0 + '" y1="' + n(scene.footerY - 4) + '" x2="' + n(W - x0) + '" y2="' + n(scene.footerY - 4) +
      '" stroke="' + th.line + '" stroke-opacity="0.55" stroke-width="1"/>');
    foot.push('<text x="' + x0 + '" y="' + n(scene.footerY + 16) + '" font-size="10.5" fill="' + th.ink3 +
      '" class="sans" letter-spacing="0.6">' + esc(scene.note) + '</text>');
    foot.push('<text x="' + n(W - x0) + '" y="' + n(scene.footerY + 16) + '" font-size="10.5" fill="' + th.ink3 +
      '" text-anchor="end" class="sans" letter-spacing="0.6">史料：《明史》志书列传·《明太祖实录》·《东西洋考》等　｜　共 ' +
      scene.stats.events + ' 条</text>');
    S.push('<g>' + foot.join('') + '</g>');

    S.push('</svg>');

    var svg = S.join('\n');
    if (opts.standalone) svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg;
    return svg;
  }

  g.FBRender = { render: render, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);