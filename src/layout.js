/* ============================================================
 * 鱼骨布局引擎（纯计算，不依赖 DOM）
 * 算法依据 https://www.cnblogs.com/tn666/p/17448043.html ：
 *   ① 先定时间脊与刻度点（骨刺起点）；
 *   ② 固定倾斜角 angle，给定离轴高度 h，
 *      水平位移 = h / tan(angle)  ——即 computeTilt(angle, height)；
 *   ③ 二级节点沿斜线逐层排布，算出每点坐标后连线；
 *   ④ 本实现额外加入「矩形避让」：时间上相邻、空间上相撞的骨刺
 *      逐条向右推开，保证文字 / 骨线 / 图片互不重叠。
 * 支持把长卷拆成若干「卷」（segments），横向更紧凑。
 * ============================================================ */
(function (g) {
  'use strict';

  var T = g.FBText;

  var DEFAULTS = {
    theme: 'xuan',
    segments: 2,        /* 分卷数：1=长卷，2=双脊，3=三脊 */
    angle: 75,          /* 骨刺倾角 */
    pxPerYear: 8,       /* 每年前进基准像素 */
    rowGap: 14,         /* 二级节点行距 */
    colW: 216,          /* 文字列宽 */
    fs: 12,             /* 正文 */
    titleFs: 15,        /* 标题 */
    yearFs: 10,         /* 纪年 */
    lh: 1.62,           /* 行高倍数 */
    rib: 13,            /* 骨刺到文字的横向引线长 */
    axisGap: 36,        /* 脊线到首行文字的距离 */
    gapX: 26,           /* 相邻骨刺最小横向净距 */
    maxBullets: 2,
    bulletLines: 2,
    titleLines: 2,
    imgW: 150,
    imgH: 92,
    showBullets: true,
    showImgSlot: false,
    showEraBands: true,
    padLeft: 104,
    padRight: 168,
    headerH: 168,
    segLabelH: 34
  };

  function tilt(angle, h) {
    return Math.round(h / Math.tan(Math.PI * angle / 180));
  }

  function assign(t) {
    var out = {};
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i] || {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
    }
    return out;
  }

  /* ---------- 内容行 ---------- */
  function buildRows(ev, o, ov, withImg) {
    var title = (ov && ov.title) || ev.title;
    var points = ((ov && ov.points) || ev.points || []).slice(0, o.showBullets ? o.maxBullets : 0);
    var rows = [];

    var ytxt = ev.era + '  ' + ev.y;
    rows.push({
      kind: 'year', text: ytxt, lines: [ytxt], fs: o.yearFs, bold: true,
      rh: o.yearFs * o.lh + 5, w: T.measure(ytxt, o.yearFs, true)
    });

    var tl = T.wrapClamp(title, o.colW, o.titleFs, true, o.titleLines);
    var tw = 0;
    tl.forEach(function (l) { tw = Math.max(tw, T.measure(l, o.titleFs, true)); });
    rows.push({
      kind: 'title', lines: tl, fs: o.titleFs, bold: true,
      rh: tl.length * o.titleFs * o.lh + 5, w: tw
    });

    points.forEach(function (p) {
      var ll = T.wrapClamp(p, o.colW - 12, o.fs, false, o.bulletLines);
      var ww = 0;
      ll.forEach(function (l) { ww = Math.max(ww, T.measure(l, o.fs, false)); });
      rows.push({
        kind: 'bullet', lines: ll, fs: o.fs, bold: false,
        rh: ll.length * o.fs * o.lh + 3, w: ww + 12
      });
    });

    if (withImg) rows.push({ kind: 'image', lines: [], fs: 0, bold: false, rh: o.imgH, w: o.imgW });
    return rows;
  }

  /* ---------- 单卷排布 ---------- */
  function layoutSegment(evs, o, theme, over, images) {
    var minY = evs[0].y, maxY = evs[evs.length - 1].y;

    var items = evs.map(function (ev, idx) {
      var img = (images && images[ev.id]) || null;
      var rows = buildRows(ev, o, over[ev.id], !!img || o.showImgSlot);
      var ch = 0;
      rows.forEach(function (r, i) { ch += r.rh + (i ? o.rowGap : 0); });
      return { ev: ev, idx: idx, rows: rows, ch: ch, img: img,
               side: idx % 2 === 0 ? 'up' : 'down' };
    });

    items.forEach(function (it) {
      var d = o.axisGap;
      it.rows.forEach(function (r) {
        r.d = d + r.rh / 2;
        d += r.rh + o.rowGap;
      });
      var last = it.rows[it.rows.length - 1];
      it.htop = last.d + last.rh / 2;
      it.dTop = tilt(o.angle, it.htop);
      it.relX = it.dTop + o.rib;
      it.colW = 0;
      it.rows.forEach(function (r) { it.colW = Math.max(it.colW, r.w); });

      var bx = [];
      it.rows.forEach(function (r) {
        bx.push({ rx: it.relX - 3, d: r.d, w: r.w + 6, h: r.rh });
      });
      it.rows.forEach(function (r) {
        var dx = tilt(o.angle, r.d);
        bx.push({ rx: dx, d: r.d, w: Math.max(3, it.relX - dx), h: 6 });
      });
      for (var t = 0; t <= it.htop; t += 12) {
        bx.push({ rx: tilt(o.angle, t) - 1.8, d: t, w: 3.6, h: 13 });
      }
      it.boxes = bx;
    });

    /* 弹性放置：上下两翼各自按时间顺序向右推挤（d 为离轴距离，两翼镜像互不干扰） */
    function placeSide(list) {
      var placed = [];
      list.forEach(function (it) {
        var x = o.padLeft + (it.ev.y - minY) * o.pxPerYear;
        for (var p = 0; p < placed.length; p++) {
          var pa = placed[p].abs;
          for (var bi = 0; bi < pa.length; bi++) {
            var b = pa[bi];
            for (var ai = 0; ai < it.boxes.length; ai++) {
              var a = it.boxes[ai];
              if (a.d - a.h / 2 > b.d1 || a.d + a.h / 2 < b.d0) continue;
              var need = b.x2 + o.gapX - a.rx;
              if (need > x) x = need;
            }
          }
        }
        it.x = Math.ceil(x);
        it.abs = it.boxes.map(function (b) {
          var x1 = it.x + b.rx;
          return { x1: x1, x2: x1 + b.w, d0: b.d - b.h / 2, d1: b.d + b.h / 2 };
        });
        placed.push(it);
      });
    }
    placeSide(items.filter(function (it) { return it.side === 'up'; }));
    placeSide(items.filter(function (it) { return it.side === 'down'; }));

    var upH = 0, downH = 0, right = 0;
    items.forEach(function (it) {
      var ext = it.htop + 30;
      if (it.side === 'up') upH = Math.max(upH, ext); else downH = Math.max(downH, ext);
      right = Math.max(right, it.x + it.relX + it.colW);
    });

    return { items: items, minY: minY, maxY: maxY, upH: upH, downH: downH, right: right };
  }

  /* ---------- 主构建 ---------- */
  function build(userOpts) {
    var data = g.FB_DATA;
    var o = assign({}, DEFAULTS, userOpts || {});
    o.segments = Math.max(1, Math.min(4, Math.round(o.segments)));
    var theme = data.themes[o.theme] || data.themes.xuan;
    var over = o.overrides || {};
    var images = o.images || {};

    var evs = data.events.filter(function (e) { return e.on !== false; })
      .slice().sort(function (a, b) { return a.y - b.y; });

    var per = Math.ceil(evs.length / o.segments);
    var groups = [];
    for (var i = 0; i < o.segments; i++) {
      var grp = evs.slice(i * per, (i + 1) * per);
      if (grp.length) groups.push(grp);
    }

    var segs = groups.map(function (grp) { return layoutSegment(grp, o, theme, over, images); });

    var width = Math.ceil(Math.max.apply(null, segs.map(function (s) { return s.right; })) + o.padRight);
    if (!isFinite(width) || width < 800) width = 800;

    /* 纵向排布 */
    var cursor = o.headerH;
    var scene = {
      o: o, theme: theme, width: width, height: 0,
      headerH: o.headerH, segments: [], pads: { left: o.padLeft, right: o.padRight },
      title: data.title, subtitle: data.subtitle, note: data.note,
      tags: data.tags.map(function (t) { return { name: t, color: theme.tags[t] }; }),
      total: evs.length
    };

    var cn = ['一', '二', '三', '四'];
    segs.forEach(function (seg, si) {
      var labelY = cursor + 16;
      var axisY = cursor + o.segLabelH + seg.upH;
      cursor = axisY + seg.downH + 34;

      var out = {
        idx: si, name: '卷' + cn[si],
        from: seg.minY, to: seg.maxY, axisY: axisY,
        top: axisY - seg.upH - o.segLabelH, bottom: axisY + seg.downH + 26,
        labelY: labelY, events: [], bands: []
      };

      seg.items.forEach(function (it) {
        var sign = it.side === 'up' ? -1 : 1, ev = it.ev;
        var color = theme.tags[ev.tag] || theme.accent;
        var rowsOut = it.rows.map(function (r) {
          return {
            kind: r.kind, lines: r.lines, text: r.text, fs: r.fs, bold: r.bold,
            x: it.x + it.relX, y: axisY + sign * r.d - r.rh / 2,
            w: r.w, h: r.rh, d: r.d
          };
        });
        var firstTop = Math.min.apply(null, rowsOut.map(function (r) { return r.y; }));
        var lastBot = Math.max.apply(null, rowsOut.map(function (r) { return r.y + r.h; }));

        out.events.push({
          id: ev.id, tag: ev.tag, color: color, side: it.side, sign: sign,
          year: ev.y, era: ev.era,
          title: (over[ev.id] && over[ev.id].title) || ev.title,
          points: (over[ev.id] && over[ev.id].points) || ev.points,
          src: ev.src, more: ev.more, seg: si,
          x: it.x, anchorY: axisY,
          bone: { x1: it.x, y1: axisY, x2: it.x + it.dTop, y2: axisY + sign * it.htop },
          ribs: it.rows.map(function (r) {
            var d = tilt(o.angle, r.d);
            return { x1: it.x + d, y1: axisY + sign * r.d, x2: it.x + it.relX, y2: axisY + sign * r.d };
          }),
          nodes: it.rows.map(function (r) {
            var d = tilt(o.angle, r.d);
            return { x: it.x + d, y: axisY + sign * r.d };
          }),
          rows: rowsOut,
          img: it.img ? { x: it.x + it.relX, w: o.imgW, h: o.imgH, data: it.img } : null,
          hit: {
            x: it.x + it.relX - 9, y: firstTop - 8,
            w: it.colW + 18, h: lastBot - firstTop + 16
          }
        });
      });

      /* 年代带：以该卷内各朝首个锚点为界，铺满整幅宽度 */
      var st = [];
      data.eras.forEach(function (era) {
        var first = null;
        out.events.forEach(function (e) {
          if (e.year >= era.from && e.year <= era.to && (!first || e.x < first.x)) first = e;
        });
        if (first) st.push({ era: era, x: first.x });
      });
      st.forEach(function (s, i) {
        var x1 = i === 0 ? 0 : s.x - 20;
        var x2 = i === st.length - 1 ? width : st[i + 1].x - 20;
        if (x2 <= x1) x2 = x1 + 80;
        out.bands.push({
          name: s.era.full, short: s.era.name, span: s.era.span,
          x1: x1, x2: x2, color: theme.eraTint[i % theme.eraTint.length]
        });
      });

      scene.segments.push(out);
    });

    scene.height = Math.ceil(cursor + 34);
    scene.width = width;
    scene.footerY = cursor + 6;
    scene.stats = { events: evs.length, segments: scene.segments.length };
    return scene;
  }

  /* ---------- 自检：文字盒是否互撞 ---------- */
  function audit(scene) {
    var boxes = [];
    scene.segments.forEach(function (seg) {
      seg.events.forEach(function (e) {
        e.rows.forEach(function (r) {
          if (r.kind === 'image') return;
          boxes.push({ id: e.id + '/' + r.kind, x1: r.x - 1, x2: r.x + r.w + 1, y1: r.y, y2: r.y + r.h });
        });
      });
    });
    var out = [];
    for (var i = 0; i < boxes.length; i++) {
      for (var j = i + 1; j < boxes.length; j++) {
        var a = boxes[i], b = boxes[j];
        if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) out.push([a.id, b.id]);
      }
    }
    return out;
  }

  g.FBLayout = { build: build, tilt: tilt, DEFAULTS: DEFAULTS, audit: audit };
})(typeof window !== 'undefined' ? window : globalThis);