@echo off
setlocal EnableExtensions DisableDelayedExpansion

echo 9router portable lifecycle
echo [I] Install  [U] Update  [S] Start  [C] Check  [R] Repair  [V] Validate
choice /C IUSCRV /N /M "Select action: "
if errorlevel 6 goto action_validate
if errorlevel 5 goto action_repair
if errorlevel 4 goto action_check
if errorlevel 3 goto action_start
if errorlevel 2 goto action_update
if errorlevel 1 goto action_install
exit /b 1

:action_install
set "ACTION=Install"
goto choose_mode

:action_update
set "ACTION=Update"
goto choose_mode

:action_start
set "ACTION=Start"
goto choose_mode

:action_check
set "ACTION=Check"
goto choose_mode

:action_repair
set "ACTION=Repair"
goto choose_mode

:action_validate
set "ACTION=Validate"

:choose_mode
choice /C YN /N /M "Dry-run only? [Y/N]: "
if errorlevel 2 goto find_pwsh
if errorlevel 1 set "DRYRUN=-DryRun"

:find_pwsh
set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if exist "%PWSH%" goto run_installer
for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined FOUND_PWSH set "FOUND_PWSH=%%P"
if defined FOUND_PWSH set "PWSH=%FOUND_PWSH%"
if exist "%PWSH%" goto run_installer
if /I "%ACTION%"=="Install" goto bootstrap_pwsh
echo PowerShell 7 is missing. Run this installer and select Install.
exit /b 1

:bootstrap_pwsh
where winget.exe >nul 2>nul
if errorlevel 1 goto no_winget
echo Installing PowerShell 7...
winget install --id Microsoft.PowerShell --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 exit /b 1
set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if exist "%PWSH%" goto run_installer
echo PowerShell 7 installation finished, but pwsh.exe was not found.
exit /b 1

:no_winget
echo PowerShell 7 is missing and winget is unavailable.
echo Install PowerShell 7, then run this file again.
exit /b 1

:run_installer
if defined DRYRUN goto run_dry
"%PWSH%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0automation\install-automation.ps1" -Action "%ACTION%"
exit /b %ERRORLEVEL%

:run_dry
"%PWSH%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0automation\install-automation.ps1" -Action "%ACTION%" -DryRun
exit /b %ERRORLEVEL%
