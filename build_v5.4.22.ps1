param(
    [string]$Version = "5.4.22"
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = "c:\Users\Hp\avelut"
$AndroidDir  = "$ProjectRoot\android"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  AVELUT FULL RELEASE BUILD - v$Version  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ----------------------------------------------
# Step 0: Environment Setup
# ----------------------------------------------
Write-Host "`n[0/5] Setting up environment..." -ForegroundColor Yellow

$jdkDir          = "C:\Users\Hp\android-dev-tools\jdk-21"
$sdkDir          = "C:\Users\Hp\android-dev-tools\android-sdk"
$cmdlineToolsDir = "$sdkDir\cmdline-tools\latest"

if (-not (Test-Path $jdkDir)) { throw "JDK not found at $jdkDir" }
if (-not (Test-Path "$sdkDir\platform-tools")) { throw "Android SDK not found at $sdkDir" }

$env:JAVA_HOME        = $jdkDir
$env:ANDROID_HOME     = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir
$env:PATH             = "$jdkDir\bin;$cmdlineToolsDir\bin;$sdkDir\platform-tools;$env:PATH"

Set-Location $ProjectRoot
Set-Content -Path "$AndroidDir\local.properties" -Value "sdk.dir=$($sdkDir.Replace('\', '/'))" -Force

Write-Host "Java in use:" -NoNewline
cmd /c "java -version 2>&1"

# ----------------------------------------------
# Step 1: Version Bump
# ----------------------------------------------
Write-Host "`n[1/5] Bumping versions to v$Version..." -ForegroundColor Yellow

# --- package.json ---
$pkgJsonPath = "$ProjectRoot\package.json"
$pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$oldPkgVersion = $pkg.version
$pkg.version = $Version
$pkgJson = $pkg | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($pkgJsonPath, $pkgJson + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  package.json:               $oldPkgVersion -> $Version" -ForegroundColor Green

# --- android/app/build.gradle ---
$buildGradlePath = "$AndroidDir\app\build.gradle"
$gradleContent   = Get-Content $buildGradlePath -Raw

# Extract old versionName for reporting
$oldNameMatch  = [regex]::Match($gradleContent, 'versionName\s+"([^"]+)"')
$oldGradleName = if ($oldNameMatch.Success) { $oldNameMatch.Groups[1].Value } else { "unknown" }

# Only increment versionCode if the versionName is actually changing (idempotent re-runs)
if ($oldGradleName -ne $Version) {
    $currentCodeMatch = [regex]::Match($gradleContent, 'versionCode\s+(\d+)')
    if (-not $currentCodeMatch.Success) { throw "Could not find versionCode in build.gradle" }
    $newVersionCode = [int]$currentCodeMatch.Groups[1].Value + 1
} else {
    Write-Host "  (version already $Version - keeping existing versionCode)" -ForegroundColor DarkGray
    $currentCodeMatch = [regex]::Match($gradleContent, 'versionCode\s+(\d+)')
    $newVersionCode = [int]$currentCodeMatch.Groups[1].Value
}

$gradleContent = [regex]::Replace($gradleContent, '(versionCode\s+)\d+', "`${1}$newVersionCode")
$gradleContent = [regex]::Replace($gradleContent, '(versionName\s+)"[^"]+"', "`${1}`"$Version`"")

[System.IO.File]::WriteAllText($buildGradlePath, $gradleContent, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  build.gradle versionName:   $oldGradleName -> $Version" -ForegroundColor Green
Write-Host "  build.gradle versionCode:   $($currentCodeMatch.Groups[1].Value) -> $newVersionCode" -ForegroundColor Green

# ----------------------------------------------
# Step 2: Web Build & Capacitor Sync
# ----------------------------------------------
Write-Host "`n[2/5] Building Web Assets & Syncing Capacitor..." -ForegroundColor Yellow
node ./node_modules/vite/bin/vite.js build 2>&1 | ForEach-Object { "$_" }
if ($LASTEXITCODE -ne 0) { throw "Vite web build failed (exit code $LASTEXITCODE)" }

node ./node_modules/@capacitor/cli/bin/capacitor sync android 2>&1 | ForEach-Object { "$_" }
if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed (exit code $LASTEXITCODE)" }

# ----------------------------------------------
# Step 3: Gradle Release Build (Signed AAB + APK)
# ----------------------------------------------
Write-Host "`n[3/5] Building Signed AAB & APK with Gradle..." -ForegroundColor Yellow
Push-Location $AndroidDir
try {
    .\gradlew.bat bundleRelease assembleRelease --stacktrace
    if ($LASTEXITCODE -ne 0) { throw "Gradle release build failed (exit code $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# ----------------------------------------------
# Step 4: Verify & Collect Artifacts
# ----------------------------------------------
Write-Host "`n[4/5] Verifying Built Artifacts..." -ForegroundColor Yellow

$aabPath = "$AndroidDir\app\build\outputs\bundle\release\app-release.aab"
$apkPath = "$AndroidDir\app\build\outputs\apk\release\app-release.apk"

$outDir = "$ProjectRoot\release-output"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$aabDest = "$outDir\avelut-v$Version.aab"
$apkDest = "$outDir\avelut-v$Version.apk"

$aabOk = $false; $apkOk = $false

if (Test-Path $aabPath) {
    Copy-Item -Path $aabPath -Destination $aabDest -Force
    $size = [math]::Round((Get-Item $aabDest).Length / 1MB, 2)
    Write-Host " SUCCESS: Signed AAB -> $aabDest ($size MB)" -ForegroundColor Green
    $aabOk = $true
} else {
    Write-Host " FAILED: AAB was not generated at $aabPath" -ForegroundColor Red
}

if (Test-Path $apkPath) {
    Copy-Item -Path $apkPath -Destination $apkDest -Force
    $size = [math]::Round((Get-Item $apkDest).Length / 1MB, 2)
    Write-Host " SUCCESS: Signed APK -> $apkDest ($size MB)" -ForegroundColor Green
    $apkOk = $true
} else {
    Write-Host " FAILED: APK was not generated at $apkPath" -ForegroundColor Red
}

# ----------------------------------------------
# Step 5: Summary
# ----------------------------------------------
Write-Host "`n[5/5] Build Summary" -ForegroundColor Yellow
Write-Host "------------------------------------------"
Write-Host " Version bumped : $oldPkgVersion -> v$Version"
Write-Host " Version name   : $Version"
Write-Host " Version code   : $newVersionCode"
Write-Host " AAB (Play)     : $(if ($aabOk) { $aabDest } else { 'NOT GENERATED' })"
Write-Host " APK (direct)   : $(if ($apkOk) { $apkDest } else { 'NOT GENERATED' })"
Write-Host "------------------------------------------"

if (-not ($aabOk -and $apkOk)) {
    Write-Host "`nBUILD FINISHED WITH ERRORS - some artifacts are missing!" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  BUILD COMPLETE! READY FOR PLAY STORE     " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan