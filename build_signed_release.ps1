$ErrorActionPreference = 'Stop'

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  AVELUT SIGNED RELEASE BUILD (APK + AAB) " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$jdkDir = "C:\Users\Hp\android-dev-tools\jdk-21"
$sdkDir = "C:\Users\Hp\android-dev-tools\android-sdk"
$cmdlineToolsDir = "$sdkDir\cmdline-tools\latest"

$env:JAVA_HOME = $jdkDir
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir
$env:PATH = "$jdkDir\bin;$cmdlineToolsDir\bin;$sdkDir\platform-tools;$env:PATH"

Write-Host "Checking Java: " -NoNewline
& java -version

# Ensure local.properties
Set-Content -Path "c:\Users\Hp\avelut\android\local.properties" -Value "sdk.dir=$($sdkDir.Replace('\', '/'))" -Force

# Step 1: Web Build & Sync
Write-Host "`n[1/3] Building Web Assets & Syncing Capacitor..." -ForegroundColor Yellow
node ./node_modules/vite/bin/vite.js build
node ./node_modules/@capacitor/cli/bin/capacitor sync android

# Step 2: Gradle Release Build
Write-Host "`n[2/3] Building Signed APK & AAB with Gradle..." -ForegroundColor Yellow
Set-Location "c:\Users\Hp\avelut\android"
.\gradlew.bat assembleRelease bundleRelease --stacktrace
Set-Location "c:\Users\Hp\avelut"

# Step 3: Verification & Output Collection
Write-Host "`n[3/3] Verifying Built Artifacts..." -ForegroundColor Yellow
$apkPath = "c:\Users\Hp\avelut\android\app\build\outputs\apk\release\app-release.apk"
$aabPath = "c:\Users\Hp\avelut\android\app\build\outputs\bundle\release\app-release.aab"

$outDir = "c:\Users\Hp\avelut\release-output"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

if (Test-Path $apkPath) {
    $apkItem = Get-Item $apkPath
    Copy-Item -Path $apkPath -Destination "$outDir\avelut-release.apk" -Force
    Write-Host " SUCCESS: Signed APK -> $outDir\avelut-release.apk ($([math]::Round($apkItem.Length / 1MB, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host " FAILED: APK was not generated at $apkPath" -ForegroundColor Red
}

if (Test-Path $aabPath) {
    $aabItem = Get-Item $aabPath
    Copy-Item -Path $aabPath -Destination "$outDir\avelut-release.aab" -Force
    Write-Host " SUCCESS: Signed AAB -> $outDir\avelut-release.aab ($([math]::Round($aabItem.Length / 1MB, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host " FAILED: AAB was not generated at $aabPath" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  BUILD COMPLETE!                         " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
