@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if exist "%PWSH%" goto run
for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined FOUND_PWSH set "FOUND_PWSH=%%P"
if defined FOUND_PWSH set "PWSH=%FOUND_PWSH%"
if not exist "%PWSH%" exit /b 1
:run
"%PWSH%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0automation\install-automation.ps1" -Action Check
exit /b %ERRORLEVEL%
