# Builds the web bundle, syncs it into the Android project and produces the release-signed APK in .\release
# (signing key: android\keystore.properties + android\keystore\ — keep both backed up)
# usage (from the project root):  powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = Join-Path $env:USERPROFILE '.jdks\jdk-21.0.12.1+1'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Push-Location $root
try {
  npm run build
  npx cap sync android
  Push-Location android
  try { .\gradlew.bat assembleRelease --console=plain } finally { Pop-Location }
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  New-Item -ItemType Directory -Force release | Out-Null
  $apk = "release\neoPOCS-prototype-v$version.apk"
  Copy-Item android\app\build\outputs\apk\release\app-release.apk $apk -Force
  Write-Host "APK: $(Resolve-Path $apk)"
} finally {
  Pop-Location
}
