@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0GMEdit.exe" "%~dp0resources\app\gmedit-lint.js" %*
exit /b %ERRORLEVEL%
