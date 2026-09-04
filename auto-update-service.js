"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const SCRIPT_DIR = __dirname;
const CONTROL_JSON_PATH = path.join(SCRIPT_DIR, "9router-control.json");
const CONTROL_PS1_PATH = path.join(SCRIPT_DIR, "9router-control.ps1");
const LOGS_DIR = path.join(SCRIPT_DIR, "logs");
const STATE_DIR = path.join(SCRIPT_DIR, "state");
const UPDATE_LOG_PATH = path.join(LOGS_DIR, "in-app-update.log");
const UPDATE_STATUS_PATH = path.join(STATE_DIR, "update-status.json");

function ensureDirectories() {
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function getInstalledVersion() {
    const candidatePaths = [
        "C:/Users/Linh/AppData/Roaming/npm/node_modules/9router/package.json",
        path.join(process.env.APPDATA || "", "npm/node_modules/9router/package.json"),
        path.join(process.env.USERPROFILE || "", "AppData/Roaming/npm/node_modules/9router/package.json"),
    ];
    for (const p of candidatePaths) {
        if (p && fs.existsSync(p)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
                if (pkg && pkg.version) return pkg.version;
            } catch {}
        }
    }
    return "0.5.65";
}

function fetchLatestNpmVersion(timeoutMs = 5000) {
    return new Promise((resolve) => {
        const req = https.get("https://registry.npmjs.org/9router/latest", { timeout: timeoutMs }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.version || null);
                } catch {
                    resolve(null);
                }
            });
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => {
            req.destroy();
            resolve(null);
        });
    });
}

function compareSemver(a, b) {
    if (!a || !b) return 0;
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

function readJsonFile(filePath, fallback = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
    } catch {}
    return fallback;
}

