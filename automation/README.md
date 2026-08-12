# 9router control plane

This folder owns all custom startup, health, update, and patch orchestration.

- API and inference routes stay on `0.0.0.0:53220`.
- Dashboard UI runs as a separate loopback-only stage on `127.0.0.1:20128`.
- Dashboard `/api/*` requests stream through to `53220`; inference and control routes are blocked on `20128`.
- The monitor never kills or restarts the API process while port `53220` still has a listener.
- Updates are deferred while the API is running and applied the next time the port is stopped.
- Update tarballs are patched and tested in `automation/work/updates` before global installation.
- Before global installation, the controller snapshots the exact package and npm shims and journals rollback phases.
- `apply-patches.js` runs on an isolated dashboard copy after an update and before the dashboard stage starts.
- Dashboard patching is constrained to dashboard artifacts; the bulk-import API patch remains a separate explicit scope.
- Dashboard patching can run while the API is active and only restarts the dashboard stage.
- `apply-patches.ps1` delegates to the controller, while `apply-patches.js` refuses implicit global roots; every write target must be explicit.
- API Patch 28 performs account selection only: Codex selects the requested model, Sol fails closed without a Plus-or-higher account, and Terra prefers Free/Go/K12/Edu before its documented Plus+ fallback.
- Dashboard role guards prevent the staging process from starting AutoPing, tunnel, Tailscale, MITM, or outbound-proxy workers.
- The quota page defers its first render until hydration and is excluded from prerendering to prevent React hydration failures.
- The experimental Quota SSR bypass is repaired by default and only enabled with `--experimental`.
- The only file kept outside this folder is the thin Startup launcher at `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\9router.vbs`.
- The Startup entry is a readable VBS launcher rather than an opaque `.lnk`; both formats still need an absolute installed target.
- The hidden launcher discovers PowerShell 7 from `%ProgramFiles%` and falls back to `pwsh.exe` on `PATH`.
- `state`, `logs`, `work`, `legacy-backup`, and `__pycache__` are generated machine-local data, not portable source files.
- Do not enable upstream tray auto-start; upstream rewrites the same Startup file without `--port 53220`.

Portable entry point:

```bat
install-9router.bat
update-9router.bat
start-9router.bat
check-9router.bat
repair-9router.bat
```

`install-9router.bat` shows a fixed interactive action menu and an optional dry-run prompt. The other BAT files invoke one fixed action and never accept or forward command-line data. For scripted validation, call `pwsh -File .\automation\install-automation.ps1 -Action Check -DryRun` directly.

Copying the complete folder is supported. On `Install`, if the folder is not already registered by the current machine's Startup entry or monitor, generated runtime directories are reset before rebuilding them. Upstream 9router remains in the default global npm location; durable patches and automation remain in this folder. The installer recreates the machine-specific Startup VBS in UTF-16 so Unicode install paths remain valid.

Commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\9router-control.ps1 -Action Status
powershell -ExecutionPolicy Bypass -File .\9router-control.ps1 -Action Health
powershell -ExecutionPolicy Bypass -File .\9router-control.ps1 -Action CheckUpdate
powershell -ExecutionPolicy Bypass -File .\9router-control.ps1 -Action Update
powershell -ExecutionPolicy Bypass -File .\9router-control.ps1 -Action ApplyPatches -Scope dashboard
powershell -ExecutionPolicy Bypass -File .\9router-control.ps1 -Action DashboardStatus
powershell -ExecutionPolicy Bypass -File .\9router-control.ps1 -Action RestartDashboard
python .\verify-9router-health.py --api-port 53220 --dashboard-port 20128
```

`Update` returns exit code `2` when deferred because the API port is active.
`ApplyPatches -Scope dashboard` stages and verifies a new dashboard release without modifying the installed package or API PID.
Do not start the dashboard through the upstream CLI: its process cleanup can stop the API even when a different port is requested.
