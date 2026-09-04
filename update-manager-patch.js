"use strict";

const fs = require('fs');
const path = require('path');

function getUpdateModalScript() {
    return `
    (function() {
        if (window.__9rUpdateManagerInitialized) return;
        window.__9rUpdateManagerInitialized = true;

        let activeTab = "manual";
        let pollTimer = null;
        let countdownTimer = null;

        function getModalHtml() {
            return \`
            <div id="__9r_update_modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150" style="display:none;">
                <div class="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-[#0d1117] border border-[#30363d] text-white shadow-2xl overflow-hidden font-sans">
                    <!-- Header -->
                    <div class="flex items-center justify-between px-6 py-4 border-b border-[#21262d] bg-[#161b22]/70">
                        <div class="flex items-center gap-3">
                            <div class="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-900/30">
                                <span class="material-symbols-outlined text-[22px]">system_update</span>
                            </div>
                            <div>
                                <h3 class="text-base font-bold text-white tracking-tight flex items-center gap-2">
                                    Quản Lý Cập Nhật 9Router
                                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">1-Click & Auto</span>
                                </h3>
                                <p class="text-xs text-gray-400">Kiểm thử Sandbox • Bảo toàn 30 Patches • Không mất dữ liệu</p>
                            </div>
                        </div>
                        <button id="__9r_upd_close" type="button" class="size-8 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#30363d]">
                            <span class="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>

                    <!-- Version Status Banner -->
                    <div class="px-6 py-3 bg-[#111620] border-b border-[#21262d] flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3 text-sm">
                            <span class="text-gray-400 font-medium">Phiên bản:</span>
                            <span id="__9r_upd_cur_ver" class="font-mono px-2 py-0.5 rounded bg-[#21262d] text-gray-200 border border-[#30363d] text-xs">v0.5.65</span>
                            <span class="text-gray-500">→</span>
                            <span id="__9r_upd_latest_ver" class="font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">Đang kiểm tra...</span>
                        </div>
                        <div id="__9r_upd_badge" class="text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 bg-gray-800 text-gray-400 border border-gray-700">
                            <span class="size-2 rounded-full bg-gray-400 animate-pulse"></span>
                            Đang kết nối...
                        </div>
                    </div>

                    <!-- Tabs Switcher -->
                    <div class="flex border-b border-[#21262d] px-6 bg-[#0d1117]">
                        <button id="__9r_tab_btn_manual" type="button" class="px-4 py-2.5 text-xs font-bold border-b-2 border-emerald-500 text-emerald-400 transition-colors flex items-center gap-2 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">bolt</span>
                            Cập Nhật 1-Click
                        </button>
                        <button id="__9r_tab_btn_sched" type="button" class="px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-2 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">schedule</span>
                            Lịch Cập Nhật Ngầm
                        </button>
                    </div>

                    <!-- Modal Body -->
                    <div class="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
                        <!-- TAB 1: MANUAL 1-CLICK -->
                        <div id="__9r_tab_content_manual" class="space-y-4">
                            <!-- Steps Tracker -->
                            <div class="grid grid-cols-4 gap-2 text-center text-[11px]">
                                <div id="__9r_step_1" class="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-gray-400">
                                    <div class="font-bold mb-0.5">1. Tải Gói</div>
                                    <div class="text-[10px] text-gray-500">npm registry</div>
                                </div>
                                <div id="__9r_step_2" class="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-gray-400">
                                    <div class="font-bold mb-0.5">2. Sandbox Test</div>
                                    <div class="text-[10px] text-gray-500">Kiểm thử 30 bản vá</div>
                                </div>
                                <div id="__9r_step_3" class="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-gray-400">
                                    <div class="font-bold mb-0.5">3. Chuyển Đổi</div>
                                    <div class="text-[10px] text-gray-500">Cutover an toàn</div>
                                </div>
                                <div id="__9r_step_4" class="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-gray-400">
                                    <div class="font-bold mb-0.5">4. Hoàn Tất</div>
                                    <div class="text-[10px] text-gray-500">Tự động tải lại</div>
                                </div>
                            </div>

                            <!-- Progress Bar -->
                            <div class="space-y-1.5">
                                <div class="flex justify-between text-xs">
                                    <span id="__9r_upd_msg" class="text-gray-300 font-medium truncate">Sẵn sàng</span>
                                    <span id="__9r_upd_pct" class="text-emerald-400 font-mono font-bold">0%</span>
                                </div>
                                <div class="w-full h-2 rounded-full bg-[#21262d] overflow-hidden">
                                    <div id="__9r_upd_bar" class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300" style="width: 0%"></div>
                                </div>
                            </div>

                            <!-- Live Terminal Logs -->
                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between text-xs text-gray-400">
                                    <span class="flex items-center gap-1.5 font-medium">
                                        <span class="size-2 rounded-full bg-emerald-400"></span>
                                        Nhật ký tiến trình (Live Logs):
                                    </span>
                                    <button id="__9r_btn_copy_upd_log" type="button" class="text-[11px] text-gray-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer">
                                        <span class="material-symbols-outlined text-[14px]">content_copy</span>
                                        <span>Sao chép log</span>
                                    </button>
                                </div>
                                <div id="__9r_upd_logs" class="h-44 rounded-xl bg-[#090d13] border border-[#21262d] p-3 font-mono text-[11px] leading-relaxed text-gray-300 overflow-y-auto custom-scrollbar select-text whitespace-pre-wrap">Đang tải nhật ký...</div>
                            </div>
                        </div>

                        <!-- TAB 2: AUTO-SCHEDULER -->
                        <div id="__9r_tab_content_sched" class="space-y-4" style="display:none;">
                            <div class="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <div class="text-sm font-bold text-white">Tự động cập nhật ngầm khi có bản mới</div>
                                        <div class="text-xs text-gray-400 mt-0.5">Central Monitor tự động chạy vào ban đêm khi rảnh rỗi</div>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input id="__9r_cfg_auto_apply" type="checkbox" class="sr-only peer">
                                        <div class="w-11 h-6 bg-[#21262d] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                    </label>
                                </div>

                                <hr class="border-[#21262d]">

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-semibold text-gray-300 mb-1.5">Khung giờ bắt đầu (Đêm)</label>
                                        <div class="flex items-center gap-2">
                                            <input id="__9r_cfg_hour_start" type="number" min="0" max="23" value="3" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none">
                                            <span class="text-xs text-gray-400">:00</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-gray-300 mb-1.5">Khung giờ kết thúc (Sáng)</label>
                                        <div class="flex items-center gap-2">
                                            <input id="__9r_cfg_hour_end" type="number" min="0" max="23" value="5" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none">
                                            <span class="text-xs text-gray-400">:00</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-xs font-semibold text-gray-300 mb-1.5">Chu kỳ kiểm tra định kỳ</label>
                                    <select id="__9r_cfg_interval" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer">
                                        <option value="30">Mỗi 30 phút</option>
                                        <option value="60" selected>Mỗi 60 phút (Khuyến nghị)</option>
                                        <option value="120">Mỗi 2 giờ</option>
                                        <option value="360">Mỗi 6 giờ</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Safety Guarantee Box -->
                            <div class="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-300/90 leading-relaxed flex items-start gap-2.5">
                                <span class="material-symbols-outlined text-[20px] text-emerald-400 shrink-0 mt-0.5">verified_user</span>
                                <div>
                                    <b class="text-emerald-400">Cơ chế an toàn 100%:</b> Hệ thống sẽ tải bản mới vào thư mục sandbox độc lập và chạy kiểm thử toàn bộ 30 bản vá (Bulk Import, Stealth SSO, Quota, K12...) cùng 13 unit tests. Chỉ khi <b>100% kiểm thử thành công</b>, hệ thống mới tiến hành cập nhật. Nếu có bất kỳ lỗi nào, hệ thống tự động hủy bỏ và giữ nguyên phiên bản ổn định hiện tại.
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer Actions -->
                    <div class="px-6 py-4 border-t border-[#21262d] bg-[#161b22]/70 flex items-center justify-between gap-3">
                        <div class="text-[11px] text-gray-400">
                            Central Monitor: <span class="text-emerald-400 font-semibold">Đang bảo vệ</span>
                        </div>
                        <div class="flex items-center gap-2.5">
                            <button id="__9r_upd_btn_check" type="button" class="px-3.5 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-200 text-xs font-semibold transition-colors border border-[#30363d] flex items-center gap-1.5 cursor-pointer">
                                <span class="material-symbols-outlined text-[15px]">sync</span>
                                Kiểm tra lại
                            </button>
                            <button id="__9r_upd_btn_save_cfg" type="button" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer" style="display:none;">
                                <span class="material-symbols-outlined text-[15px]">save</span>
                                Lưu cấu hình
                            </button>
                            <button id="__9r_upd_btn_start" type="button" class="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">rocket_launch</span>
                                <span>Bắt Đầu Cập Nhật 1-Click</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            \`;
        }

        function ensureModalInDom() {
            let el = document.getElementById("__9r_update_modal");
            if (!el) {
                const wrapper = document.createElement("div");
                wrapper.innerHTML = getModalHtml();
                document.body.appendChild(wrapper.firstElementChild);
                bindModalEvents();
            }
        }

        function bindModalEvents() {
            const modal = document.getElementById("__9r_update_modal");
            const closeBtn = document.getElementById("__9r_upd_close");
            const tabManual = document.getElementById("__9r_tab_btn_manual");
            const tabSched = document.getElementById("__9r_tab_btn_sched");
            const contentManual = document.getElementById("__9r_tab_content_manual");
            const contentSched = document.getElementById("__9r_tab_content_sched");
            const btnCheck = document.getElementById("__9r_upd_btn_check");
            const btnStart = document.getElementById("__9r_upd_btn_start");
            const btnSaveCfg = document.getElementById("__9r_upd_btn_save_cfg");
            const btnCopyLog = document.getElementById("__9r_btn_copy_upd_log");

            closeBtn.onclick = () => closeModal();
            modal.onclick = (e) => {
                if (e.target === modal) closeModal();
            };

            tabManual.onclick = () => {
                activeTab = "manual";
                tabManual.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-emerald-500 text-emerald-400 transition-colors flex items-center gap-2 cursor-pointer";
                tabSched.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-2 cursor-pointer";
                contentManual.style.display = "block";
                contentSched.style.display = "none";
                btnStart.style.display = "inline-flex";
                btnSaveCfg.style.display = "none";
            };

            tabSched.onclick = () => {
                activeTab = "sched";
                tabSched.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-emerald-500 text-emerald-400 transition-colors flex items-center gap-2 cursor-pointer";
                tabManual.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-2 cursor-pointer";
                contentManual.style.display = "none";
                contentSched.style.display = "block";
                btnStart.style.display = "none";
                btnSaveCfg.style.display = "inline-flex";
                loadConfig();
            };

            btnCheck.onclick = () => checkStatus(true);
            btnStart.onclick = () => startUpdate();
            btnSaveCfg.onclick = () => saveConfig();
            btnCopyLog.onclick = () => {
                const box = document.getElementById("__9r_upd_logs");
                if (box && box.textContent) {
                    navigator.clipboard.writeText(box.textContent).then(() => {
                        const oldText = btnCopyLog.innerHTML;
                        btnCopyLog.innerHTML = '<span class="material-symbols-outlined text-[14px]">check</span><span>Đã chép!</span>';
                        setTimeout(() => btnCopyLog.innerHTML = oldText, 1500);
                    });
                }
            };
        }

        function openModal() {
            ensureModalInDom();
            const modal = document.getElementById("__9r_update_modal");
            if (modal) modal.style.display = "flex";
            checkStatus(false);
            loadConfig();
            startPolling();
        }

        function closeModal() {
            const modal = document.getElementById("__9r_update_modal");
            if (modal) modal.style.display = "none";
            stopPolling();
            if (countdownTimer) clearInterval(countdownTimer);
        }

        function checkStatus(forceCheck) {
            fetch("/api/oauth/codex/bulk-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "check_update" })
            })
            .then(r => r.json())
            .then(data => {
                renderVersionInfo(data);
                if (data.isBusy) {
                    startPolling();
                } else {
                    renderProgress(data);
                }
            })
            .catch(err => {
                console.error("[UpdateManager] Check error:", err);
            });
        }

        function renderVersionInfo(data) {
            const curEl = document.getElementById("__9r_upd_cur_ver");
            const latEl = document.getElementById("__9r_upd_latest_ver");
            const badge = document.getElementById("__9r_upd_badge");
            const btnStart = document.getElementById("__9r_upd_btn_start");

            if (curEl && data.currentVersion) curEl.textContent = "v" + data.currentVersion;
            if (latEl && data.latestVersion) latEl.textContent = "v" + data.latestVersion;

            if (badge) {
                if (data.hasUpdate) {
                    badge.className = "text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30";
                    badge.innerHTML = '<span class="size-2 rounded-full bg-amber-400 animate-ping"></span> Có bản mới v' + data.latestVersion;
                    if (btnStart) {
                        btnStart.disabled = false;
                        btnStart.innerHTML = '<span class="material-symbols-outlined text-[16px]">rocket_launch</span><span>Cập Nhật Lên v' + data.latestVersion + '</span>';
                    }
                } else {
                    badge.className = "text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                    badge.innerHTML = '<span class="size-2 rounded-full bg-emerald-400"></span> Bản hiện tại là mới nhất';
                    if (btnStart && !data.isBusy) {
                        btnStart.innerHTML = '<span class="material-symbols-outlined text-[16px]">refresh</span><span>Cài Đặt Lại & Kiểm Thử</span>';
                    }
                }
            }
        }

        function startUpdate() {
            const btnStart = document.getElementById("__9r_upd_btn_start");
            if (btnStart) {
                btnStart.disabled = true;
                btnStart.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">sync</span><span>Đang cập nhật...</span>';
            }

            fetch("/api/oauth/codex/bulk-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start_update" })
            })
            .then(r => r.json())
            .then(data => {
                startPolling();
            })
            .catch(err => {
                alert("Lỗi kích hoạt cập nhật: " + err.message);
                if (btnStart) btnStart.disabled = false;
            });
        }

        function startPolling() {
            if (pollTimer) clearInterval(pollTimer);
            pollProgress();
            pollTimer = setInterval(pollProgress, 1200);
        }

        function stopPolling() {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        }

        function pollProgress() {
            fetch("/api/oauth/codex/bulk-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "get_update_progress", lineCount: 100 })
            })
            .then(r => r.json())
            .then(data => {
                renderProgress(data);
                if (data.status === "completed") {
                    stopPolling();
                    triggerReloadCountdown();
                } else if (data.status === "failed") {
                    stopPolling();
                    const btnStart = document.getElementById("__9r_upd_btn_start");
                    if (btnStart) {
                        btnStart.disabled = false;
                        btnStart.innerHTML = '<span class="material-symbols-outlined text-[16px]">replay</span><span>Thử lại cập nhật</span>';
                    }
                }
            })
            .catch(err => {});
        }

        function renderProgress(data) {
            const msgEl = document.getElementById("__9r_upd_msg");
            const pctEl = document.getElementById("__9r_upd_pct");
            const barEl = document.getElementById("__9r_upd_bar");
            const logEl = document.getElementById("__9r_upd_logs");
            const step1 = document.getElementById("__9r_step_1");
            const step2 = document.getElementById("__9r_step_2");
            const step3 = document.getElementById("__9r_step_3");
            const step4 = document.getElementById("__9r_step_4");

            const pct = typeof data.progressPercent === "number" ? data.progressPercent : 0;
            if (pctEl) pctEl.textContent = pct + "%";
            if (barEl) barEl.style.width = pct + "%";
            if (msgEl && data.message) msgEl.textContent = data.message;

            const setStepState = (el, active, done) => {
                if (!el) return;
                if (done) {
                    el.className = "p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300";
                } else if (active) {
                    el.className = "p-2 rounded-lg bg-[#1c2333] border border-emerald-500 text-white shadow-md shadow-emerald-900/20 animate-pulse";
                } else {
                    el.className = "p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-gray-400";
                }
            };

            setStepState(step1, pct >= 10 && pct < 30, pct >= 30);
            setStepState(step2, pct >= 30 && pct < 70, pct >= 70);
            setStepState(step3, pct >= 70 && pct < 90, pct >= 90);
            setStepState(step4, pct >= 90 && pct < 100, pct >= 100);

            if (logEl && Array.isArray(data.logs)) {
                const wasBottom = logEl.scrollHeight - logEl.scrollTop <= logEl.clientHeight + 40;
                logEl.textContent = data.logs.join(String.fromCharCode(10)) || "Chưa có dữ liệu log.";
                if (wasBottom || pct > 0) {
                    logEl.scrollTop = logEl.scrollHeight;
                }
            }
        }

        function triggerReloadCountdown() {
            let sec = 3;
            const msgEl = document.getElementById("__9r_upd_msg");
            if (countdownTimer) clearInterval(countdownTimer);
            countdownTimer = setInterval(() => {
                if (msgEl) msgEl.textContent = "🎉 Cập nhật thành công! Đang tải lại trang sau " + sec + " giây...";
                sec--;
                if (sec < 0) {
                    clearInterval(countdownTimer);
                    window.location.reload();
                }
            }, 1000);
        }

        function loadConfig() {
            fetch("/api/oauth/codex/bulk-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "get_update_config" })
            })
            .then(r => r.json())
            .then(cfg => {
                const chk = document.getElementById("__9r_cfg_auto_apply");
                const hStart = document.getElementById("__9r_cfg_hour_start");
                const hEnd = document.getElementById("__9r_cfg_hour_end");
                const interval = document.getElementById("__9r_cfg_interval");

                if (chk) chk.checked = Boolean(cfg.autoApplyUpdate);
                if (hStart && typeof cfg.autoUpdateHourStart === "number") hStart.value = cfg.autoUpdateHourStart;
                if (hEnd && typeof cfg.autoUpdateHourEnd === "number") hEnd.value = cfg.autoUpdateHourEnd;
                if (interval && typeof cfg.updateCheckIntervalMinutes === "number") interval.value = cfg.updateCheckIntervalMinutes;
            })
            .catch(err => {});
        }

        function saveConfig() {
            const chk = document.getElementById("__9r_cfg_auto_apply");
            const hStart = document.getElementById("__9r_cfg_hour_start");
            const hEnd = document.getElementById("__9r_cfg_hour_end");
            const interval = document.getElementById("__9r_cfg_interval");
            const btnSave = document.getElementById("__9r_upd_btn_save_cfg");

            const newCfg = {
                autoApplyUpdate: chk ? chk.checked : false,
                autoUpdateHourStart: hStart ? parseInt(hStart.value, 10) : 3,
                autoUpdateHourEnd: hEnd ? parseInt(hEnd.value, 10) : 5,
                updateCheckIntervalMinutes: interval ? parseInt(interval.value, 10) : 60,
            };

            if (btnSave) {
                btnSave.disabled = true;
                btnSave.innerHTML = '<span class="material-symbols-outlined text-[15px] animate-spin">sync</span> Đang lưu...';
            }

            fetch("/api/oauth/codex/bulk-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "save_update_config", config: newCfg })
            })
            .then(r => r.json())
            .then(saved => {
                if (btnSave) {
                    btnSave.innerHTML = '<span class="material-symbols-outlined text-[15px]">check</span> Đã lưu!';
                    setTimeout(() => {
                        btnSave.disabled = false;
                        btnSave.innerHTML = '<span class="material-symbols-outlined text-[15px]">save</span> Lưu cấu hình';
                    }, 1500);
                }
            })
            .catch(err => {
                alert("Lỗi lưu cấu hình: " + err.message);
                if (btnSave) btnSave.disabled = false;
            });
        }

        window.__9rOpenUpdateModal = openModal;
        window.__9rCloseUpdateModal = closeModal;
    })();
    `;
}

module.exports = {
    getUpdateModalScript,
};
