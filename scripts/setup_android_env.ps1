$ErrorActionPreference = 'Stop'
$toolsDir = "C:\Users\Hp\android-dev-tools"
$jdkDir = "$toolsDir\jdk-21"
$sdkDir = "$toolsDir\android-sdk"

if (!(Test-Path $toolsDir)) {
    New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
}

# 1. Download & Extract JDK 21 if not present
if (!(Test-Path "$jdkDir\bin\java.exe")) {
    if (Test-Path $jdkDir) { Remove-Item -Path $jdkDir -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host "Downloading OpenJDK 21 via curl with ssl-no-revoke..." -ForegroundColor Cyan
    $jdkZip = "$toolsDir\jdk21.zip"
    $jdkUrl = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.6%2B7/OpenJDK21U-jdk_x64_windows_hotspot_21.0.6_7.zip"
    & curl.exe -k --ssl-no-revoke -L -o $jdkZip $jdkUrl
    
    if (!(Test-Path $jdkZip) -or (Get-Item $jdkZip).Length -lt 50000000) {
        throw "Failed to download JDK 21 zip. File size too small."
    }

    Write-Host "Extracting JDK 21..." -ForegroundColor Cyan
    tar.exe -xf $jdkZip -C $toolsDir
    $extractedFolder = Get-ChildItem -Path $toolsDir -Directory -Filter "jdk-21*" | Select-Object -First 1
    if ($extractedFolder -and $extractedFolder.FullName -ne $jdkDir) {
        Rename-Item -Path $extractedFolder.FullName -NewName "jdk-21" -Force
    }
    Remove-Item -Path $jdkZip -Force -ErrorAction SilentlyContinue
    Write-Host "JDK 21 installed successfully at $jdkDir" -ForegroundColor Green
}

# 2. Download & Extract Android Command-Line Tools if not present
$cmdlineToolsDir = "$sdkDir\cmdline-tools\latest"
if (!(Test-Path "$cmdlineToolsDir\bin\sdkmanager.bat")) {
    if (Test-Path "$sdkDir\cmdline-tools") { Remove-Item -Path "$sdkDir\cmdline-tools" -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host "Downloading Android Command-Line Tools..." -ForegroundColor Cyan
    $sdkZip = "$toolsDir\commandlinetools.zip"
    $sdkUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
    & curl.exe -k --ssl-no-revoke -L -o $sdkZip $sdkUrl
    
    if (!(Test-Path $sdkZip) -or (Get-Item $sdkZip).Length -lt 10000000) {
        throw "Failed to download Android Command-Line Tools zip."
    }

    Write-Host "Extracting Android Command-Line Tools..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path "$toolsDir\temp_cmdline" -Force | Out-Null
    tar.exe -xf $sdkZip -C "$toolsDir\temp_cmdline"
    
    New-Item -ItemType Directory -Path "$sdkDir\cmdline-tools" -Force | Out-Null
    Move-Item -Path "$toolsDir\temp_cmdline\cmdline-tools" -Destination "$sdkDir\cmdline-tools\latest" -Force
    Remove-Item -Path "$toolsDir\temp_cmdline" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $sdkZip -Force -ErrorAction SilentlyContinue
    Write-Host "Android Command-Line Tools installed successfully at $cmdlineToolsDir" -ForegroundColor Green
}

# 3. Configure environment variables for this session
$env:JAVA_HOME = $jdkDir
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir
$env:PATH = "$jdkDir\bin;$cmdlineToolsDir\bin;$sdkDir\platform-tools;$env:PATH"

# 4. Accept Android SDK licenses
Write-Host "Accepting Android SDK licenses..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "$sdkDir\licenses" -Force | Out-Null
Set-Content -Path "$sdkDir\licenses\android-sdk-license" -Value "`n24333f8a63b6825ea9c5514f83c2829b004d1fee`nd56f5185470d6464e1a9e53882a94df0f9e6d970`n859f317696f67ef3d7f30a50a5560e7834b434a1" -Force
Set-Content -Path "$sdkDir\licenses\android-sdk-preview-license" -Value "`n84831b9409646a4270d4739381d04859f9da611b" -Force

# Create local.properties in android directory
Set-Content -Path "c:\Users\Hp\avelut\android\local.properties" -Value "sdk.dir=$($sdkDir.Replace('\', '/'))" -Force

Write-Host "Environment setup complete!" -ForegroundColor Green
