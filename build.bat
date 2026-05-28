@echo off
setlocal

cd /d "%~dp0" || exit /b 1

echo Installing GMEdit build dependencies...
call npm install
if errorlevel 1 exit /b %errorlevel%

echo Installing packaged app dependencies...
pushd "bin\resources\app"
if errorlevel 1 exit /b %errorlevel%
call npm install --include=optional
set "APP_INSTALL_EXIT=%errorlevel%"
popd
if not "%APP_INSTALL_EXIT%"=="0" exit /b %APP_INSTALL_EXIT%

echo Preparing package output...
call :prepare_package_output
if errorlevel 1 exit /b %errorlevel%

echo Building GMEdit package...
call npm run package
exit /b %errorlevel%

:prepare_package_output
set "GMEDIT_APP_DIST=%CD%\bin\resources\app\dist"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$dist = [System.IO.Path]::GetFullPath($env:GMEDIT_APP_DIST);" ^
  "$procs = Get-Process -Name GMEdit -ErrorAction SilentlyContinue | Where-Object { try { $path = $_.Path; $path -and [System.IO.Path]::GetFullPath($path).StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false } };" ^
  "foreach ($proc in $procs) { Write-Host ('Stopping build output process: GMEdit.exe pid=' + $proc.Id + ' path=' + $proc.Path); Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue };" ^
  "if ($procs) { Start-Sleep -Milliseconds 500 };" ^
  "$winUnpacked = Join-Path $dist 'win-unpacked';" ^
  "if (Test-Path -LiteralPath $winUnpacked) { for ($i = 1; $i -le 5; $i++) { try { Remove-Item -LiteralPath $winUnpacked -Recurse -Force -ErrorAction Stop; break } catch { if ($i -eq 5) { throw }; Write-Host ('Waiting for locked output files, retry ' + $i + '/5...'); Start-Sleep -Seconds 1 } } }"
if errorlevel 1 (
  echo Failed to prepare package output. Close GMEdit.exe instances started from bin\resources\app\dist and try again.
  exit /b %errorlevel%
)
exit /b 0
