/* 载入前端脚本到 Node（同一份源码，保证 HTML 与导出 SVG 完全一致） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadContext() {
  const ctx = { console, Math, Date, JSON, Object, Array, String, isFinite, parseInt, parseFloat };
  ctx.globalThis = ctx;
  ctx.window = undefined;
  vm.createContext(ctx);
  const files = ['data.js', 'measure.js', 'layout.js', 'render.js'];
  for (const f of files) {
    const p = path.join(__dirname, '..', 'src', f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

module.exports = { loadContext };