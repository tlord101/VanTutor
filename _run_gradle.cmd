@echo off
cd /d c:\Users\Hp\avelut\android
set JAVA_HOME=C:\Users\Hp\android-dev-tools\jdk-21
set PATH=C:\Users\Hp\android-dev-tools\jdk-21\bin;%PATH%
call gradlew.bat assembleRelease > c:\Users\Hp\avelut\_gradle_apk_log.txt 2>&1
echo EXITCODE=%ERRORLEVEL% >> c:\Users\Hp\avelut\_gradle_apk_log.txt
