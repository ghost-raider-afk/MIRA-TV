param(
  [Parameter(Mandatory = $true)]
  [string]$ServerOrigin
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Message) {
  Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Download-File([string]$Uri, [string]$OutFile) {
  Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $OutFile
  if (!(Test-Path -LiteralPath $OutFile) -or (Get-Item -LiteralPath $OutFile).Length -lt 1) {
    throw "Download failed: $Uri"
  }
}

function Require-Hash([string]$Path, [string]$Expected) {
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "SHA-256 mismatch for $([IO.Path]::GetFileName($Path))."
  }
}

try {
  $uri = [Uri]$ServerOrigin
  if ($uri.Scheme -notin @('http', 'https')) { throw 'Server origin must use HTTP or HTTPS.' }
  $serverOrigin = $uri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')

  $installRoot = Join-Path $env:LOCALAPPDATA 'MIRA-TV\RenderAgent'
  $runtimeRoot = Join-Path $installRoot 'runtime'
  $nodeHome = Join-Path $runtimeRoot 'node'
  $nodeExe = Join-Path $nodeHome 'node.exe'
  $npmCmd = Join-Path $nodeHome 'npm.cmd'
  $binRoot = Join-Path $runtimeRoot 'bin'
  $ffmpegExe = Join-Path $binRoot 'ffmpeg.exe'
  $agentFile = Join-Path $installRoot 'agent.js'
  $configFile = Join-Path $installRoot 'config.json'
  $startScript = Join-Path $installRoot 'start-agent.ps1'
  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('mira-render-agent-' + [guid]::NewGuid().ToString('N'))

  New-Item -ItemType Directory -Force -Path $installRoot, $runtimeRoot, $binRoot, $tempRoot | Out-Null

  Write-Step 'Preparing portable Node.js 24'
  $needNode = $true
  if (Test-Path -LiteralPath $nodeExe) {
    try {
      $major = [int]((& $nodeExe -p "process.versions.node.split('.')[0]").Trim())
      if ($major -eq 24) { $needNode = $false }
    } catch {}
  }

  if ($needNode) {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $checksumsUri = 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt'
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri $checksumsUri).Content
    $pattern = '(?m)^([0-9a-f]{64})\s+(node-v24\.[0-9.]+-win-' + [regex]::Escape($arch) + '\.zip)\s*$'
    $match = [regex]::Match($checksums, $pattern)
    if (!$match.Success) { throw "Could not resolve portable Node.js 24 for $arch." }

    $nodeHash = $match.Groups[1].Value
    $nodeArchiveName = $match.Groups[2].Value
    $nodeArchive = Join-Path $tempRoot $nodeArchiveName
    Download-File ('https://nodejs.org/dist/latest-v24.x/' + $nodeArchiveName) $nodeArchive
    Require-Hash $nodeArchive $nodeHash

    $nodeExtract = Join-Path $tempRoot 'node'
    Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExtract -Force
    $expandedNode = Get-ChildItem -LiteralPath $nodeExtract -Directory | Select-Object -First 1
    if (!$expandedNode -or !(Test-Path -LiteralPath (Join-Path $expandedNode.FullName 'node.exe'))) {
      throw 'Portable Node.js archive has an unexpected layout.'
    }
    if (Test-Path -LiteralPath $nodeHome) { Remove-Item -LiteralPath $nodeHome -Recurse -Force }
    Move-Item -LiteralPath $expandedNode.FullName -Destination $nodeHome
  }

  if (!(Test-Path -LiteralPath $npmCmd)) { throw 'npm.cmd is missing from portable Node.js.' }

  Write-Step 'Installing Render Agent runtime'
  & $npmCmd install --prefix $installRoot --no-save --no-package-lock --omit=dev 'ws@8.21.3'
  if ($LASTEXITCODE -ne 0) { throw 'Could not install the local WebSocket runtime.' }
  Download-File ($serverOrigin + '/api/render-agent/agent.js') $agentFile

  Write-Step 'Preparing FFmpeg'
  if (!(Test-Path -LiteralPath $ffmpegExe)) {
    $ffmpegUri = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
    $ffmpegHashUri = $ffmpegUri + '.sha256'
    $ffmpegArchive = Join-Path $tempRoot 'ffmpeg.zip'
    $expectedHash = ((Invoke-WebRequest -UseBasicParsing -Uri $ffmpegHashUri).Content -split '\s+')[0].Trim()
    if ($expectedHash -notmatch '^[0-9a-fA-F]{64}$') { throw 'Could not read FFmpeg SHA-256.' }
    Download-File $ffmpegUri $ffmpegArchive
    Require-Hash $ffmpegArchive $expectedHash

    $ffmpegExtract = Join-Path $tempRoot 'ffmpeg'
    Expand-Archive -LiteralPath $ffmpegArchive -DestinationPath $ffmpegExtract -Force
    $downloadedFfmpeg = Get-ChildItem -LiteralPath $ffmpegExtract -Recurse -File -Filter 'ffmpeg.exe' | Select-Object -First 1
    if (!$downloadedFfmpeg) { throw 'FFmpeg archive has an unexpected layout.' }
    Copy-Item -LiteralPath $downloadedFfmpeg.FullName -Destination $ffmpegExe -Force
  }

  Write-Step 'Detecting Chrome or Microsoft Edge'
  $browserCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  )
  $programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
  if ($programFilesX86) {
    $browserCandidates += (Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe')
    $browserCandidates += (Join-Path $programFilesX86 'Microsoft\Edge\Application\msedge.exe')
  }
  $browserExe = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if (!$browserExe) { throw 'Chrome or Microsoft Edge was not found on this PC.' }

  [ordered]@{
    server_origin = $serverOrigin
    node_exe = $nodeExe
    ffmpeg_exe = $ffmpegExe
    browser_exe = $browserExe
    agent_file = $agentFile
  } | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8

  $startBody = @'
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
$pidPath = Join-Path $PSScriptRoot 'agent.pid'
$outLog = Join-Path $PSScriptRoot 'agent.log'
$errorLog = Join-Path $PSScriptRoot 'agent-error.log'
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:41417/health' -TimeoutSec 1
  if ($health.server_origin -eq $config.server_origin) { exit 0 }
} catch {}
if (Test-Path -LiteralPath $pidPath) {
  try {
    $oldPid = [int](Get-Content -LiteralPath $pidPath -Raw)
    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
  } catch {}
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}
$env:FFMPEG_PATH = $config.ffmpeg_exe
$env:MIRA_RENDER_BROWSER_PATH = $config.browser_exe
$process = Start-Process -FilePath $config.node_exe -ArgumentList @($config.agent_file, ('--server=' + $config.server_origin)) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errorLog
Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII
'@
  Set-Content -LiteralPath $startScript -Value $startBody -Encoding UTF8

  Write-Step 'Enabling automatic startup'
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  New-Item -Path $runKey -Force | Out-Null
  $runCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $startScript + '"'
  New-ItemProperty -Path $runKey -Name 'MIRA Render Agent' -Value $runCommand -PropertyType String -Force | Out-Null

  Write-Step 'Starting MIRA Render Agent'
  & powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $startScript

  $connected = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:41417/health' -TimeoutSec 1
      if ($health.ok -and $health.server_origin -eq $serverOrigin) {
        $connected = $true
        break
      }
    } catch {}
  }
  if (!$connected) {
    $details = ''
    $errorLog = Join-Path $installRoot 'agent-error.log'
    if (Test-Path -LiteralPath $errorLog) {
      $details = (Get-Content -LiteralPath $errorLog -Tail 12 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
    }
    throw ("Render Agent did not start." + [Environment]::NewLine + $details)
  }

  Write-Host ''
  Write-Host 'MIRA Render Agent installed and connected.' -ForegroundColor Green
  Write-Host ('Server: ' + $serverOrigin)
  Write-Host 'Return to MIRA-TV and click Publish.'
} catch {
  Write-Host ''
  Write-Host ('MIRA Render Agent installation failed: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally {
  if ($tempRoot -and (Test-Path -LiteralPath $tempRoot)) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
