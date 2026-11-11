/* 导出静态 SVG（与网页端使用完全相同的布局与渲染代码） */
const fs = require('fs');
const path = require('path');
const { loadContext } = require('./load');

const ctx = loadContext();
const L = ctx.FBLayout;
const R = ctx.FBRender;

const outDir = path.join(__dirname, '..');
const presets = [
  { file: '明朝卫所与海防鱼骨纪事表.svg', opts: { theme: 'xuan', segments: 2 } },
  { file: '明朝卫所与海防鱼骨纪事表-长卷.svg', opts: { theme: 'xuan', segments: 1 } },
  { file: '明朝卫所与海防鱼骨纪事表-墨夜.svg', opts: { theme: 'moye', segments: 2 } },
];

for (const p of presets) {
  const scene = L.build(p.opts);
  const svg = R.render(scene, { standalone: true });
  const out = path.join(outDir, p.file);
  fs.writeFileSync(out, svg, 'utf8');
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`✓ ${p.file}  ${scene.width}×${scene.height}  ${kb} KB`);
}