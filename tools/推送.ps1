# ============================================================
# 一键把本项目推到你的 Git 仓库（GitHub / Gitee / GitLab 均可）
#   · 令牌只在本进程内存中使用，推送后会把 remote 还原成不含令牌的地址
#   · 运行：右键“使用 PowerShell 运行”，或在终端里 .\推送.ps1
# ============================================================
param(
  [string]$Url = '',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$git = 'C:\Users\xing\dsh-tools\PortableGit\cmd\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }

Set-Location (Split-Path $PSScriptRoot -Parent)   # 回到仓库根目录
if (-not (Test-Path '.git')) { throw '这里不是 git 仓库根目录' }

Write-Host "当前分支：" -NoNewline; & $git rev-parse --abbrev-ref HEAD

if (-not $Url) {
  Write-Host ''
  Write-Host '示例：' -ForegroundColor DarkGray
  Write-Host '  https://github.com/你的用户名/ming-haifang.git' -ForegroundColor DarkGray
  Write-Host '  git@gitee.com:你的用户名/ming-haifang.git' -ForegroundColor DarkGray
  $Url = Read-Host '粘贴仓库地址'
}
if (-not $Url) { throw '没有提供仓库地址' }

if ($Url -match '^https?://') {
  $user = Read-Host '你的用户名（GitHub/Gitee 登录名）'
  $sec  = Read-Host "访问令牌（不会显示，也不会存进 .git/config）" -AsSecureString
  $tok  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if (-not $tok) { throw '没有提供令牌' }

  # 临时把凭据塞进 remote，推送后立刻还原
  $auth = $Url -replace '^https?://', "https://${user}:${tok}@"
  & $git remote remove origin 2>$null
  & $git remote add origin $auth
  try {
    & $git push -u origin "${Branch}:${Branch}"
    if ($LASTEXITCODE -ne 0) { throw "推送失败（退出码 $LASTEXITCODE）。请检查：仓库是否已在网页端创建、令牌是否有 repo 权限、分支名是否为 $Branch" }
  } finally {
    & $git remote set-url origin $Url
  }
} else {
  & $git remote remove origin 2>$null
  & $git remote add origin $Url
  & $git push -u origin "${Branch}:${Branch}"
  if ($LASTEXITCODE -ne 0) { throw "推送失败（退出码 $LASTEXITCODE）。SSH 方式需要先配置好公钥。" }
}

Write-Host ''
Write-Host '✔ 推送完成' -ForegroundColor Green
& $git remote -v
$clean = $Url -replace '\.git$', ''
Write-Host ''
Write-Host "仓库网页：$clean" -ForegroundColor Cyan
Write-Host "直接看图：$clean/blob/$Branch/index.html" -ForegroundColor Cyan