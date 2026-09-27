import { readFile } from 'node:fs/promises';

const agentSourceUrl = new URL('../../tools/render-agent/agent.js', import.meta.url);
const windowsInstallerUrl = new URL('../../tools/render-agent/install-windows.ps1', import.meta.url);

function normalizedOrigin(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Render Agent origin must use HTTP or HTTPS.');
  return url.origin;
}

export function renderAgentServerOrigin(request, config) {
  const configuredDomain = String(config?.domain || '').trim().toLowerCase();
  let requestOrigin = '';
  try {
    requestOrigin = normalizedOrigin(`${request.protocol}://${request.get('host') || ''}`);
  } catch {}

  if (requestOrigin) {
    const hostname = new URL(requestOrigin).hostname.toLowerCase();
    if (config?.nodeEnv === 'test' || !configuredDomain || hostname === configuredDomain) return requestOrigin;
  }
  return normalizedOrigin(`https://${configuredDomain}`);
}

export function windowsBootstrapCommand(serverOrigin) {
  const origin = normalizedOrigin(serverOrigin);
  const setupUrl = origin + '/api/render-agent/installer/windows.ps1';
  return [
    '@echo off',
    'setlocal',
    'title MIRA Render Agent Setup',
    'set "MIRA_SERVER=' + origin + '"',
    'set "MIRA_SETUP=%TEMP%\\MIRA-Render-Agent-Setup-%RANDOM%-%RANDOM%.ps1"',
    'echo MIRA Render Agent setup',
    'echo Server: %MIRA_SERVER%',
    'echo.',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference=\'SilentlyContinue\'; Invoke-WebRequest -UseBasicParsing -Uri \'' + setupUrl + '\' -OutFile \'%MIRA_SETUP%\'"',
    'if errorlevel 1 goto :download_failed',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MIRA_SETUP%" -ServerOrigin "%MIRA_SERVER%"',
    'set "MIRA_CODE=%ERRORLEVEL%"',
    'del /q "%MIRA_SETUP%" >nul 2>nul',
    'if not "%MIRA_CODE%"=="0" goto :install_failed',
    'echo.',
    'echo MIRA Render Agent is ready.',
    'timeout /t 3 /nobreak >nul',
    'exit /b 0',
    ':download_failed',
    'echo.',
    'echo Could not download MIRA Render Agent setup from this server.',
    'pause',
    'exit /b 1',
    ':install_failed',
    'echo.',
    'echo MIRA Render Agent setup failed. See the message above.',
    'pause',
    'exit /b %MIRA_CODE%'
  ].join('\r\n') + '\r\n';
}

export function readRenderAgentSource() {
  return readFile(agentSourceUrl, 'utf8');
}

export function readWindowsInstallerSource() {
  return readFile(windowsInstallerUrl, 'utf8');
}