function writeJsonFile(filePath, data) {
    ensureDirectories();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function appendUpdateLog(line) {
    ensureDirectories();
    const timestamp = new Date().toLocaleTimeString("vi-VN");
    const formatted = "[" + timestamp + "] " + line + "\n";
    fs.appendFileSync(UPDATE_LOG_PATH, formatted, "utf8");
}

function getUpdateStatus() {
    ensureDirectories();
    const state = readJsonFile(UPDATE_STATUS_PATH, {
        status: "idle",
        phase: "idle",
        progressPercent: 0,
        message: "Hệ thống sẵn sàng",
        currentVersion: getInstalledVersion(),
        targetVersion: null,
        startedAt: null,
        updatedAt: null,
        error: null,
    });

    if (state.status === "running" && state.updatedAt) {
        const ageMs = Date.now() - new Date(state.updatedAt).getTime();
        if (ageMs > 600000) {
            state.status = "failed";
            state.error = "Tiến trình cập nhật quá thời gian chờ (timeout).";
            writeJsonFile(UPDATE_STATUS_PATH, state);
        }
    }

    return state;
}

async function checkUpdate() {
    const currentVersion = getInstalledVersion();
    const latestVersion = (await fetchLatestNpmVersion()) || currentVersion;
    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
    const status = getUpdateStatus();

    return {
        currentVersion,
        latestVersion,
        hasUpdate,
        isBusy: status.status === "running",
        status: status.status,
        phase: status.phase,
        progressPercent: status.progressPercent,
        message: status.message,
        error: status.error,
        lastChecked: new Date().toISOString(),
    };
}

function getUpdateLogs(lineCount = 80) {
    ensureDirectories();
    if (!fs.existsSync(UPDATE_LOG_PATH)) return [];
    try {
        const content = fs.readFileSync(UPDATE_LOG_PATH, "utf8");
        const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
        return lines.slice(-lineCount);
    } catch {
        return [];
    }
}

function getUpdateProgress(lineCount = 80) {
    const status = getUpdateStatus();
    const logs = getUpdateLogs(lineCount);
    return {
        ...status,
        logs,
    };
}

function getUpdateConfig() {
    const cfg = readJsonFile(CONTROL_JSON_PATH, {});
    return {
        autoApplyUpdate: Boolean(cfg.autoApplyUpdate),
        autoUpdateHourStart: typeof cfg.autoUpdateHourStart === "number" ? cfg.autoUpdateHourStart : 3,
        autoUpdateHourEnd: typeof cfg.autoUpdateHourEnd === "number" ? cfg.autoUpdateHourEnd : 5,
        updateCheckIntervalMinutes: typeof cfg.updateCheckIntervalMinutes === "number" ? cfg.updateCheckIntervalMinutes : 60,
    };
}

function saveUpdateConfig(newCfg) {
    const current = readJsonFile(CONTROL_JSON_PATH, {});
    if (typeof newCfg.autoApplyUpdate === "boolean") current.autoApplyUpdate = newCfg.autoApplyUpdate;
    if (typeof newCfg.autoUpdateHourStart === "number") current.autoUpdateHourStart = Math.max(0, Math.min(23, newCfg.autoUpdateHourStart));
    if (typeof newCfg.autoUpdateHourEnd === "number") current.autoUpdateHourEnd = Math.max(0, Math.min(23, newCfg.autoUpdateHourEnd));
    if (typeof newCfg.updateCheckIntervalMinutes === "number") current.updateCheckIntervalMinutes = Math.max(5, Math.min(1440, newCfg.updateCheckIntervalMinutes));
    writeJsonFile(CONTROL_JSON_PATH, current);
    return getUpdateConfig();
}

function triggerUpdate(targetVersion = null) {
    const currentStatus = getUpdateStatus();
    if (currentStatus.status === "running") {
        return { success: false, message: "Tiến trình cập nhật đang chạy!", status: currentStatus };
    }

    const currentVersion = getInstalledVersion();
    const finalTarget = targetVersion || currentVersion;

    ensureDirectories();
    fs.writeFileSync(UPDATE_LOG_PATH, "=== BẮT ĐẦU CẬP NHẬT 9ROUTER: v" + currentVersion + " -> v" + finalTarget + " ===\n", "utf8");

    const initialState = {
        status: "running",
        phase: "preparing",
        progressPercent: 10,
        message: "Khởi tạo môi trường cập nhật...",
        currentVersion,
        targetVersion: finalTarget,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
    };
    writeJsonFile(UPDATE_STATUS_PATH, initialState);

    const psScript = `
        $ErrorActionPreference = "Stop"
        $controlPs1 = "${CONTROL_PS1_PATH.replace(/\\/g, "\\\\")}"
        $statusJson = "${UPDATE_STATUS_PATH.replace(/\\/g, "\\\\")}"
        $logPath = "${UPDATE_LOG_PATH.replace(/\\/g, "\\\\")}"

        function Update-ProgressState($phase, $pct, $msg) {
            try {
                $state = Get-Content -Raw $statusJson | ConvertFrom-Json
                $state.phase = $phase
                $state.progressPercent = $pct
                $state.message = $msg
                $state.updatedAt = (Get-Date).ToString("o")
                $state | ConvertTo-Json -Depth 5 | Set-Content -Path $statusJson -Encoding utf8
            } catch {}
        }

        function Log-Msg($msg) {
            $time = (Get-Date).ToString("HH:mm:ss")
            "[$time] $msg" | Out-File -FilePath $logPath -Append -Encoding utf8
        }

        try {
            Log-Msg "BƯỚC 1/3: Chuẩn bị candidate & Kiểm thử 30 Patches trong Sandbox..."
            Update-ProgressState "testing_sandbox" 30 "Đang tải và kiểm thử 30 Patches trong Sandbox..."
            
            & powershell.exe -ExecutionPolicy Bypass -File $controlPs1 -Action Update *>> $logPath
            $updateExit = $LASTEXITCODE
            Log-Msg "Update preflight hoàn tất với ExitCode: $updateExit"
            
            if ($updateExit -ne 0 -and $updateExit -ne 2) {
                throw "Sandbox preflight thất bại với ExitCode $updateExit"
            }

            Log-Msg "BƯỚC 2/3: Chuyển đổi an toàn (Cutover) & Cài đặt bản cập nhật..."
            Update-ProgressState "installing" 70 "Đang cài đặt và áp dụng các bản vá vào hệ thống..."
            
            & powershell.exe -ExecutionPolicy Bypass -File $controlPs1 -Action InstallPreparedUpdate *>> $logPath
            $installExit = $LASTEXITCODE
            Log-Msg "InstallPreparedUpdate hoàn tất với ExitCode: $installExit"
            
            if ($installExit -ne 0) {
                throw "Cài đặt chuyển đổi thất bại với ExitCode $installExit"
            }

            Log-Msg "BƯỚC 3/3: Kiểm tra sức khỏe dịch vụ 9Router..."
            Update-ProgressState "verifying" 90 "Đang kiểm tra trạng thái hoạt động của 9Router..."
            Start-Sleep -Seconds 2
            
            & powershell.exe -ExecutionPolicy Bypass -File $controlPs1 -Action Health *>> $logPath
            if ($LASTEXITCODE -ne 0) {
                throw "Kiểm tra sức khỏe 9Router không thành công!"
            }

            Log-Msg "🎉 CẬP NHẬT HOÀN TẤT THÀNH CÔNG!"
            $state = Get-Content -Raw $statusJson | ConvertFrom-Json
            $state.status = "completed"
            $state.phase = "completed"
            $state.progressPercent = 100
            $state.message = "Cập nhật thành công! Đang tự động tải lại trang..."
            $state.currentVersion = "${finalTarget}"
            $state.updatedAt = (Get-Date).ToString("o")
            $state | ConvertTo-Json -Depth 5 | Set-Content -Path $statusJson -Encoding utf8
        } catch {
            $err = $_.Exception.Message
            Log-Msg "❌ LỖI CẬP NHẬT: $err"
            try {
                $state = Get-Content -Raw $statusJson | ConvertFrom-Json
                $state.status = "failed"
                $state.phase = "failed"
                $state.error = $err
                $state.message = "Cập nhật thất bại. Hệ thống đã tự động khôi phục bản an toàn."
                $state.updatedAt = (Get-Date).ToString("o")
                $state | ConvertTo-Json -Depth 5 | Set-Content -Path $statusJson -Encoding utf8
            } catch {}
        }
    `;

    const child = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-Command", psScript], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
    });
    child.unref();

    appendUpdateLog("Đã kích hoạt tiến trình cập nhật ngầm PID: " + child.pid);
    return {
        success: true,
        message: "Đã kích hoạt tiến trình cập nhật tự động.",
        pid: child.pid,
    };
}

module.exports = {
    checkUpdate,
    triggerUpdate,
    getUpdateStatus,
    getUpdateLogs,
    getUpdateProgress,
    getUpdateConfig,
    saveUpdateConfig,
};
