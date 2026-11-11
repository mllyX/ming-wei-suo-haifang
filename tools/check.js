/* 布局自检：尺寸、骨刺数、文字重叠、越界 */
const { loadContext } = require('./load');

const ctx = loadContext();
const L = ctx.FBLayout;

const variants = [
  { name: '默认(双脊)', opts: { segments: 2 } },
  { name: '长卷', opts: { segments: 1 } },
  { name: '三脊', opts: { segments: 3 } },
  { name: '倾角60', opts: { segments: 2, angle: 60 } },
  { name: '倾角85', opts: { segments: 2, angle: 85 } },
  { name: '加图占位', opts: { segments: 2, showImgSlot: true } },
  { name: '隐藏要点', opts: { segments: 2, showBullets: false } },
  { name: '大字号', opts: { segments: 2, fs: 15, titleFs: 18, colW: 250 } },
];

let bad = 0;
for (const v of variants) {
  const t0 = Date.now();
  const scene = L.build(v.opts);
  const ms = Date.now() - t0;
  const issues = L.audit(scene);
  // 越界检查
  let oob = 0;
  scene.segments.forEach((seg) =>
    seg.events.forEach((e) =>
      e.rows.forEach((r) => {
        if (r.x < 0 || r.x + r.w > scene.width || r.y < 0 || r.y + r.h > scene.height) oob++;
      })
    )
  );
  const ok = issues.length === 0 && oob === 0;
  if (!ok) bad++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${v.name.padEnd(10)} ${String(scene.width).padStart(5)}×${String(scene.height).padStart(4)}` +
      `  事件${scene.stats.events}  重叠${issues.length}  越界${oob}  ${ms}ms`
  );
  if (issues.length) console.log('   重叠示例:', JSON.stringify(issues.slice(0, 6)));
}
console.log(bad === 0 ? '\n全部通过' : `\n${bad} 组未通过`);