/* 真实渲染校验：用 Chrome 加载 SVG，以 getBBox() 取出真实字体度量，
 * 检测「文字互撞 / 文字压线 / 出血越界 / 空白过大」等版式问题。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadContext } = require('./load');

const ctx = loadContext();
const L = ctx.FBLayout;
const R = ctx.FBRender;

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const opts = {};
process.argv.slice(2).forEach((a) => {
  const m = a.match(/^([a-zA-Z]+)=(.+)$/);
  if (!m) return;
  const v = m[2];
  opts[m[1]] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : /^(true|false)$/.test(v) ? v === 'true' : v;
});
const scene = L.build(opts);
const svg = R.render(scene, { standalone: false });

const checker = `
<script>
(function(){
  var svg = document.querySelector('svg');
  var W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
  var texts = [].slice.call(svg.querySelectorAll('text'));
  var tb = texts.map(function(t,i){
    var b = t.getBBox();
    return {i:i, x:b.x, y:b.y, w:b.width, h:b.height,
            s:(t.textContent||'').slice(0,30),
            ev:(t.closest && t.closest('.ev') ? t.closest('.ev').getAttribute('data-id') : 'chrome')};
  });
  var ov = [];
  for (var i=0;i<tb.length;i++) for (var j=i+1;j<tb.length;j++){
    var a=tb[i], b=tb[j];
    if (a.x < b.x+b.w-1.2 && b.x < a.x+a.w-1.2 && a.y < b.y+b.h-1.2 && b.y < a.y+a.h-1.2){
      var ix = Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
      var iy = Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
      ov.push({a:a.ev+'|'+a.s, b:b.ev+'|'+b.s, ix:+ix.toFixed(1), iy:+iy.toFixed(1)});
    }
  }
  var oob = tb.filter(function(t){ return t.x < -1 || t.y < -1 || t.x+t.w > W+1 || t.y+t.h > H+1; })
              .map(function(t){ return t.ev+'|'+t.s+' @'+Math.round(t.x)+','+Math.round(t.y); });
  var lines = [].slice.call(svg.querySelectorAll('line'));
  var hit = [];
  lines.forEach(function(l){
    if (l.getAttribute('stroke-width') < 2) return;
    var b = l.getBBox(); if (b.width < 0.2 && b.height < 0.2) return;
    tb.forEach(function(t){
      if (b.x < t.x+t.w-2 && t.x < b.x+b.width+2 && b.y < t.y+t.h-2 && t.y < b.y+b.height+2)
        hit.push({line:'w'+l.getAttribute('stroke-width'), text:t.ev+'|'+t.s});
    });
  });
  var maxW = 0, minX = 1e9;
  tb.forEach(function(t){ maxW = Math.max(maxW, t.x+t.w); minX = Math.min(minX, t.x); });
  var res = {W:W, H:H, texts:tb.length, overlaps:ov, oob:oob, lineHits:hit,
             contentRight:Math.round(maxW), canvasW:W, contentLeft:Math.round(minX)};
  var pre = document.createElement('pre'); pre.id='RESULT';
  pre.textContent = 'BEGIN'+JSON.stringify(res)+'END';
  document.body.appendChild(pre);
})();
<\/script>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#fff;-webkit-font-smoothing:auto}</style></head>
<body>${svg}${checker}</body></html>`;

const tmp = path.join(__dirname, '..', '_verify.html');
fs.writeFileSync(tmp, html, 'utf8');

const url = 'file:///' + tmp.replace(/\\/g, '/');
const dom = execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
  '--run-all-compositor-stages-before-draw', '--virtual-time-budget=3000',
  '--user-data-dir=' + path.join(require('os').tmpdir(), 'chrome-fb-verify'),
  '--window-size=1600,900', '--dump-dom', url,
], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });

const m = dom.match(/<pre id="RESULT">BEGIN([\s\S]*?)END<\/pre>/);
if (!m) { console.error('未取到校验结果'); process.exit(2); }
const res = JSON.parse(m[1]);

console.log(`画布 ${res.W}×${res.H}，文字节点 ${res.texts}`);
console.log(`内容右边界 ${res.contentRight} / 画布 ${res.canvasW}（留白 ${res.canvasW - res.contentRight}px）`);
console.log(`文字互撞 ${res.overlaps.length} 处`);
res.overlaps.slice(0, 10).forEach((o) => console.log(`   ✗ ${o.a}  ⟷  ${o.b}  重叠 ${o.ix}×${o.iy}px`));
console.log(`出血越界 ${res.oob.length} 处`);
res.oob.slice(0, 10).forEach((o) => console.log('   ✗ ' + o));
console.log(`文字压粗线 ${res.lineHits.length} 处`);
res.lineHits.slice(0, 8).forEach((o) => console.log('   ✗ ' + o.line + ' × ' + o.text));