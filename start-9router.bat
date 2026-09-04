@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if exist "%PWSH%" goto run
for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined FOUND_PWSH set "FOUND_PWSH=%%P"
if defined FOUND_PWSH set "PWSH=%FOUND_PWSH%"
if exist "%PWSH%" goto run
set "PWSH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PWSH%" for /f "delims=" %%P in ('where powershell.exe 2^>nul') do if not defined FOUND_PWSH set "PWSH=%%P"
:run
"%PWSH%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0automation\install-automation.ps1" -Action Start
exit /b %ERRORLEVEL%
