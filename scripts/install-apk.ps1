# Installs the newest prototype APK from .\release on a USB-connected PDA (MF52e) and starts the app.
# Works from any folder:
#   powershell -ExecutionPolicy Bypass -File C:/Users/toddk/xCLMA/neo-pocs-prototype/scripts/install-apk.ps1
# Options:
#   -Apk <path>   install this APK instead of the newest one in release\
#   -Reinstall    remove the installed app first (needed when it was signed with another key or is newer; deletes app data)
param([string]$Apk, [switch]$Reinstall)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$package = 'com.softbowl.neopocs.prototype'

function Fail([string[]]$lines) {
  foreach ($l in $lines) { Write-Host $l -ForegroundColor Yellow }
  exit 1
}

# adb from the Android SDK installed for this project, or one on PATH
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $cmd) { Fail 'adb를 찾을 수 없습니다. Android SDK platform-tools가 설치되어 있는지 확인하세요.' }
  $adb = $cmd.Source
}

# Runs adb and returns its output (stdout and stderr) as plain strings.
function Invoke-Adb {
  $ErrorActionPreference = 'Continue'
  & $adb @args 2>&1 | ForEach-Object { "$_" }
}

if (-not $Apk) {
  $latest = Get-ChildItem (Join-Path $root 'release') -Filter 'neoPOCS-prototype-v*.apk' -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.BaseName -replace '^neoPOCS-prototype-v', '') } -Descending |
    Select-Object -First 1
  if (-not $latest) { Fail 'release 폴더에 APK가 없습니다. 먼저 scripts\build-apk.ps1 로 APK를 만드세요.' }
  $Apk = $latest.FullName
}
if (-not (Test-Path $Apk)) { Fail "APK 파일이 없습니다: $Apk" }
Write-Host "APK: $Apk"

Invoke-Adb start-server | Out-Null
$found = @(Invoke-Adb devices | Where-Object { $_ -match '^\S+\s+(device|unauthorized|offline)$' })
$ready = @($found | Where-Object { $_ -match '\sdevice$' })
if (-not $ready) {
  if ($found | Where-Object { $_ -match 'unauthorized' }) {
    Fail 'PDA 화면에 뜬 "USB 디버깅을 허용하시겠습니까?" 창에서 [허용]을 누른 뒤 다시 실행하세요.'
  }
  Fail @(
    'PDA가 연결되어 있지 않습니다.',
    '  1. PDA를 USB 케이블로 PC에 연결합니다 (충전 전용 케이블이 아닌 데이터 케이블).',
    '  2. PDA 설정 > 휴대전화 정보 > 빌드 번호를 7번 눌러 개발자 옵션을 켭니다.',
    '  3. 설정 > 시스템 > 개발자 옵션 > USB 디버깅을 켭니다.',
    '  4. PDA에 "USB 디버깅을 허용하시겠습니까?" 창이 뜨면 [허용]을 누르고 이 명령을 다시 실행합니다.',
    'USB 디버깅을 쓸 수 없다면 README 1번처럼 APK를 PDA의 Download 폴더에 복사해 파일 앱에서 설치하세요.'
  )
}
$serial = ($ready[0] -split '\s+')[0]
if ($ready.Count -gt 1) { Write-Host "연결된 기기가 여러 대입니다. 첫 번째 기기($serial)에 설치합니다." }
$model = (Invoke-Adb -s $serial shell getprop ro.product.model | Select-Object -First 1)
Write-Host "기기: $model ($serial)"

if ($Reinstall) {
  Write-Host '기존 앱을 삭제합니다...'
  Invoke-Adb -s $serial uninstall $package | Out-Null
}

Write-Host '설치 중...'
$out = @(Invoke-Adb -s $serial install -r $Apk)
$out | ForEach-Object { Write-Host "  $_" }
if (-not ($out -match '^Success')) {
  if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') {
    Fail '설치된 앱의 서명이 달라 덮어쓸 수 없습니다. 뒤에 -Reinstall 을 붙여 다시 실행하면 기존 앱을 지우고 설치합니다(앱 데이터 삭제).'
  }
  if ($out -match 'INSTALL_FAILED_VERSION_DOWNGRADE') {
    Fail 'PDA에 더 높은 버전이 설치되어 있습니다. 뒤에 -Reinstall 을 붙여 다시 실행하면 기존 앱을 지우고 설치합니다.'
  }
  if ($out -match 'INSTALL_FAILED_USER_RESTRICTED|INSTALL_FAILED_VERIFICATION_FAILURE') {
    Fail 'PDA가 USB 설치를 막았습니다. 개발자 옵션의 "USB를 통해 설치" / "USB를 통해 앱 확인" 설정과 PDA 화면의 확인 창을 확인하세요.'
  }
  Fail '설치하지 못했습니다. 위 adb 메시지를 확인하세요.'
}

Invoke-Adb -s $serial shell monkey -p $package -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host '설치 완료 - PDA에서 neo POCS를 실행했습니다.' -ForegroundColor Green
