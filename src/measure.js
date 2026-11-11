/* ============================================================
 * 文本度量：无需 DOM 的确定性字宽估算
 * CJK 全角 = 1em；拉丁按字形近似；再乘安全系数，保证排版不溢出。
 * ============================================================ */
(function (g) {
  'use strict';

  var WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u2014\u2018-\u201F\u2026\u00B7\u3000-\u3003\u3008-\u3011]/;
  var NARROW = /[ijlI.,;:'"!|`\[\]()\{\}\/\\]/;
  var WIDE_UP = /[MWmw@%&]/;
  var DIGIT = /[0-9]/;
  var UPPER = /[A-Z]/;

  function charWidth(ch, fs, bold) {
    var w;
    if (ch === ' ' || ch === '\t' || ch === '\n') w = 0.30;
    else if (WIDE.test(ch)) w = 1.0;
    else if (NARROW.test(ch)) w = 0.32;
    else if (WIDE_UP.test(ch)) w = 0.84;
    else if (DIGIT.test(ch) || UPPER.test(ch)) w = 0.62;
    else w = 0.54;
    return w * fs * (bold ? 1.05 : 1.0);
  }

  function measure(str, fs, bold) {
    if (!str) return 0;
    var sum = 0;
    for (var i = 0; i < str.length; i++) sum += charWidth(str.charAt(i), fs, bold);
    return Math.ceil(sum * 1.02); /* 安全余量 */
  }

  /* 折行：中文逐字可断，拉丁按词优先；返回行数组 */
  function wrap(str, maxW, fs, bold) {
    var out = [];
    if (!str) return [''];
    var cur = '', w = 0, word = '';
    function flushWord() {
      if (!word) return;
      var ww = measure(word, fs, bold);
      if (w + ww > maxW && cur) { out.push(cur); cur = ''; w = 0; }
      cur += word; w += ww; word = '';
    }
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (/[A-Za-z0-9'’\-]/.test(ch)) { word += ch; continue; }
      flushWord();
      var cw = charWidth(ch, fs, bold);
      if (w + cw > maxW && cur) { out.push(cur); cur = ''; w = 0; }
      if (!cur && /[ \u3000]/.test(ch)) continue; /* 行首去空格 */
      cur += ch; w += cw;
      if (/[，。；：、！？）」』”]/.test(ch) && w > maxW * 0.72) { out.push(cur); cur = ''; w = 0; }
    }
    flushWord();
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  /* 折行并限行，末行加省略号 */
  function wrapClamp(str, maxW, fs, bold, maxLines) {
    var lines = wrap(str, maxW, fs, bold);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      var out = '';
      for (var i = 0; i < last.length; i++) {
        if (measure(out + last.charAt(i) + '…', fs, bold) > maxW) break;
        out += last.charAt(i);
      }
      lines[maxLines - 1] = out + '…';
    }
    return lines;
  }

  g.FBText = { measure: measure, wrap: wrap, wrapClamp: wrapClamp };
})(typeof window !== 'undefined' ? window : globalThis);