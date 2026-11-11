/* 通过 GitHub Git Data API 推送（绕过 github.com:443 的 git 传输，只走 api.github.com）
 * 目标：用与本地完全相同的 blob/tree/commit 元数据，使远端提交 SHA 与本地一致。
 * 用法：node tools/push-api.js <owner> <repo>
 *   令牌从环境变量 GITHUB_TOKEN 读取。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OWNER = process.argv[2];
const REPO = process.argv[3];
const TOKEN = process.env.GITHUB_TOKEN;
const ROOT = path.join(__dirname, '..');

if (!OWNER || !REPO || !TOKEN) {
  console.error('用法: GITHUB_TOKEN=... node tools/push-api.js <owner> <repo>');
  process.exit(2);
}

const API = 'https://api.github.com';
const GIT = 'C:\\Users\\xing\\dsh-tools\\PortableGit\\cmd\\git.exe';
const git = (...args) => execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8' });
const gitBuf = (...args) => execFileSync(GIT, args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

async function call(method, url, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(API + url, {
        method,
        headers: {
          Authorization: `token ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'dsh',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      const retryable = /fetch failed|ECONN|ETIMEDOUT|socket|409|502|503|504|rate limit/i.test(String(e.message));
      if (i === tries - 1 || !retryable) throw e;
      const wait = 800 * (i + 1) * (i + 1);
      console.log(`   ↻ 重试 (${e.message.slice(0, 60)}) ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

(async () => {
  const headSha = git('rev-parse', 'HEAD').trim();
  const treeSha = git('rev-parse', 'HEAD^{tree}').trim();
  const message = git('log', '-1', '--format=%B').replace(/\s+$/, '');
  const authorIso = git('log', '-1', '--format=%aI').trim();
  const committerIso = git('log', '-1', '--format=%cI').trim();
  const authorName = git('log', '-1', '--format=%an').trim();
  const authorEmail = git('log', '-1', '--format=%ae').trim();

  console.log(`本地 HEAD ${headSha}`);
  console.log(`本地 tree ${treeSha}`);
  console.log(`作者 ${authorName} <${authorEmail}> ${authorIso}`);

  // 0) 空仓库无法调用 blob API，先用 Contents API 打一个临时引导提交
  let parentSha = null;
  try {
    const cur = await call('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    parentSha = cur.object.sha;
    console.log(`远端 main 当前指向 ${parentSha}`);
  } catch (e) {
    console.log('仓库为空，写入引导提交…');
    await call('PUT', `/repos/${OWNER}/${REPO}/contents/.bootstrap`, {
      message: 'chore: bootstrap',
      content: Buffer.from('bootstrap\n').toString('base64'),
    });
    try {
      const cur = await call('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
      parentSha = cur.object.sha;
    } catch {}
  }

  // 1) 文件清单（path -> blob sha）
  const ls = git('ls-tree', '-r', 'HEAD').trim().split('\n');
  const entries = ls.map((line) => {
    const m = line.match(/^(\d+) blob ([0-9a-f]{40})\t(.+)$/);
    return { mode: m[1], sha: m[2], file: m[3] };
  });
  console.log(`文件 ${entries.length} 个`);

  // 2) 逐个上传 blob
  const treeItems = [];
  for (const e of entries) {
    const buf = gitBuf('cat-file', 'blob', e.sha); /* 直接取 Git 对象字节，避免工作区 CRLF 差异 */
    const r = await call('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    if (r.sha !== e.sha) console.log(`   ⚠ blob 不一致 ${e.file}: ${r.sha} ≠ ${e.sha}`);
    treeItems.push({ path: e.file, mode: e.mode, type: 'blob', sha: r.sha });
    process.stdout.write('.');
  }
  console.log('');

  // 3) 建树
  const tree = await call('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeItems });
  console.log(`远端 tree ${tree.sha} ${tree.sha === treeSha ? '（与本地一致 ✓）' : '（≠ 本地 ' + treeSha + '）'}`);

  // 4) 建提交；对比 SHA，必要时尝试补尾换行
  const ident = { name: authorName, email: authorEmail };
  const localParent = (git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(/\s+/)[1]) || null;
  const parents = parentSha && parentSha === localParent ? [parentSha] : parentSha && !localParent ? [] : [parentSha];
  console.log(`父提交 ${parents.length ? parents[0] : '（无，根提交）'}`);
  let commit = null;
  for (const msg of [message, message + '\n']) {
    commit = await call('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
      message: msg,
      tree: tree.sha,
      parents,
      author: { ...ident, date: authorIso },
      committer: { ...ident, date: committerIso },
    });
    if (commit.sha === headSha) break;
  }
  console.log(`远端 commit ${commit.sha} ${commit.sha === headSha ? '（与本地一致 ✓）' : '（≠ 本地，SHA 仅反映内容与元数据差异）'}`);

  // 5) 指向该提交（可能是非快进，强制更新）
  await call('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
  console.log('分支 main 已指向该提交');

  // 6) 复核
  const check = await call('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  console.log(`复核 refs/heads/main = ${check.object.sha}  ${check.object.sha === headSha ? '✓ 与本地完全一致' : ''}`);
})().catch((e) => {
  console.error('✗ 失败:', e.message);
  process.exit(1);
});