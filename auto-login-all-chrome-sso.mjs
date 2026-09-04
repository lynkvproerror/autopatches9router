import http from 'http';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// =============================================================
// REAL-TIME DUAL LOGGER (Console + logs/auto-login.log)
// =============================================================
const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const LOG_DIR = path.join(SCRIPT_DIR, 'logs');
if (!fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}
const LOG_FILE = path.join(LOG_DIR, 'auto-login.log');

const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;

function formatLogStr(...args) {
  return args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\n';
}

function appendLog(str) {
  try { fs.appendFileSync(LOG_FILE, str, 'utf8'); } catch {}
}

console.log = function (...args) {
  origLog.apply(console, args);
  appendLog(`[${new Date().toLocaleTimeString('vi-VN')}] ` + formatLogStr(...args));
};

console.error = function (...args) {
  origErr.apply(console, args);
  appendLog(`[${new Date().toLocaleTimeString('vi-VN')} ERROR] ` + formatLogStr(...args));
};

console.warn = function (...args) {
  origWarn.apply(console, args);
  appendLog(`[${new Date().toLocaleTimeString('vi-VN')} WARN] ` + formatLogStr(...args));
};

let puppeteer = null;
const puppeteerCandidates = [
  'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/node_modules/puppeteer-core',
  path.join(SCRIPT_DIR, '..', '..', 'dashboard', 'node_modules', 'puppeteer-core'),
  'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/node_modules/puppeteer-core',
  'puppeteer-core'
];
for (const p of puppeteerCandidates) {
  try {
    puppeteer = require(p);
    if (puppeteer) break;
  } catch {}
}

// Import VPS Webmail helper for real-time OTP/Verification recovery
let vpsMail = null;
try {
  const { pathToFileURL } = require('url');
  const vpsCandidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/vps_mail.js',
    path.join(SCRIPT_DIR, '..', '..', 'dashboard', 'vps_mail.js'),
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/vps_mail.js'
  ];
  const vpsFile = vpsCandidates.find(f => fs.existsSync(f));
  if (vpsFile) {
    vpsMail = await import(pathToFileURL(vpsFile).href);
    console.log('📬 [Webmail Engine] Đã kích hoạt kết nối Roundcube Webmail Auto-Recovery ✅');
  }
} catch (e) {
  console.warn('⚠️ [Webmail Engine] Không thể nạp vps_mail.js:', e.message);
}

function findChromeExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'chrome.exe';
}

function getNineRouterDbPath() {
  const localDb = 'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/9router/data/data.sqlite';
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  const candidate = path.join(appData, '9router', 'db', 'data.sqlite');
  if (fs.existsSync(candidate)) return candidate;
  if (fs.existsSync(localDb)) return localDb;
  return candidate;
}

function getChatgptAccountsPath() {
  const candidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_accounts.json',
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/data/chatgpt_accounts.json',
    path.join(SCRIPT_DIR, '..', '..', 'dashboard', 'data', 'chatgpt_accounts.json'),
    path.join(SCRIPT_DIR, '..', '..', 'data', 'chatgpt_accounts.json'),
    path.join(process.cwd(), 'dashboard', 'data', 'chatgpt_accounts.json'),
    path.join(process.cwd(), 'data', 'chatgpt_accounts.json'),
    path.join(process.cwd(), 'chatgpt_accounts.json'),
    'd:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/chatgpt_accounts.json',
    'd:/Music/Ruby/Produce for Customer/Tools/Automation Browser/data/chatgpt_accounts.json'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// RFC 6238 TOTP generator with Clock-Drift Compensation (Zero dependency)
function generateTOTP(secret, timeStepOffset = 0) {
  if (!secret) return null;
  try {
    const cleanSecret = String(secret).replace(/[\s-]+/g, '').toUpperCase();
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (let i = 0; i < cleanSecret.length; i++) {
      const val = base32chars.indexOf(cleanSecret.charAt(i));
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    const key = Buffer.from(bytes);
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epoch / 30) + timeStepOffset;
    const time = Buffer.alloc(8);
    time.writeBigInt64BE(BigInt(timeStep));
    const hmac = crypto.createHmac('sha1', key).update(time).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 | (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
    return code.toString().padStart(6, '0');
  } catch (e) {
    return null;
  }
}

// Record detailed account issues (Wrong Pass, Wrong 2FA, etc.) in JSON and DB
function syncAccountIssueDetails(email, reasonCode, reasonDetail) {
  const normEmail = normalizeEmail(email);
  if (!normEmail) return;

  const healthCandidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_account_health.json',
    path.join(SCRIPT_DIR, '..', '..', 'dashboard', 'data', 'chatgpt_account_health.json'),
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/chatgpt_account_health.json'
  ];
  for (const hp of healthCandidates) {
    if (fs.existsSync(hp)) {
      try {
        const healthData = JSON.parse(fs.readFileSync(hp, 'utf8'));
        if (!healthData.records) healthData.records = {};
        healthData.records[normEmail] = {
          accountStatus: reasonCode.toLowerCase(),
          reason: reasonDetail,
          reasonCode: reasonCode,
          lastCheckedAt: new Date().toISOString(),
          lastCheckMode: 'auto_login_dom_detector',
          email: normEmail
        };
        healthData.updatedAt = new Date().toISOString();
        fs.writeFileSync(hp, JSON.stringify(healthData, null, 2), 'utf8');
      } catch {}
    }
  }

  const accountsCandidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_accounts.json',
    path.join(SCRIPT_DIR, '..', '..', 'dashboard', 'data', 'chatgpt_accounts.json'),
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/chatgpt_accounts.json'
  ];
  for (const ap of accountsCandidates) {
    if (fs.existsSync(ap)) {
      try {
        const accountsList = JSON.parse(fs.readFileSync(ap, 'utf8'));
        for (const acc of accountsList) {
          if (normalizeEmail(acc.email) === normEmail) {
            acc.accountStatus = reasonCode.toLowerCase();
            acc.accountStatusReason = reasonDetail;
            acc.accountStatusReasonCode = reasonCode;
            acc.lastCheckedAt = new Date().toISOString();
            break;
          }
        }
        fs.writeFileSync(ap, JSON.stringify(accountsList, null, 2), 'utf8');
      } catch {}
    }
  }
}

// =============================================================
// HUMAN PHYSICS & NATURAL INTERACTION SIMULATION
// =============================================================
const sleep = ms => new Promise(r => setTimeout(r, ms));

let currentMousePosition = { x: 200, y: 200 };

// -------------------------------------------------------------
// Human Interaction Physics & Pacing Engine (Humanize v2)
// Modeled on GPT-Register-Tool (turb-gpt-free-register & sms_tool/humanize.py)
// -------------------------------------------------------------

const HUMANIZE_DELAYS = {
  page_settle: { base: 500, jitter: 0.5 },    // 250 .. 750ms
  click: { base: 250, jitter: 0.6 },          // 100 .. 400ms
  click_hold: { base: 75, jitter: 0.35 },      // 48 .. 102ms (mechanical button down hold)
  pre_input: { base: 280, jitter: 0.45 },     // 154 .. 406ms (eye-hand acquisition)
  post_input: { base: 320, jitter: 0.45 },    // 176 .. 464ms (post-typing check)
  state_probe: { base: 250, jitter: 0.6 },    // 100 .. 400ms
  retry: { base: 400, jitter: 0.5 },          // 200 .. 600ms
  stage_think: { base: 800, jitter: 0.4 },    // 480 .. 1120ms (cognitive transition)
  default: { base: 300, jitter: 0.5 }         // 150 .. 450ms
};

async function humanizeDelay(kind = 'default', { factor = 1.0, baseline = null, jitter = null } = {}) {
  const def = HUMANIZE_DELAYS[kind] || HUMANIZE_DELAYS.default;
  const base = baseline !== null ? baseline : def.base;
  const spread = Math.min(Math.max(jitter !== null ? jitter : def.jitter, 0.0), 1.0);
  const currentFactor = factor > 0 ? factor : 1.0;
  const randomFactor = (1.0 - spread) + Math.random() * (2.0 * spread);
  const ms = Math.max(10, Math.round(base * currentFactor * randomFactor));
  await sleep(ms);
  return ms;
}

const STAGE_THINK_RANGES_MS = {
  post_sentinel: [600, 1800],
  post_credentials: [800, 2200],
  post_create_account: [900, 2600],
  pre_2fa_probe: [700, 2200],
  workspace_consent: [600, 1500],
  default: [500, 1600]
};

async function thinkStage(stageLabel = 'default', { factor = 1.0 } = {}) {
  const range = STAGE_THINK_RANGES_MS[stageLabel] || STAGE_THINK_RANGES_MS.default;
  const lo = range[0];
  const hi = range[1];
  const currentFactor = factor > 0 ? factor : 1.0;
  const rawMs = lo + Math.random() * (hi - lo);
  const ms = Math.round(rawMs * currentFactor);
  await sleep(ms);
  return ms;
}

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const cx = 3 * (p1.x - p0.x);
  const bx = 3 * (p2.x - p1.x) - cx;
  const ax = p3.x - p0.x - cx - bx;

  const cy = 3 * (p1.y - p0.y);
  const by = 3 * (p2.y - p1.y) - cy;
  const ay = p3.y - p0.y - cy - by;

  const xt = ax * Math.pow(t, 3) + bx * Math.pow(t, 2) + cx * t + p0.x;
  const yt = ay * Math.pow(t, 3) + by * Math.pow(t, 2) + cy * t + p0.y;

  return { x: Math.round(xt), y: Math.round(yt) };
}

async function humanMouseMove(page, targetX, targetY, { minSteps = 14, maxSteps = 28 } = {}) {
  if (!page || !page.mouse || typeof page.mouse.move !== 'function') return;
  const start = { ...currentMousePosition };
  const target = { x: Math.round(targetX), y: Math.round(targetY) };
  const dist = Math.hypot(target.x - start.x, target.y - start.y);

  if (dist < 4) {
    currentMousePosition = target;
    await page.mouse.move(target.x, target.y).catch(() => {});
    return;
  }

  const deviation = Math.min(dist * 0.35, 110);
  const cp1 = {
    x: start.x + (target.x - start.x) * (0.25 + Math.random() * 0.15) + ((Math.random() - 0.5) * deviation),
    y: start.y + (target.y - start.y) * (0.25 + Math.random() * 0.15) + ((Math.random() - 0.5) * deviation)
  };
  const cp2 = {
    x: start.x + (target.x - start.x) * (0.60 + Math.random() * 0.15) + ((Math.random() - 0.5) * deviation),
    y: start.y + (target.y - start.y) * (0.60 + Math.random() * 0.15) + ((Math.random() - 0.5) * deviation)
  };

  const steps = Math.min(maxSteps, Math.max(minSteps, Math.round(Math.sqrt(dist) * 2.2)));
  const willOvershoot = dist > 220 && Math.random() < 0.45;
  const overshootMultiplier = willOvershoot ? (1.02 + Math.random() * 0.03) : 1.0;
  const actualTarget = willOvershoot ? {
    x: Math.round(start.x + (target.x - start.x) * overshootMultiplier),
    y: Math.round(start.y + (target.y - start.y) * overshootMultiplier)
  } : target;

  for (let i = 1; i <= steps; i++) {
    const rawProgress = i / steps;
    const easedT = (1 - Math.cos(rawProgress * Math.PI)) / 2;
    const pt = cubicBezierPoint(start, cp1, cp2, actualTarget, easedT);

    const tremorX = (Math.random() - 0.5) * (i < steps ? 1.5 : 0.5);
    const tremorY = (Math.random() - 0.5) * (i < steps ? 1.5 : 0.5);

    const moveX = Math.round(pt.x + tremorX);
    const moveY = Math.round(pt.y + tremorY);

    await page.mouse.move(moveX, moveY).catch(() => {});
    currentMousePosition = { x: moveX, y: moveY };

    const stepDelay = Math.floor(5 + Math.random() * 10);
    await sleep(stepDelay);
  }

  if (willOvershoot) {
    await sleep(Math.floor(25 + Math.random() * 40));
    await page.mouse.move(target.x, target.y).catch(() => {});
  }

  currentMousePosition = target;
}

async function humanClick(page, elementOrSelector, { preDelay = null, postDelay = null } = {}) {
  if (!page) return false;
  let element = elementOrSelector;
  if (typeof elementOrSelector === 'string') {
    element = await page.$(elementOrSelector).catch(() => null);
  }
  if (!element) return false;

  try {
    const isVisible = await page.evaluate(el => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }, element).catch(() => false);
    if (!isVisible) return false;

    const box = await element.boundingBox().catch(() => null);
    if (!box || box.width === 0 || box.height === 0) {
      await element.click().catch(() => {});
      return true;
    }

    const targetX = Math.round(box.x + box.width * (0.25 + Math.random() * 0.50));
    const targetY = Math.round(box.y + box.height * (0.25 + Math.random() * 0.50));

    await humanMouseMove(page, targetX, targetY);

    const beforeClickMs = preDelay !== null ? preDelay : await humanizeDelay('click', { baseline: 180, jitter: 0.4 });

    await page.mouse.down().catch(() => {});
    await humanizeDelay('click_hold');
    await page.mouse.up().catch(() => {});

    const afterClickMs = postDelay !== null ? postDelay : await humanizeDelay('click', { baseline: 160, jitter: 0.45 });
    return true;
  } catch (err) {
    try { await element.click(); } catch {}
    return true;
  }
}

const QWERTY_ADJACENT = {
  a: 'qwsz', b: 'vghn', c: 'xdfv', d: 'ersfxc', e: 'wsdr', f: 'rtgvcd',
  g: 'tyhbvf', h: 'yujnbg', i: 'ujko', j: 'uikmnh', k: 'ijolm', l: 'okp',
  m: 'njk', n: 'bhjm', o: 'iklp', p: 'ol', q: 'wa', r: 'edft', s: 'wedxza',
  t: 'rfgy', u: 'yhji', v: 'cfgb', w: 'qase', x: 'zsdc', y: 'tghu', z: 'asx',
  '1': '2q', '2': '13qw', '3': '24we', '4': '35er', '5': '46rt',
  '6': '57ty', '7': '68yu', '8': '79ui', '9': '80io', '0': '9-op'
};

async function humanType(page, elementOrSelector, text, { minDelay = 35, maxDelay = 90, clearFirst = true, allowTypos = false } = {}) {
  if (!page || !text) return false;
  let element = elementOrSelector;
  if (typeof elementOrSelector === 'string') {
    element = await page.$(elementOrSelector).catch(() => null);
  }
  if (!element) return false;

  await humanClick(page, element, { preDelay: 100, postDelay: 100 });

  if (clearFirst) {
    await page.keyboard.down('Control').catch(() => {});
    await page.keyboard.press('KeyA').catch(() => {});
    await page.keyboard.up('Control').catch(() => {});
    await sleep(40 + Math.random() * 30);
    await page.keyboard.press('Backspace').catch(() => {});
    await sleep(50 + Math.random() * 60);
  }

  await humanizeDelay('pre_input');

  let burstCount = 0;
  const burstLimit = 3 + Math.floor(Math.random() * 4);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const lower = char.toLowerCase();

    if (allowTypos && QWERTY_ADJACENT[lower] && Math.random() < 0.02 && i < text.length - 1) {
      const adjacentList = QWERTY_ADJACENT[lower];
      const typoChar = adjacentList[Math.floor(Math.random() * adjacentList.length)];
      await page.keyboard.type(typoChar);
      await sleep(Math.floor(90 + Math.random() * 120));
      await page.keyboard.press('Backspace');
      await sleep(Math.floor(70 + Math.random() * 80));
    }

    await page.keyboard.type(char);
    burstCount++;

    let charDelay = Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
    if ('aeioutnrsl'.includes(lower)) {
      charDelay = Math.max(25, charDelay - 15);
    }
    if ('@._-!#$%^&*()'.includes(char) || (char >= 'A' && char <= 'Z')) {
      charDelay += Math.floor(40 + Math.random() * 65);
    }
    if (burstCount >= burstLimit) {
      charDelay += Math.floor(110 + Math.random() * 160);
      burstCount = 0;
    }
    await sleep(charDelay);
  }

  await humanizeDelay('post_input');
  return true;
}

async function findAndClickSubmitButton(page, label = 'Submit') {
  if (!page) return false;
  const buttonSelectors = [
    'button[data-testid="workspace-select-button"]',
    'button[data-testid="consent-submit-button"]',
    'button[name="action"][value="consent"]',
    'button[value="authorize"]',
    'button[name="intent"][value="default"]',
    'button[type="submit"]',
    'button[name="action"][value="default"]',
    'button.continue-btn',
    'button[data-action-button-primary="true"]',
    'button._button-login-password',
    'button._button-login-id',
    'button'
  ];

  for (const sel of buttonSelectors) {
    const buttons = await page.$$(sel).catch(() => []);
    for (const btn of buttons) {
      const isCandidate = await page.evaluate(el => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const txt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (type === 'submit') return true;
        return txt.includes('continue') || txt.includes('tiếp tục') || txt.includes('log in') || txt.includes('đăng nhập') || txt.includes('verify') || txt.includes('xác nhận') || txt.includes('allow') || txt.includes('authorize') || txt.includes('cho phép');
      }, btn).catch(() => false);

      if (isCandidate) {
        const clicked = await humanClick(page, btn);
        if (clicked) {
          console.log(`🖱️ [Human Click] Tự động di chuyển chuột & Click nút [${label}]!`);
          return true;
        }
      }
    }
  }

  await sleep(250 + Math.random() * 250);
  await page.keyboard.press('Enter').catch(() => {});
  console.log(`⌨️ [Human Key] Đã nhấn phím Enter để tiếp tục [${label}]!`);
  return true;
}

function ensurePort1455Free() {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      if (line.includes(':1455') && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== String(process.pid) && pid !== '0') {
          console.log(`🧹 [Port 1455] Tự động giải phóng cổng 1455 (đang bị giữ bởi PID ${pid})...`);
          try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          } catch {}
        }
      }
    }
  } catch {}
}

// =============================================================
// COOKIE & SESSION EXPORT FOR IMAGE GENERATION & WEB APIS
// =============================================================
function extractChatGPTPlanType(tokenData) {
  if (!tokenData) return 'free';
  
  // 1. Try access_token first (contains direct chatgpt_plan_type claim)
  const at = tokenData.access_token || tokenData.accessToken;
  if (at && typeof at === 'string') {
    try {
      const parts = at.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const auth = payload['https://api.openai.com/auth'] || {};
        const p = auth.chatgpt_plan_type || auth.plan_type || auth.planType || payload.chatgpt_plan_type || payload.plan_type;
        if (p) return String(p).toLowerCase().trim();
      }
    } catch {}
  }

  // 2. Try id_token
  const it = tokenData.id_token || tokenData.idToken;
  if (it && typeof it === 'string') {
    try {
      const parts = it.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const auth = payload['https://api.openai.com/auth'] || {};
        const p = auth.chatgpt_plan_type || auth.plan_type || auth.planType || payload.chatgpt_plan_type || payload.plan_type;
        if (p) return String(p).toLowerCase().trim();
      }
    } catch {}
  }

  // 3. Try direct fields if present
  if (tokenData.planType) return String(tokenData.planType).toLowerCase().trim();
  if (tokenData.plan_type) return String(tokenData.plan_type).toLowerCase().trim();
  if (tokenData.chatgptPlanType) return String(tokenData.chatgptPlanType).toLowerCase().trim();
  if (tokenData.chatgpt_plan_type) return String(tokenData.chatgpt_plan_type).toLowerCase().trim();

  return 'free';
}

function exportSessionAndCookies(email, tokenData, cookies = []) {
  try {
    const targetDirs = [
      'D:/Music/Ruby/Produce for Customer/Tools/ChatGPT/Cookies',
      'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/cookies',
      'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/cookies'
    ];

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const idTokenParsed = parseJwt(tokenData?.id_token || '');
    const chatgptAccountId = idTokenParsed['https://api.openai.com/auth']?.user_id || email;
    const planType = extractChatGPTPlanType(tokenData);
    const now = new Date().toISOString();

    const cookieString = Array.isArray(cookies) 
      ? cookies.map(c => `${c.name}=${c.value}`).join('; ')
      : '';

    const sessionPayload = {
      email,
      chatgptAccountId,
      planType,
      accessToken: tokenData?.access_token || '',
      refreshToken: tokenData?.refresh_token || '',
      idToken: tokenData?.id_token || '',
      expiresIn: tokenData?.expires_in || 0,
      expiresAt: tokenData?.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : (tokenData?.expiresAt || null),
      savedAt: now,
      cookieHeader: cookieString,
      cookies: cookies || [],
      session: {
        user: {
          id: chatgptAccountId,
          name: idTokenParsed.name || email,
          email: email,
          image: idTokenParsed.picture || ''
        },
        expires: tokenData?.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : (tokenData?.expiresAt || null),
        accessToken: tokenData?.access_token || '',
        authProvider: 'auth0'
      }
    };

    const sanitizedEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');

    for (const dir of targetDirs) {
      const filePath = path.join(dir, `${sanitizedEmail}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sessionPayload, null, 2), 'utf8');

      if (cookieString) {
        const txtPath = path.join(dir, `${sanitizedEmail}_cookies.txt`);
        fs.writeFileSync(txtPath, cookieString, 'utf8');
      }
    }

    console.log(`🍪 [EXPORT COOKIES & SESSION] ✅ Đã lưu session/cookies cho: ${email} -> Tools\\ChatGPT\\Cookies\\${sanitizedEmail}.json`);
  } catch (err) {
    console.error(`⚠️ Lỗi khi xuất cookie/session cho ${email}:`, err.message);
  }
}

function exportAllDbSessions() {
  const dbPath = getNineRouterDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) return 0;

  let count = 0;
  const allSessionsMap = {};
  const nineRouterConnectionsList = [];

  try {
    const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
    const rows = db.prepare("SELECT id, name, email, priority, isActive, data, createdAt, updatedAt FROM providerConnections WHERE provider = 'codex'").all();
    db.close();

    for (const r of rows) {
      let parsed = {};
      try { parsed = JSON.parse(r.data || '{}'); } catch {}
      const email = normalizeEmail(r.email || r.name);
      if (email && parsed.accessToken) {
        exportSessionAndCookies(email, {
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
          id_token: parsed.idToken,
          expiresAt: parsed.expiresAt
        }, []);
        
        allSessionsMap[email] = {
          email,
          planType: parsed.providerSpecificData?.chatgptPlanType || 'plus',
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          idToken: parsed.idToken,
          expiresAt: parsed.expiresAt,
          isActive: r.isActive === 1
        };

        nineRouterConnectionsList.push({
          id: r.id,
          name: r.name,
          email: r.email,
          provider: 'codex',
          priority: r.priority,
          isActive: r.isActive === 1,
          data: parsed
        });

        count++;
      }
    }

    const targetDirs = [
      'D:/Music/Ruby/Produce for Customer/Tools/ChatGPT/Cookies',
      'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/cookies'
    ];

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'all_sessions.json'), JSON.stringify(allSessionsMap, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, '9router_codex_connections.json'), JSON.stringify(nineRouterConnectionsList, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Lỗi xuất session từ DB:', err.message);
  }
  return count;
}

// Sync Deactivated Account to Automation Browser & Delete OAuth Token in 9Router
function handleAccountDeactivatedSync(email, reason = 'Deactivated by OpenAI') {
  const normEmail = normalizeEmail(email);
  if (!normEmail) return;

  console.log('\n' + '='.repeat(75));
  console.log(`⛔ [DEACTIVATED DETECTED] Phát hiện tài khoản bị OpenAI khóa/deactivated: ${normEmail}`);
  console.log(`   Lý do: ${reason}`);

  // 1. DELETE from 9Router Database (Xóa OAuth Token khỏi TẤT CẢ các bản 9Router DB)
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  const dbCandidates = [
    path.join(appData, '9router', 'db', 'data.sqlite'),
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/9router/data/data.sqlite',
    path.join(SCRIPT_DIR, '..', 'data', 'data.sqlite')
  ];
  for (const dbPath of dbCandidates) {
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        const db = new DatabaseSync(dbPath, { open: true });
        const delRes = db.prepare("DELETE FROM providerConnections WHERE provider = 'codex' AND (LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?))").run(normEmail, normEmail);
        db.close();
        if (delRes.changes > 0) {
          console.log(`   🗑️ [9Router DB: ${path.basename(path.dirname(dbPath))}] ĐÃ XÓA ${delRes.changes} kết nối OAuth token cũ trong 9Router database!`);
        } else {
          console.log(`   ℹ️ [9Router DB: ${path.basename(path.dirname(dbPath))}] Tài khoản chưa có hoặc đã được xóa trước đó.`);
        }
      } catch (err) {
        console.error(`   ⚠️ [9Router DB] Lỗi xóa OAuth token: ${err.message}`);
      }
    }
  }

  // 2. Sync into Automation Browser: chatgpt_account_health.json
  const healthCandidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_account_health.json',
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/VPS/dashboard/data/chatgpt_account_health.json',
    path.join(SCRIPT_DIR, '..', '..', 'dashboard', 'data', 'chatgpt_account_health.json'),
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/chatgpt_account_health.json'
  ];
  for (const hp of healthCandidates) {
    if (fs.existsSync(hp)) {
      try {
        const healthData = JSON.parse(fs.readFileSync(hp, 'utf8'));
        if (!healthData.records) healthData.records = {};
        healthData.records[normEmail] = {
          accountStatus: 'deactivated',
          reason: reason || 'Tài khoản đã bị OpenAI vô hiệu hóa hoặc xóa (account_deactivated).',
          reasonCode: 'ACCOUNT_DEACTIVATED',
          lastCheckedAt: new Date().toISOString(),
          lastCheckMode: 'auto_login_sync',
          email: normEmail
        };
        healthData.updatedAt = new Date().toISOString();
        fs.writeFileSync(hp, JSON.stringify(healthData, null, 2), 'utf8');
        console.log(`   🔄 [Automation Browser] Đã cập nhật ${path.basename(hp)} -> DEACTIVATED`);
      } catch (err) {
        console.error(`   ⚠️ [Automation Browser] Lỗi cập nhật ${hp}: ${err.message}`);
      }
    }
  }

  // 3. Sync into Automation Browser: chatgpt_accounts.json
  const accountsCandidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_accounts.json',
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/VPS/dashboard/data/chatgpt_accounts.json',
    path.join(SCRIPT_DIR, '..', '..', 'dashboard', 'data', 'chatgpt_accounts.json'),
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/chatgpt_accounts.json'
  ];
  for (const ap of accountsCandidates) {
    if (fs.existsSync(ap)) {
      try {
        const accountsList = JSON.parse(fs.readFileSync(ap, 'utf8'));
        let found = false;
        for (const acc of accountsList) {
          if (normalizeEmail(acc.email) === normEmail) {
            acc.accountStatus = 'deactivated';
            acc.status = 'deactivated';
            acc.accountStatusReason = reason || 'Tài khoản đã bị OpenAI vô hiệu hóa hoặc xóa (account_deactivated).';
            acc.accountStatusReasonCode = 'ACCOUNT_DEACTIVATED';
            acc.lastCheckedAt = new Date().toISOString();
            acc.nineRouterConnected = false;
            if (acc.nineRouter) {
              acc.nineRouter.connected = false;
              acc.nineRouter.isActive = false;
              acc.nineRouter.deletedAt = new Date().toISOString();
            }
            found = true;
            break;
          }
        }
        if (found) {
          fs.writeFileSync(ap, JSON.stringify(accountsList, null, 2), 'utf8');
          console.log(`   🔄 [Automation Browser] Đã cập nhật ${path.basename(ap)} -> DEACTIVATED`);
        }
      } catch (err) {
        console.error(`   ⚠️ [Automation Browser] Lỗi cập nhật ${ap}: ${err.message}`);
      }
    }
  }

  // 4. Clean up session and cookie files
  const sanitizedEmail = normEmail.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetDirs = [
    'D:/Music/Ruby/Produce for Customer/Tools/ChatGPT/Cookies',
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/data/cookies'
  ];
  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      try {
        const jsonFile = path.join(dir, `${sanitizedEmail}.json`);
        const txtFile = path.join(dir, `${sanitizedEmail}_cookies.txt`);
        if (fs.existsSync(jsonFile)) {
          try {
            const sess = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
            sess.status = 'deactivated';
            sess.accountStatus = 'deactivated';
            sess.error = reason;
            sess.deactivatedAt = new Date().toISOString();
            fs.writeFileSync(jsonFile, JSON.stringify(sess, null, 2), 'utf8');
          } catch {}
        }
        if (fs.existsSync(txtFile)) {
          try { fs.unlinkSync(txtFile); } catch {}
        }

        const allSessFile = path.join(dir, 'all_sessions.json');
        if (fs.existsSync(allSessFile)) {
          try {
            const allSess = JSON.parse(fs.readFileSync(allSessFile, 'utf8'));
            delete allSess[normEmail];
            fs.writeFileSync(allSessFile, JSON.stringify(allSess, null, 2), 'utf8');
          } catch {}
        }

        const connFile = path.join(dir, '9router_codex_connections.json');
        if (fs.existsSync(connFile)) {
          try {
            let conns = JSON.parse(fs.readFileSync(connFile, 'utf8'));
            conns = conns.filter(c => normalizeEmail(c.email || c.name) !== normEmail);
            fs.writeFileSync(connFile, JSON.stringify(conns, null, 2), 'utf8');
          } catch {}
        }
      } catch (err) {
        console.error(`   ⚠️ [Cookies Dir] Lỗi cập nhật cookie files: ${err.message}`);
      }
    }
  }
  console.log('='.repeat(75) + '\n');
}

const markAccountDeactivatedInDb = handleAccountDeactivatedSync;

// Read 9Router Database with Detailed Error Matching
function getNineRouterDbMap() {
  const dbPath = getNineRouterDbPath();
  const dbConnections = new Map();
  if (!dbPath || !fs.existsSync(dbPath)) return dbConnections;

  try {
    const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
    const rows = db.prepare("SELECT id, name, email, priority, isActive, data, updatedAt FROM providerConnections WHERE provider = 'codex'").all();
    db.close();
    for (const r of rows) {
      const norm = normalizeEmail(r.email || r.name);
      if (norm) {
        let parsed = {};
        try { parsed = JSON.parse(r.data || '{}'); } catch {}
        
        const lastErrLower = String(parsed.lastError || '').toLowerCase();
        const testStatusLower = String(parsed.testStatus || '').toLowerCase();
        const isActive = r.isActive === 1 || r.isActive === true;

        const isDeactivated = lastErrLower.includes('deactivated') || testStatusLower === 'deactivated' || lastErrLower.includes('account_deactivated');
        const isTokenRevoked = !isDeactivated && (
          lastErrLower.includes('token invalid or revoked') ||
          lastErrLower.includes('invalid or revoked') ||
          lastErrLower.includes('revoked') ||
          lastErrLower.includes('token expired') ||
          lastErrLower.includes('failed: token') ||
          lastErrLower.includes('401') ||
          testStatusLower === 'error'
        );
        const isDisabled = !isActive && !isTokenRevoked && !isDeactivated;

        dbConnections.set(norm, {
          id: r.id,
          name: r.name,
          email: norm,
          isActive,
          isDisabled,
          isDeactivated,
          isTokenRevoked,
          priority: r.priority,
          accessToken: parsed.accessToken || null,
          refreshToken: parsed.refreshToken || null,
          testStatus: parsed.testStatus || (isTokenRevoked ? 'error' : (isDeactivated ? 'deactivated' : (isActive ? 'active' : 'disabled'))),
          planType: parsed.providerSpecificData?.chatgptPlanType || 'unknown',
          lastRefreshAt: parsed.lastRefreshAt || r.updatedAt,
          lastError: parsed.lastError || null,
          updatedAt: r.updatedAt
        });
      }
    }
  } catch (err) {
    console.warn('[DB] Error reading 9Router DB:', err.message);
  }
  return dbConnections;
}

// Unified Account Retrieval with Cross-Referencing
function getAllAccountsUnified() {
  const dbMap = getNineRouterDbMap();

  // 1. Chrome Profiles (Gmail SSO)
  const chromeUserData = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  const localStatePath = path.join(chromeUserData, 'Local State');
  let gmailList = [];

  if (fs.existsSync(localStatePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
      const profilesMap = state.profile?.info_cache || {};
      for (const [dir, info] of Object.entries(profilesMap)) {
        const email = normalizeEmail(info.user_name || info.hosted_domain || info.email || '');
        if (email && email.includes('@')) {
          const conn = dbMap.get(email);
          gmailList.push({
            type: 'gmail_sso',
            profileDir: dir,
            profileName: info.name || dir,
            email: email,
            gaiaName: info.gaia_name || '',
            in9Router: Boolean(conn),
            connectionId: conn ? conn.id : null,
            isActive: conn ? conn.isActive : false,
            isDeactivated: conn ? conn.isDeactivated : false,
            isTokenRevoked: conn ? conn.isTokenRevoked : false,
            testStatus: conn ? conn.testStatus : 'not_connected',
            planType: conn ? conn.planType : null,
            accessToken: conn ? conn.accessToken : null,
            refreshToken: conn ? conn.refreshToken : null,
            lastRefreshAt: conn ? conn.lastRefreshAt : null,
            lastError: conn ? conn.lastError : null
          });
        }
      }
    } catch {}
  }

  // 2. Domain / Subdomain Accounts (chatgpt_accounts.json)
  let domainList = [];
  const accFile = getChatgptAccountsPath();
  if (accFile && fs.existsSync(accFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(accFile, 'utf8'));
      for (const a of raw) {
        const email = normalizeEmail(a.email);
        if (email) {
          const conn = dbMap.get(email);
          const isDeactInFile = (String(a.status).toLowerCase() === 'deactivated' || String(a.accountStatus).toLowerCase() === 'deactivated' || a.isDeactivated === true);
          const isDeactivated = (conn ? conn.isDeactivated : false) || isDeactInFile;
          domainList.push({
            type: 'domain_incognito',
            email: email,
            password: a.password || '',
            twoFactorSecret: a.twoFactorSecret || a.totpSecret || '',
            in9Router: Boolean(conn),
            connectionId: conn ? conn.id : null,
            isActive: conn ? conn.isActive : false,
            isDeactivated: isDeactivated,
            isTokenRevoked: conn ? conn.isTokenRevoked : false,
            testStatus: conn ? conn.testStatus : (isDeactivated ? 'deactivated' : 'not_connected'),
            planType: conn ? conn.planType : null,
            accessToken: conn ? conn.accessToken : null,
            refreshToken: conn ? conn.refreshToken : null,
            lastRefreshAt: conn ? conn.lastRefreshAt : null,
            lastError: conn ? conn.lastError : null
          });
        }
      }
    } catch {}
  }

  return { gmailList, domainList, dbMap };
}

// 0-Quota Live Probe Test
async function checkCodexTokenLive(accessToken) {
  if (!accessToken) return { live: false, error: 'No access token' };
  try {
    const res = await fetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'OpenAI-Codex-CLI'
      },
      body: JSON.stringify({ input: [] }),
      signal: AbortSignal.timeout(6000)
    });

    if (res.status === 400 || res.status === 200 || res.ok) {
      return { live: true, status: res.status };
    }

    if (res.status === 401 || res.status === 403) {
      return { live: false, status: res.status, error: `Token invalid or revoked (HTTP ${res.status})` };
    }

    return { live: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return { live: true, note: 'Timeout (Server responding, assuming live)' };
    }
    return { live: false, error: err.message };
  }
}

// Auto Probe & Reactivate Alive Accounts
async function runAutoDetectionAndReactivation() {
  console.log('='.repeat(80));
  console.log('🔍 [AUTO-DETECT & REACTIVATE] BẮT ĐẦU KIỂM TRA TOÀN BỘ TÀI KHOẢN TRONG 9ROUTER...');
  console.log('='.repeat(80));

  const dbPath = getNineRouterDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    console.error('Không tìm thấy database 9Router.');
    return;
  }

  const db = new DatabaseSync(dbPath, { open: true });
  const rows = db.prepare("SELECT id, name, email, priority, isActive, data, updatedAt FROM providerConnections WHERE provider = 'codex'").all();

  console.log(`📊 Tổng số tài khoản trong Database 9Router: ${rows.length} tài khoản\n`);

  let alreadyActive = 0;
  let reactivated = 0;
  let confirmedDead = 0;
  let noToken = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = r.email || r.name;
    let parsed = {};
    try { parsed = JSON.parse(r.data || '{}'); } catch {}

    const isCurrentlyActive = r.isActive === 1 || r.isActive === true;
    const token = parsed.accessToken;

    if (!token) {
      noToken++;
      console.log(`[${i + 1}/${rows.length}] ⚪ ${email.padEnd(45)} -> KHÔNG CÓ TOKEN`);
      continue;
    }

    process.stdout.write(`[${i + 1}/${rows.length}] ⏳ ${email.padEnd(45)} -> Đang kiểm tra probe... `);
    const testResult = await checkCodexTokenLive(token);

    if (testResult.live) {
      exportSessionAndCookies(email, {
        access_token: token,
        refresh_token: parsed.refreshToken,
        id_token: parsed.idToken,
        expiresAt: parsed.expiresAt
      }, []);

      if (isCurrentlyActive) {
        alreadyActive++;
        console.log(`🟢 LIVE (Đang bật)`);
      } else {
        reactivated++;
        parsed.testStatus = 'active';
        parsed.lastError = null;
        const now = new Date().toISOString();
        db.prepare("UPDATE providerConnections SET isActive = 1, data = ?, updatedAt = ? WHERE id = ?")
          .run(JSON.stringify(parsed), now, r.id);
        console.log(`⚡ SỐNG LẠI! -> ĐÃ KÍCH HOẠT LẠI (isActive: 1)`);
      }
    } else {
      confirmedDead++;
      if (isCurrentlyActive) {
        parsed.testStatus = 'error';
        parsed.lastError = testResult.error || 'Token invalid or revoked';
        const now = new Date().toISOString();
        db.prepare("UPDATE providerConnections SET isActive = 0, data = ?, updatedAt = ? WHERE id = ?")
          .run(JSON.stringify(parsed), now, r.id);
        console.log(`🔴 CHẾT (${testResult.error}) -> ĐÃ TẮT (isActive: 0)`);
      } else {
        console.log(`🔴 CHẾT (${testResult.error}) -> GIỮ TẮT`);
      }
    }

    await new Promise(res => setTimeout(res, 200));
  }

  db.close();

  console.log('\n' + '='.repeat(80));
  console.log('📊 KẾT QUẢ QUÉT VÀ PHÂN LOẠI TÀI KHOẢN:');
  console.log(`  • 🟢 Tài khoản Live hoạt động tốt : ${alreadyActive}`);
  console.log(`  • ⚡ Đã TỰ ĐỘNG BẬT LẠI (Reactivated): ${reactivated}`);
  console.log(`  • 🔴 Tài khoản chết (Revoked/Lỗi): ${confirmedDead}`);
  console.log(`  • ⚪ Không có Token              : ${noToken}`);
  console.log(`  • 🌐 TỔNG SỐ TÀI KHOẢN HOẠT ĐỘNG : ${alreadyActive + reactivated} / ${rows.length}`);
  console.log('='.repeat(80) + '\n');
}

// Display Complete Cross-Reference Table
function displayDetailedCheckTable() {
  const { gmailList, domainList, dbMap } = getAllAccountsUnified();

  console.log('\n' + '='.repeat(95));
  console.log('📊 BẢNG ĐỐI CHIẾU TRẠNG THÁI TOÀN BỘ TÀI KHOẢN (GMAIL SSO & DOMAIN) VỚI 9ROUTER');
  console.log('='.repeat(95));

  console.log(`\n🌐 [1] TÀI KHOẢN GMAIL SSO TRÊN CHROME: ${gmailList.length} tài khoản`);
  console.log('┌' + '─'.repeat(12) + '┬' + '─'.repeat(42) + '┬' + '─'.repeat(36) + '┐');
  console.log('│ ' + 'CHROME'.padEnd(10) + ' │ ' + 'EMAIL GMAIL SSO'.padEnd(40) + ' │ ' + 'TRẠNG THÁI 9ROUTER'.padEnd(34) + ' │');
  console.log('├' + '─'.repeat(12) + '┼' + '─'.repeat(42) + '┼' + '─'.repeat(36) + '┤');

  let gmailLive = 0, gmailRevoked = 0, gmailMissing = 0;
  for (const p of gmailList) {
    let st = '';
    if (!p.in9Router) {
      gmailMissing++;
      st = '⚪ CHƯA ADD VÀO 9ROUTER';
    } else if (p.isTokenRevoked || p.isDeactivated) {
      gmailRevoked++;
      st = p.isTokenRevoked ? '🔴 TOKEN REVOKED (Cần Login)' : '🔴 DEACTIVATED (Cần Login)';
    } else {
      gmailLive++;
      st = `🟢 LIVE (${p.planType || 'active'})`;
    }
    console.log('│ ' + p.profileDir.padEnd(10) + ' │ ' + p.email.padEnd(40) + ' │ ' + st.padEnd(34) + ' │');
  }
  console.log('└' + '─'.repeat(12) + '┴' + '─'.repeat(42) + '┴' + '─'.repeat(36) + '┘');
  console.log(`  -> 🟢 Live: ${gmailLive} | 🔴 Revoked/Lỗi: ${gmailRevoked} | ⚪ Chưa Add: ${gmailMissing}\n`);

  console.log(`🏢 [2] TÀI KHOẢN DOMAIN/SUBDOMAIN (chatgpt_accounts.json): ${domainList.length} tài khoản`);
  console.log('┌' + '─'.repeat(48) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(30) + '┐');
  console.log('│ ' + 'EMAIL DOMAIN / SUBDOMAIN'.padEnd(46) + ' │ ' + '2FA TOTP'.padEnd(10) + ' │ ' + 'TRẠNG THÁI 9ROUTER'.padEnd(28) + ' │');
  console.log('├' + '─'.repeat(48) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(30) + '┤');

  let domLive = 0, domRevoked = 0, domMissing = 0;
  for (let i = 0; i < domainList.length; i++) {
    const d = domainList[i];
    let st = '';
    if (!d.in9Router) {
      domMissing++;
      st = '⚪ CHƯA ADD';
    } else if (d.isTokenRevoked || d.isDeactivated) {
      domRevoked++;
      st = d.isTokenRevoked ? '🔴 TOKEN REVOKED' : '🔴 DEACTIVATED';
    } else {
      domLive++;
      st = `🟢 LIVE (${d.planType || 'active'})`;
    }
    const totpTag = d.twoFactorSecret ? '✅ CÓ' : '❌ KHÔNG';
    if (i < 20 || !d.in9Router || d.isDeactivated || d.isTokenRevoked) {
      console.log('│ ' + d.email.padEnd(46) + ' │ ' + totpTag.padEnd(10) + ' │ ' + st.padEnd(28) + ' │');
    } else if (i === 20) {
      console.log('│ ' + '... và các tài khoản domain khác ...'.padEnd(46) + ' │ ' + '...'.padEnd(10) + ' │ ' + '...'.padEnd(28) + ' │');
    }
  }
  console.log('└' + '─'.repeat(48) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(30) + '┘');
  console.log(`  -> 🟢 Live: ${domLive} | 🔴 Revoked/Lỗi: ${domRevoked} | ⚪ Chưa Add: ${domMissing}\n`);

  console.log('-'.repeat(95));
  console.log('📈 TỔNG KẾT ĐỐI CHIẾU TOÀN BỘ HỆ THỐNG:');
  console.log(`  • 🟢 Tổng tài khoản Live (Hợp lệ)                : ${gmailLive + domLive}`);
  console.log(`  • 🔴 Tổng tài khoản "Token invalid or revoked"   : ${gmailRevoked + domRevoked}`);
  console.log(`  • ⚪ Tổng tài khoản Chưa Add vào 9Router         : ${gmailMissing + domMissing}`);
  console.log(`  • 🌐 Tổng số tài khoản quản lý                   : ${gmailList.length + domainList.length}`);
  console.log('-'.repeat(95));
  console.log('\n💡 CÁC LỆNH CHẠY XỬ LÝ:');
  console.log('  1. Chỉ xử lý các tài khoản gặp lỗi "Token invalid or revoked":');
  console.log('     node auto-login-all-chrome-sso.mjs --revoked');
  console.log('  2. Tự động kiểm tra probe 0-quota và bật lại các tài khoản còn token:');
  console.log('     node auto-login-all-chrome-sso.mjs --auto-detect');
  console.log('  3. Chế độ ẨN DANH (Incognito + Autofill) cho các tài khoản Domain:');
  console.log('     node auto-login-all-chrome-sso.mjs --domain');
  console.log('  4. Chế độ SSO cho các tài khoản Gmail trên Chrome:');
  console.log('     node auto-login-all-chrome-sso.mjs --gmail');
  console.log('  5. Xuất lại toàn bộ Session/Cookies của tất cả tài khoản cho Tool Tạo Ảnh:');
  console.log('     node auto-login-all-chrome-sso.mjs --export-cookies');
  console.log('  6. Tự động chạy tất cả tài khoản cần xử lý (TỰ ĐỘNG SKIP TÀI KHOẢN ĐÃ LIVE):');
  console.log('     node auto-login-all-chrome-sso.mjs');
  console.log('='.repeat(95) + '\n');
}

// Global skip event emitter
let currentSkipHandler = null;

function saveTokenToNineRouter(actualEmail, tokenData) {
  const dbPath = getNineRouterDbPath();
  if (!dbPath) return;

  const idTokenParsed = parseJwt(tokenData.id_token || '');
  const chatgptAccountId = idTokenParsed['https://api.openai.com/auth']?.user_id || actualEmail;
  const planType = extractChatGPTPlanType(tokenData);
  const now = new Date().toISOString();

  const db = new DatabaseSync(dbPath, { open: true });
  const existing = db.prepare("SELECT id, data, priority FROM providerConnections WHERE provider = 'codex' AND (LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?))").get(actualEmail, actualEmail);

  let providerData = {};
  if (existing && existing.data) {
    try { providerData = JSON.parse(existing.data); } catch {}
  }

  providerData.accessToken = tokenData.access_token;
  providerData.refreshToken = tokenData.refresh_token || providerData.refreshToken;
  providerData.idToken = tokenData.id_token;
  providerData.email = actualEmail;
  providerData.testStatus = 'active';
  providerData.lastError = null;
  providerData.expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined;
  providerData.lastRefreshAt = now;
  providerData.providerSpecificData = {
    chatgptAccountId,
    chatgptPlanType: planType
  };

  if (existing) {
    db.prepare(`UPDATE providerConnections SET
      data = ?,
      isActive = 1,
      updatedAt = ?
      WHERE id = ?
    `).run(JSON.stringify(providerData), now, existing.id);
    console.log(`💾 Đã CẬP NHẬT token mới vào 9Router cho: ${actualEmail} (ID: ${existing.id}) [Plan: ${planType}]`);
  } else {
    const newId = crypto.randomUUID();
    db.prepare(`INSERT INTO providerConnections (id, name, provider, email, priority, isActive, data, createdAt, updatedAt)
      VALUES (?, ?, 'codex', ?, 50, 1, ?, ?, ?)
    `).run(newId, actualEmail, actualEmail, JSON.stringify(providerData), now, now);
    console.log(`💾 Đã THÊM MỚI tài khoản vào 9Router: ${actualEmail} (ID: ${newId}) [Plan: ${planType}]`);
  }
  db.close();
}

// -------------------------------------------------------------
// [A] GMAIL SSO RUNNER (Opens specific Chrome Profile)
// -------------------------------------------------------------
async function loginChromeProfileSSO(profileDir, targetEmail, index, total, isStealth = false) {
  console.log(`\n` + '='.repeat(70));
  console.log(`▶ [${index}/${total}] [GMAIL SSO] TÀI KHOẢN: ${targetEmail}`);
  console.log(`📁 Profile Chrome : ${profileDir}`);
  if (isStealth) {
    console.log(`🥷 CHẾ ĐỘ CHẠY ẨN : Trình duyệt chạy ngoài màn hình (Stealth Off-Screen)`);
  } else {
    console.log(`⚡ PHÍM BỎ QUA     : Nhấn [S] hoặc [Space] để BỎ QUA | Nhấn [D] nếu BỊ DEACTIVATED!`);
  }
  console.log('='.repeat(70));

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
  const redirectUri = 'http://localhost:1455/auth/callback';

  const authUrl = `https://auth.openai.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+profile+email+offline_access&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&id_token_add_organizations=true&codex_cli_simplified_flow=true&originator=codex_cli_rs`;

  let server = null;
  let isResolved = false;

  ensurePort1455Free();

  const codePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      if (server) try { server.close(); } catch {}
      reject(new Error('Hết thời gian chờ (120s).'));
    }, 120000);

    const triggerSkip = (reason = 'SKIPPED_BY_USER') => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      if (server) try { server.close(); } catch {}
      reject(new Error(reason));
    };

    currentSkipHandler = (action) => {
      if (action === 'deactivated') {
        markAccountDeactivatedInDb(targetEmail, 'Đánh dấu Deactivated bởi người dùng');
        triggerSkip('DEACTIVATED_DETECTED');
      } else {
        triggerSkip('SKIPPED_BY_USER');
      }
    };

    server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost:1455');
        if (reqUrl.pathname === '/skip') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:50px;background:#0d1117;color:#fff;">
            <h1 style="color:#f59e0b;">⏭️ Đã Bỏ Qua!</h1><script>setTimeout(() => window.close(), 1000);</script>
          </body></html>`);
          triggerSkip('SKIPPED_BY_USER');
          return;
        }

        if (reqUrl.pathname === '/auth/callback') {
          const code = reqUrl.searchParams.get('code');
          const err = reqUrl.searchParams.get('error');
          const errDesc = reqUrl.searchParams.get('error_description') || '';

          if (err || errDesc.includes('deactivated')) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:50px;background:#0d1117;color:#fff;">
              <h1 style="color:#ef4444;">🔴 Tài Khoản Bị Deactivated / Lỗi!</h1>
              <p style="color:#f87171;">${errDesc || err || 'Account Deactivated'}</p>
              <p style="color:#8b949e;">Đã cập nhật database 9Router. Đang tự động chuyển sang tài khoản tiếp theo...</p>
              <script>setTimeout(() => window.close(), 1500);</script>
            </body></html>`);

            markAccountDeactivatedInDb(targetEmail, 'Callback error: ' + (errDesc || err));
            triggerSkip('DEACTIVATED_DETECTED');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:50px;background:#0d1117;color:#fff;">
            <h1 style="color:#22c55e;">✅ Đăng Nhập Google SSO Thành Công!</h1>
            <p>9Router đã nhận được Token cho <b>${targetEmail}</b>.</p>
            <script>setTimeout(() => window.close(), 1500);</script>
          </body></html>`);

          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            try { server.close(); } catch {}
            if (code) resolve(code);
            else reject(new Error('No code returned'));
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (e) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { server.close(); } catch {}
          reject(e);
        }
      }
    });

    server.listen(1455, '127.0.0.1', () => {
      console.log('🔌 [1/3] Cổng kết nối OAuth (Port 1455): SẴN SÀNG ✅ (http://127.0.0.1:1455/auth/callback)');
    });

    server.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        reject(new Error('Cổng 1455 bận: ' + err.message));
      }
    });
  });

  const chromeExe = findChromeExecutable();
  console.log(`🌐 [2/3] Khởi động trình duyệt Chrome Profile [${profileDir}]... ${isStealth ? '[ CHẠY ẨN TÀNG HÌNH 🥷 ]' : '[ ĐÃ MỞ ✅ ]'}`);
  const chromeArgs = [`--profile-directory=${profileDir}`];
  if (isStealth) {
    chromeArgs.push('--window-position=-10000,-10000');
    chromeArgs.push('--no-startup-window');
  }
  chromeArgs.push(authUrl);
  const chromeProc = spawn(chromeExe, chromeArgs, { detached: true, stdio: 'ignore' });
  chromeProc.unref();

  if (!isStealth) {
    try {
      spawn('powershell', ['-Command', '$w = New-Object -ComObject Wscript.Shell; $w.AppActivate("Google Chrome")'], { stdio: 'ignore' }).unref();
    } catch {}
  }

  console.log(`🤖 [3/3] Chờ xác thực OAuth trên trình duyệt...`);
  console.log(`👉 Bấm chọn "Continue with Google" hoặc chọn [${targetEmail}] trong Chrome.`);
  console.log(`⏭️  BẤM [S] ĐỂ BỎ QUA | BẤM [D] NẾU THẤY BÁO DEACTIVATED ⏭️`);

  const code = await codePromise;
  currentSkipHandler = null;

  console.log(`✅ Nhận Authorization Code! Đang đổi Token...`);
  const tokenRes = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    if (tokenData.error === 'invalid_grant' || (tokenData.error_description && tokenData.error_description.includes('deactivated'))) {
      markAccountDeactivatedInDb(targetEmail, tokenData.error_description || tokenData.error);
      throw new Error('DEACTIVATED_DETECTED');
    }
    throw new Error('Đổi token thất bại: ' + (tokenData.error_description || tokenData.error || tokenRes.status));
  }

  saveTokenToNineRouter(targetEmail, tokenData);
  exportSessionAndCookies(targetEmail, tokenData, []);
  console.log(`🎉 HOÀN TẤT ĐĂNG NHẬP: ${targetEmail}`);
  return { success: true, email: targetEmail };
}

// -------------------------------------------------------------
// [B] DOMAIN INCOGNITO RUNNER (Captures Browser Cookies + Auto-Close + Auto-Skip)
// -------------------------------------------------------------
async function loginIncognitoDomainAccount(acc, index, total, isStealth = false) {
  const { email, password, twoFactorSecret } = acc;
  const totpCode = generateTOTP(twoFactorSecret);

  console.log(`\n` + '='.repeat(70));
  console.log(`▶ [${index}/${total}] [DOMAIN ẨN DANH] TÀI KHOẢN: ${email}`);
  if (totpCode) {
    console.log(`🔑 Mã 2FA TOTP hiện tại: [ ${totpCode} ] (Secret: ${twoFactorSecret.slice(0, 8)}...)`);
  }
  if (isStealth) {
    console.log(`🥷 CHẾ ĐỘ CHẠY ẨN : Trình duyệt chạy ngoài màn hình (Stealth Off-Screen)`);
  } else {
    console.log(`⚡ PHÍM BỎ QUA         : Nhấn [S] hoặc [Space] để SKIP | Nhấn [D] nếu BỊ DEACTIVATED!`);
  }
  console.log('='.repeat(70));

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
  const redirectUri = 'http://localhost:1455/auth/callback';

  const authUrl = `https://auth.openai.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+profile+email+offline_access&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&id_token_add_organizations=true&codex_cli_simplified_flow=true&originator=codex_cli_rs`;

  let server = null;
  let isResolved = false;

  ensurePort1455Free();

  const codePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      if (server) try { server.close(); } catch {}
      reject(new Error('Hết thời gian chờ (150s).'));
    }, 150000);

    const triggerSkip = (reason = 'SKIPPED_BY_USER') => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      if (server) try { server.close(); } catch {}
      reject(new Error(reason));
    };

    currentSkipHandler = (action) => {
      if (action === 'deactivated') {
        markAccountDeactivatedInDb(email, 'Đánh dấu Deactivated bởi phím tắt người dùng');
        triggerSkip('DEACTIVATED_DETECTED');
      } else {
        triggerSkip('SKIPPED_BY_USER');
      }
    };

    server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost:1455');
        if (reqUrl.pathname === '/skip') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:50px;background:#0d1117;color:#fff;">
            <h1 style="color:#f59e0b;">⏭️ Đã Bỏ Qua!</h1><script>setTimeout(() => window.close(), 1000);</script>
          </body></html>`);
          triggerSkip('SKIPPED_BY_USER');
          return;
        }

        if (reqUrl.pathname === '/auth/callback') {
          const code = reqUrl.searchParams.get('code');
          const err = reqUrl.searchParams.get('error');
          const errDesc = reqUrl.searchParams.get('error_description') || '';

          if (err || errDesc.includes('deactivated')) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:50px;background:#0d1117;color:#fff;">
              <h1 style="color:#ef4444;">🔴 Tài Khoản Bị Deactivated / Lỗi!</h1>
              <p style="color:#f87171;">${errDesc || err || 'Account Deactivated'}</p>
              <p style="color:#8b949e;">Đã cập nhật database 9Router. Đang tự động chuyển sang tài khoản tiếp theo...</p>
              <script>setTimeout(() => window.close(), 1500);</script>
            </body></html>`);

            markAccountDeactivatedInDb(email, 'Callback error: ' + (errDesc || err));
            triggerSkip('DEACTIVATED_DETECTED');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:50px;background:#0d1117;color:#fff;">
            <h1 style="color:#22c55e;">✅ Đăng Nhập Thành Công!</h1>
            <p>9Router đã nhận được Token cho <b>${email}</b>.</p>
            <p style="color:#8b949e;">Đang trích xuất Session & Cookies và đóng trình duyệt...</p>
            <script>setTimeout(() => window.close(), 1000);</script>
          </body></html>`);

          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            try { server.close(); } catch {}
            if (code) resolve(code);
            else reject(new Error('No code returned'));
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (e) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { server.close(); } catch {}
          reject(e);
        }
      }
    });

    server.listen(1455, '127.0.0.1', () => {
      console.log('🔌 [1/3] Cổng kết nối OAuth (Port 1455): SẴN SÀNG ✅ (http://127.0.0.1:1455/auth/callback)');
    });

    server.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        reject(new Error('Cổng 1455 bận: ' + err.message));
      }
    });
  });

  let browser = null;
  let autofillLoopActive = true;
  let nativePid = null;

  if (puppeteer) {
    try {
      console.log(`🌐 [2/3] Khởi động trình duyệt Chrome Ẩn Danh (Incognito)... ${isStealth ? '[ CHẠY ẨN TÀNG HÌNH 🥷 ]' : '[ ĐÃ MỞ ✅ ]'}`);
      const launchArgs = [
        '--incognito',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1200,850'
      ];
      if (isStealth) {
        launchArgs.push('--window-position=-10000,-10000');
        launchArgs.push('--no-startup-window');
      }
      browser = await puppeteer.launch({
        executablePath: findChromeExecutable(),
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'],
        args: launchArgs
      });

      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();

      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.navigator.chrome = { runtime: {} };
      });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36');

      console.log(`      ↳ Trình duyệt Chrome Ẩn Danh đã mở thành công ✅`);
      console.log(`🤖 [3/3] Đang tải trang OAuth OpenAI & bắt đầu tự động hóa thao tác...`);
      await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Real-time In-Browser Deactivation & Human Autofill / Auto-Click Watcher
      (async () => {
        let lastActionTime = 0;
        let totpAttemptCount = 0;
        let lastAttemptedTotp = '';
        let lastDiagLog = 0;
        let emailVerifyAttemptCount = 0;
        let isResettingPassword = false;

        const deactKeywords = [
          'deleted or deactivated',
          'has been deleted or deactivated',
          'you do not have an account',
          'account has been deactivated',
          'account was deactivated',
          'account is deactivated',
          'account deactivated',
          'account was deleted',
          'user is disabled',
          'tài khoản đã bị vô hiệu hóa',
          'tài khoản của bạn đã bị vô hiệu hóa',
          'tài khoản bị vô hiệu hoá',
          'your access was terminated'
        ];

        while (autofillLoopActive) {
          try {
            const now = Date.now();

            // 1. Check current URL for fatal errors
            const curUrl = page.url();
            if (curUrl.includes('account_deactivated') || curUrl.includes('error=access_denied')) {
              console.log(`\n🚨 PHÁT HIỆN TÀI KHOẢN BỊ DEACTIVATED TỪ URL: ${curUrl}`);
              handleAccountDeactivatedSync(email, 'Deactivated URL redirect: ' + curUrl);
              if (typeof currentSkipHandler === 'function') currentSkipHandler('deactivated');
              break;
            }

            // Check if page requires Phone Number Verification (add-phone screen)
            if (curUrl.includes('add-phone') || curUrl.includes('/phone')) {
              console.log(`\n📱 [DOM DETECT] TÀI KHOẢN YÊU CẦU XÁC MINH SỐ ĐIỆN THOẠI (PHONE_REQUIRED) cho: ${email} -> Đang ghi nhận & chuyển nick...`);
              syncAccountIssueDetails(email, 'PHONE_REQUIRED', 'Tài khoản yêu cầu liên kết số điện thoại (Phone number required)');
              if (typeof currentSkipHandler === 'function') currentSkipHandler('skip');
              break;
            }

            // Check if page requires Email Verification Link / Code (email-verification screen)
            const isEmailVerifyScreen = curUrl.includes('email-verification');
            if (isEmailVerifyScreen && (now - lastActionTime > 2000)) {
              if (emailVerifyAttemptCount < 4) {
                emailVerifyAttemptCount++;
                const realMailbox = acc.mailboxEmail || (email.includes('@vip.') ? email.replace('@vip.', '@') : email);
                console.log(`\n📬 [AUTO RECOVERY - WEBMAIL] Phát hiện màn hình Email Verification cho: ${email} (Lần thử ${emailVerifyAttemptCount}/4)`);
                console.log(`   ↳ Đang kết nối Webmail (${realMailbox}) để lấy mã OTP 6 số hoặc Link kích hoạt...`);

                let emailOtpResult = null;
                if (vpsMail && vpsMail.getVerificationCodeFromRoundcube) {
                  for (let attempt = 1; attempt <= 6; attempt++) {
                    console.log(`   ⏳ [Webmail Poll ${attempt}/6] Đang quét thư mới trong INBOX & Junk cho ${realMailbox}...`);
                    try {
                      emailOtpResult = await vpsMail.getVerificationCodeFromRoundcube(realMailbox, password, 0, false);
                      if (emailOtpResult && (emailOtpResult.code || emailOtpResult.verifyUrl)) {
                        break;
                      }
                    } catch (mailErr) {
                      console.log(`   ⚠️ [Webmail Warning] Lỗi: ${mailErr.message}`);
                    }
                    await sleep(2500);
                  }
                }

                if (emailOtpResult && emailOtpResult.code) {
                  const emailOtp = emailOtpResult.code;
                  console.log(`\n🎉 [AUTO RECOVERY - SUCCESS] Lấy thành công mã OTP từ Webmail: [ ${emailOtp} ] (UID: ${emailOtpResult.uid || 'N/A'})!`);
                  const codeInput = await page.$('input[name="code"], input[type="text"][inputmode="numeric"], input#code, input[placeholder*="code" i], input[placeholder*="6-digit" i], input[type="text"]').catch(() => null);
                  if (codeInput) {
                    console.log(`⌨️ [Human Input] Tự động điền mã OTP [ ${emailOtp} ] vào form xác minh...`);
                    await page.evaluate(el => el.value = '', codeInput).catch(() => {});
                    await humanType(page, codeInput, emailOtp, { minDelay: 45, maxDelay: 90, clearFirst: true });
                    await sleep(300);
                    await page.keyboard.press('Enter').catch(() => {});
                    await findAndClickSubmitButton(page, 'Xác nhận Email OTP');
                    lastActionTime = Date.now();
                    await sleep(3000);
                    continue;
                  }
                } else if (emailOtpResult && emailOtpResult.verifyUrl) {
                  console.log(`\n🔗 [AUTO RECOVERY - SUCCESS] Lấy thành công Link xác minh từ Webmail: ${emailOtpResult.verifyUrl}`);
                  console.log(`🌐 [Browser Nav] Đang điều hướng trình duyệt tới link xác minh...`);
                  await page.goto(emailOtpResult.verifyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  lastActionTime = Date.now();
                  await sleep(3000);
                  continue;
                } else {
                  console.log(`   ⚠️ Không tìm thấy email OTP mới từ Webmail ở lần thử ${emailVerifyAttemptCount}.`);
                }
              }

              if (emailVerifyAttemptCount >= 4) {
                console.log(`\n🚨 [DOM DETECT] HẾT LƯỢT THỬ XÁC MINH EMAIL cho: ${email} -> Đang ghi nhận & chuyển nick...`);
                syncAccountIssueDetails(email, 'EMAIL_VERIFICATION_REQUIRED', 'Tài khoản yêu cầu xác minh qua email (Hết 4 lượt quét Webmail)');
                if (typeof currentSkipHandler === 'function') currentSkipHandler('skip');
                break;
              }
            }

            // Periodic DOM state diagnostic (every 5 seconds)
            if (!lastDiagLog || now - lastDiagLog > 5000) {
              lastDiagLog = now;
              const snippet = await page.evaluate(() => {
                const h1 = document.querySelector('h1')?.innerText || '';
                const alerts = Array.from(document.querySelectorAll('[role="alert"], .error-message, span[id*="error"]')).map(el => el.innerText.trim()).filter(Boolean);
                const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
                return {
                  h1,
                  alerts,
                  buttons,
                  text: `H1: "${h1}", Alerts: [${alerts.join(', ')}], Buttons: [${buttons.join(', ')}]`
                };
              }).catch(() => null);

              if (snippet) {
                console.log(`   🔍 [DOM Watcher] URL: ${curUrl.slice(0, 55)}... | ${snippet.text}`);

                if (snippet.h1.includes('Phone number required')) {
                  console.log(`\n📱 [DOM DETECT] TÀI KHOẢN YÊU CẦU XÁC MINH SỐ ĐIỆN THOẠI (PHONE_REQUIRED) cho: ${email} -> Đang ghi nhận & chuyển nick...`);
                  syncAccountIssueDetails(email, 'PHONE_REQUIRED', 'Tài khoản yêu cầu số điện thoại (' + snippet.h1 + ')');
                  if (typeof currentSkipHandler === 'function') currentSkipHandler('skip');
                  break;
                }
                if (snippet.h1.includes('Too many attempts')) {
                  console.log(`\n⏳ [DOM DETECT] TÀI KHOẢN BỊ GIỚI HẠN TẦN SUẤT (TOO_MANY_ATTEMPTS) cho: ${email} -> Đang ghi nhận & chuyển nick...`);
                  syncAccountIssueDetails(email, 'TOO_MANY_ATTEMPTS', 'OpenAI báo thử quá nhiều lần (Too many attempts)');
                  if (typeof currentSkipHandler === 'function') currentSkipHandler('skip');
                  break;
                }
              }
            }

            // 2. DOM Inspection: Deactivation Messages
            const bodyText = await page.evaluate(() => {
              return document.body ? document.body.innerText.toLowerCase() : '';
            }).catch(() => '');

            const matchedDeactKey = deactKeywords.find(k => bodyText.includes(k));
            if (matchedDeactKey) {
              console.log(`\n🚨 PHÁT HIỆN TÀI KHOẢN BỊ DEACTIVATED TRÊN MÀN HÌNH: [${matchedDeactKey.toUpperCase()}]`);
              handleAccountDeactivatedSync(email, 'OpenAI browser message: ' + matchedDeactKey);
              if (typeof currentSkipHandler === 'function') currentSkipHandler('deactivated');
              break;
            }

            // 3. DOM Inspection: Wrong Password Error Element
            const passErrorFound = await page.evaluate(() => {
              const passErr = document.querySelector('#error-element-password, div[data-error-code="wrong-email-credentials"], div[data-error-code="invalid-password"], [aria-describedby="error-element-password"]');
              if (passErr) {
                const style = window.getComputedStyle(passErr);
                if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                  return passErr.innerText.trim() || 'Sai mật khẩu';
                }
              }
              const txt = document.body ? document.body.innerText.toLowerCase() : '';
              if (txt.includes('wrong email or password') || txt.includes('your password was incorrect') || txt.includes('sai email hoặc mật khẩu') || txt.includes('mật khẩu không chính xác')) {
                return 'Sai email hoặc mật khẩu';
              }
              return null;
            }).catch(() => null);

            if (passErrorFound) {
              if (!isResettingPassword && vpsMail) {
                isResettingPassword = true;
                console.log(`\n🔑 [FORGOT PASSWORD RECOVERY] Phát hiện mật khẩu không khớp (${passErrorFound}) cho: ${email}`);
                console.log(`   ↳ Đang kích hoạt luồng 'Quên mật khẩu' để đặt lại mật khẩu mới tự động qua Webmail...`);

                const realMailbox = acc.mailboxEmail || (email.includes('@vip.') ? email.replace('@vip.', '@') : email);
                let resetFlowSuccess = false;

                try {
                  // 1. Snapshot current highest UID before requesting password reset
                  const startUid = await vpsMail.getLatestUidFromRoundcube(realMailbox, password).catch(() => 0) || 0;

                  // 2. Find and click "Forgot password?" link on OpenAI login page
                  const forgotClicked = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a, button'));
                    for (const el of links) {
                      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                      const href = (el.getAttribute('href') || '').toLowerCase();
                      if (txt.includes('forgot password') || txt.includes('quên mật khẩu') || href.includes('reset-password')) {
                        el.click();
                        return true;
                      }
                    }
                    return false;
                  }).catch(() => false);

                  if (!forgotClicked) {
                    console.log(`   🌐 Điều hướng trực tiếp tới trang đặt lại mật khẩu của OpenAI...`);
                    await page.goto('https://auth.openai.com/u/reset-password', { waitUntil: 'domcontentloaded', timeout: 30000 });
                  }

                  await sleep(2500);

                  // 3. Fill email if input is present and submit
                  const emailResetInput = await page.$('input[name="email"], input[type="email"], input#email, input#username').catch(() => null);
                  if (emailResetInput) {
                    const curEmailVal = await page.evaluate(el => el.value, emailResetInput).catch(() => '');
                    if (!curEmailVal) {
                      console.log(`   📧 Điền email [ ${email} ] vào form đặt lại mật khẩu...`);
                      await humanType(page, emailResetInput, email, { minDelay: 40, maxDelay: 85, clearFirst: true });
                      await sleep(300);
                    }
                    await page.keyboard.press('Enter').catch(() => {});
                    await findAndClickSubmitButton(page, 'Gửi yêu cầu Reset Password');
                    await sleep(3000);
                  }

                  // 4. Poll Webmail for the incoming "Reset your password" email
                  console.log(`   ⏳ Đang lắng nghe email đặt lại mật khẩu từ OpenAI trong hòm thư ${realMailbox}...`);
                  let resetMailResult = null;
                  for (let attempt = 1; attempt <= 10; attempt++) {
                    console.log(`   ⏳ [Webmail Poll ${attempt}/10] Quét link Reset Password trong INBOX/Junk (UID > ${startUid})...`);
                    try {
                      resetMailResult = await vpsMail.getVerificationCodeFromRoundcube(realMailbox, password, startUid, false);
                      if (resetMailResult && (resetMailResult.resetUrl || resetMailResult.verifyUrl)) {
                        break;
                      }
                    } catch (e) {
                      console.log(`   ⚠️ [Webmail Warning] ${e.message}`);
                    }
                    await sleep(2500);
                  }

                  const resetLink = resetMailResult?.resetUrl || resetMailResult?.verifyUrl;
                  if (resetLink) {
                    console.log(`\n🎉 [RESET LINK FOUND] Nhận thành công link đặt lại mật khẩu: ${resetLink}`);
                    console.log(`🌐 [Browser Nav] Đang mở link đặt lại mật khẩu trên trình duyệt...`);
                    await page.goto(resetLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await sleep(3000);

                    // 5. Fill new password into both fields
                    const newPassInputs = await page.$$('input[type="password"], input[name="new_password"], input[name="password"], #new-password, #password').catch(() => []);
                    if (newPassInputs.length >= 1) {
                      const standardNewPass = password || 'YTN@Pass2026#Sec';
                      console.log(`🔑 [New Password] Tự động điền mật khẩu mới vào form xác nhận...`);
                      for (const pInput of newPassInputs) {
                        await humanType(page, pInput, standardNewPass, { minDelay: 40, maxDelay: 85, clearFirst: true });
                        await sleep(250);
                      }
                      await page.keyboard.press('Enter').catch(() => {});
                      await findAndClickSubmitButton(page, 'Xác nhận Đổi Mật Khẩu');
                      await sleep(3500);

                      console.log(`✅ [PASSWORD RESET SUCCESS] Đã đặt lại mật khẩu thành công cho ${email}!`);
                      console.log(`🔄 Đang quay lại trang đăng nhập với mật khẩu mới...`);
                      await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                      lastActionTime = Date.now();
                      resetFlowSuccess = true;
                      continue;
                    }
                  } else {
                    console.log(`   ⚠️ Không tìm thấy email Reset Password từ OpenAI sau 10 lần quét.`);
                  }
                } catch (resetErr) {
                  console.log(`   ❌ Lỗi trong luồng Forgot Password: ${resetErr.message}`);
                }

                if (!resetFlowSuccess) {
                  console.log(`\n🚨 [DOM DETECT] KHÔNG THỂ PHỤC HỒI MẬT KHẨU cho: ${email} -> Đang tự động bỏ qua & ghi nhận...`);
                  syncAccountIssueDetails(email, 'WRONG_PASSWORD', passErrorFound);
                  if (typeof currentSkipHandler === 'function') currentSkipHandler('skip');
                  break;
                }
              } else {
                console.log(`\n🚨 [DOM DETECT] PHÁT HIỆN SAI MẬT KHẨU (${passErrorFound}) cho: ${email} -> Đang tự động bỏ qua & ghi nhận...`);
                syncAccountIssueDetails(email, 'WRONG_PASSWORD', passErrorFound);
                if (typeof currentSkipHandler === 'function') currentSkipHandler('skip');
                break;
              }
            }

            // 4. DOM Inspection: Invalid 2FA TOTP Error Element with Offset Retry
            const totpErrorFound = await page.evaluate(() => {
              const codeErr = document.querySelector('#error-element-code, div[data-error-code="invalid-totp-code"], input[name="code"][aria-invalid="true"], [aria-describedby="error-element-code"]');
              if (codeErr) {
                const style = window.getComputedStyle(codeErr);
                if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                  return codeErr.innerText.trim() || 'Mã xác thực không hợp lệ';
                }
              }
              const txt = document.body ? document.body.innerText.toLowerCase() : '';
              if (txt.includes('the code you entered is invalid') || txt.includes('incorrect code') || txt.includes('mã xác thực không chính xác') || txt.includes('mã xác thực không hợp lệ') || txt.includes('code expired')) {
                return 'Mã xác thực không hợp lệ hoặc đã hết hạn';
              }
              return null;
            }).catch(() => null);

            if (totpErrorFound && (now - lastActionTime > 1800)) {
              totpAttemptCount++;
              if (totpAttemptCount <= 2 && twoFactorSecret) {
                const offset = (totpAttemptCount === 1 ? -1 : 1);
                const retryCode = generateTOTP(twoFactorSecret, offset);
                console.log(`\n🔄 [DOM DETECT - 2FA RETRY ${totpAttemptCount}/2] Lỗi 2FA (${totpErrorFound}) -> Thử lại mã bù trừ lệch giờ (Offset ${offset * 30}s): [ ${retryCode} ]...`);

                const totpInput = await page.$('input[name="code"], input[name="totp"], input[name="mfaCode"], #mfa-code, #code, input[type="text"][inputmode="numeric"]').catch(() => null);
                if (totpInput) {
                  await page.evaluate(el => el.value = '', totpInput).catch(() => {});
                  await humanType(page, totpInput, retryCode, { minDelay: 45, maxDelay: 90, clearFirst: true });
                  await sleep(250 + Math.random() * 200);
                  await page.keyboard.press('Enter').catch(() => {});
                  await sleep(350);
                  await findAndClickSubmitButton(page, 'Xác nhận 2FA (Retry)');
                  lastActionTime = Date.now();
                  await sleep(2000);
                  continue;
                }
              } else {
                console.log(`\n🚨 [DOM DETECT] HẾT LƯỢT THỬ 2FA (${totpErrorFound}) cho: ${email} -> Secret 2FA không hợp lệ.`);
                syncAccountIssueDetails(email, 'WRONG_2FA_SECRET', totpErrorFound);
                if (typeof currentSkipHandler === 'function') currentSkipHandler('skip');
                break;
              }
            }

            // 5. STEP: Authorize / Consent / Workspace Selection Form (Check first to avoid getting stuck)
            if (now - lastActionTime > 1200) {
              const curUrl = page.url();
              const hasWorkspaceOrConsent = await page.evaluate(() => {
                const wsBtn = document.querySelector('button[data-testid="workspace-select-button"], button[data-testid="consent-submit-button"], button[value="authorize"], button[name="action"][value="consent"]');
                const isAuthUrl = window.location.href.includes('consent') || window.location.href.includes('workspace') || window.location.href.includes('sign-in-with-chatgpt') || window.location.href.includes('oauth/authorize');
                return Boolean(wsBtn) || isAuthUrl;
              }).catch(() => false);

              if (hasWorkspaceOrConsent) {
                const clicked = await findAndClickSubmitButton(page, 'Xác nhận Workspace / Continue');
                if (clicked) {
                  lastActionTime = Date.now();
                  await sleep(1500);
                  continue;
                }
              }
            }

            // 6. STEP: 2FA TOTP Form (Fresh attempt)
            if (twoFactorSecret && (now - lastActionTime > 1800) && !curUrl.includes('email-verification')) {
              const totpInput = await page.$('input[name="code"], input[name="totp"], input[name="mfaCode"], input#mfa-code, input#code, input#totp, input[type="text"][inputmode="numeric"], input[autocomplete="one-time-code"], input[placeholder*="code" i], input[placeholder*="6-digit" i], input[placeholder*="mã" i], .totp-input').catch(() => null);
              if (totpInput) {
                const isVisible = await page.evaluate(el => {
                  const s = window.getComputedStyle(el);
                  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
                }, totpInput).catch(() => false);

                if (isVisible) {
                  const curVal = await page.evaluate(el => el.value, totpInput).catch(() => '');
                  if (!curVal || curVal.length < 6) {
                    // Prevent generating near edge of 30s cycle
                    const epochSec = Math.floor(Date.now() / 1000) % 30;
                    if (epochSec >= 27) {
                      console.log(`⏳ [2FA Sync] Đợi 3.5s để sinh mã TOTP đầu chu kỳ mới (tránh hết hạn)...`);
                      await sleep(3500);
                    }

                    const currentTotp = generateTOTP(twoFactorSecret, 0);
                    if (currentTotp && currentTotp !== lastAttemptedTotp) {
                      lastAttemptedTotp = currentTotp;
                      console.log(`🔢 [Human 2FA] Tự động tính & gõ mã TOTP -> [ ${currentTotp} ]...`);
                      await humanType(page, totpInput, currentTotp, { minDelay: 45, maxDelay: 95, clearFirst: true });
                      await sleep(250 + Math.random() * 200);
                      await page.keyboard.press('Enter').catch(() => {});
                      await sleep(350);
                      await findAndClickSubmitButton(page, 'Xác nhận 2FA');
                      lastActionTime = Date.now();
                      await sleep(1800);
                      continue;
                    }
                  }
                }
              }
            }

            // 7. STEP: Password Form
            if (password && (now - lastActionTime > 1800)) {
              const passInput = await page.$('input[type="password"], input[name="password"], #password').catch(() => null);
              if (passInput) {
                const isVisible = await page.evaluate(el => {
                  const s = window.getComputedStyle(el);
                  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
                }, passInput).catch(() => false);

                if (isVisible) {
                  const curVal = await page.evaluate(el => el.value, passInput).catch(() => '');
                  if (!curVal) {
                    console.log(`🔑 [Human Pass] Tự động di chuột & gõ Mật khẩu -> ******`);
                    await humanType(page, passInput, password, { minDelay: 40, maxDelay: 90, clearFirst: true });
                    await sleep(250 + Math.random() * 200);
                    await page.keyboard.press('Enter').catch(() => {});
                    await sleep(350);
                    await findAndClickSubmitButton(page, 'Đăng nhập Password');
                    lastActionTime = Date.now();
                    await sleep(1800);
                    continue;
                  }
                }
              }
            }

            // 8. STEP: Email Form
            if (now - lastActionTime > 1800) {
              const emailInput = await page.$('input[type="email"], input[name="email"], input[name="username"], #email-input, #username').catch(() => null);
              if (emailInput) {
                const isVisible = await page.evaluate(el => {
                  const s = window.getComputedStyle(el);
                  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
                }, emailInput).catch(() => false);

                if (isVisible) {
                  const curVal = await page.evaluate(el => el.value, emailInput).catch(() => '');
                  if (!curVal || curVal.toLowerCase() !== email.toLowerCase()) {
                    console.log(`📧 [Human Email] Tự động di chuột & gõ Email -> ${email}`);
                    await humanType(page, emailInput, email, { minDelay: 35, maxDelay: 80, clearFirst: true });
                    await sleep(250 + Math.random() * 200);
                    await page.keyboard.press('Enter').catch(() => {});
                    await sleep(350);
                    await findAndClickSubmitButton(page, 'Tiếp tục Email');
                    lastActionTime = Date.now();
                    await sleep(1800);
                    continue;
                  }
                }
              }
            }
          } catch {}
          await sleep(500);
        }
      })();

    } catch (err) {
      console.warn(`[Incognito] Puppeteer launch note: ${err.message}. Chuyển sang mở Chrome Incognito native...`);
    }
  }

  // Fallback if puppeteer not used
  if (!browser) {
    const chromeExe = findChromeExecutable();
    console.log(`🌐 Mở Chrome Incognito Native... ${isStealth ? '[ CHẠY ẨN TÀNG HÌNH 🥷 ]' : ''}`);
    const nativeArgs = ['--incognito'];
    if (isStealth) {
      nativeArgs.push('--window-position=-10000,-10000');
      nativeArgs.push('--no-startup-window');
    }
    nativeArgs.push(authUrl);
    const chromeProc = spawn(chromeExe, nativeArgs, { detached: true, stdio: 'ignore' });
    nativePid = chromeProc.pid;
    chromeProc.unref();
    console.log(`📧 Email    : ${email}`);
    if (password) console.log(`🔑 Password : ${password}`);
    if (totpCode) console.log(`🔢 Mã 2FA   : [ ${totpCode} ]`);
    console.log(`👉 Vui lòng nhập thông tin trên và bấm Xác nhận trong cửa sổ Incognito vừa mở.`);
  }

  console.log(`⏭️  BẤM [S] ĐỂ BỎ QUA | BẤM [D] NẾU THẤY BÁO DEACTIVATED ⏭️`);

  let code = null;
  let capturedCookies = [];
  try {
    code = await codePromise;

    // CAPTURE ALL BROWSER COOKIES BEFORE CLOSING
    if (browser) {
      try {
        const allPages = await browser.pages();
        if (allPages.length > 0) {
          try {
            const client = await allPages[0].target().createCDPSession();
            const cdpRes = await client.send('Network.getAllCookies').catch(() => ({ cookies: [] }));
            capturedCookies = cdpRes.cookies || (await allPages[0].cookies());
          } catch {
            capturedCookies = await allPages[0].cookies().catch(() => []);
          }
        }
      } catch {}
    }
  } finally {
    autofillLoopActive = false;
    currentSkipHandler = null;

    // GUARANTEED AUTO-CLOSE INCOGNITO BROWSER
    if (browser) {
      try {
        const allPages = await browser.pages();
        for (const p of allPages) {
          try { await p.close(); } catch {}
        }
        await browser.close();
        console.log(`🔒 Đã TỰ ĐỘNG ĐÓNG cửa sổ trình duyệt ẩn danh.`);
      } catch {}
    } else if (nativePid) {
      try {
        execSync(`taskkill /F /T /PID ${nativePid}`, { stdio: 'ignore' });
        console.log(`🔒 Đã TỰ ĐỘNG ĐÓNG cửa sổ trình duyệt ẩn danh native.`);
      } catch {}
    }
  }

  console.log(`✅ Nhận Authorization Code! Đang đổi Token...`);
  const tokenRes = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    if (tokenData.error === 'invalid_grant' || (tokenData.error_description && tokenData.error_description.includes('deactivated'))) {
      markAccountDeactivatedInDb(email, tokenData.error_description || tokenData.error);
      throw new Error('DEACTIVATED_DETECTED');
    }
    throw new Error('Đổi token thất bại: ' + (tokenData.error_description || tokenData.error || tokenRes.status));
  }

  saveTokenToNineRouter(email, tokenData);
  exportSessionAndCookies(email, tokenData, capturedCookies);
  console.log(`🎉 HOÀN TẤT ĐĂNG NHẬP: ${email}`);
  return { success: true, email };
}

// -------------------------------------------------------------
// MAIN CONTROLLER
// -------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check') || args.includes('-c');
  const isAutoDetectMode = args.includes('--auto-detect') || args.includes('--reactivate') || args.includes('-ad');
  const isExportCookiesMode = args.includes('--export-cookies') || args.includes('--export') || args.includes('-ec');
  const onlyGmail = args.includes('--gmail') || args.includes('-g');
  const onlyDomain = args.includes('--domain') || args.includes('-d');
  const onlyRevoked = args.includes('--revoked') || args.includes('-r');
  const onlyDeactivated = args.includes('--deactivated') || args.includes('-deact');
  const onlyMissing = args.includes('--missing') || args.includes('-m');
  const skipAdded = args.includes('--skip-added');
  const forceAll = args.includes('--force-all') || args.includes('-f');
  const isStealth = args.includes('--stealth') || args.includes('--hidden') || args.includes('-s');

  // Automatic Cookie & Session export on startup for all active DB accounts
  exportAllDbSessions();

  if (isExportCookiesMode) {
    console.log('='.repeat(75));
    console.log('🍪 [EXPORT COOKIES & SESSION] Đang xuất toàn bộ Session/Cookies từ 9Router DB...');
    const exportedCount = exportAllDbSessions();
    console.log(`✅ Đã xuất thành công ${exportedCount} file Session/Cookies!`);
    console.log(`📁 Thư mục lưu trữ: D:\\Music\\Ruby\\Produce for Customer\\Tools\\ChatGPT\\Cookies\\`);
    console.log('='.repeat(75));
    process.exit(0);
  }

  if (isCheckMode) {
    displayDetailedCheckTable();
    process.exit(0);
  }

  if (isAutoDetectMode) {
    await runAutoDetectionAndReactivation();
    process.exit(0);
  }

  // Parse skip list, only target list & start index
  let skipList = [];
  const skipArg = args.find(a => a.startsWith('--skip='));
  if (skipArg) {
    skipList = skipArg.split('=')[1].split(',').map(s => s.trim().toLowerCase());
  }

  let onlyList = [];
  const onlyArg = args.find(a => a.startsWith('--only=') || a.startsWith('--account=') || a.startsWith('--target='));
  if (onlyArg) {
    onlyList = onlyArg.split('=')[1].split(',').map(s => s.trim().toLowerCase());
  }

  let startFromIdx = 1;
  const startArg = args.find(a => a.startsWith('--start='));
  if (startArg) {
    startFromIdx = parseInt(startArg.split('=')[1], 10) || 1;
  }

  const { gmailList, domainList, dbMap } = getAllAccountsUnified();

  // Filter based on requested scope
  let queue = [];
  if (onlyList.length > 0) {
    queue = [...domainList, ...gmailList].filter(a => onlyList.some(o => a.email.toLowerCase().includes(o)));
  } else if (onlyGmail) {
    queue = gmailList;
  } else if (onlyDomain) {
    queue = domainList;
  } else {
    // Run 100% automated Domain accounts first, then Gmail SSO accounts
    queue = [...domainList, ...gmailList];
  }

  // Smart Filtering (Excludes Live 🟢 and Disabled ⏸️ by default across all modes)
  if (onlyRevoked) {
    console.log(`🎯 Chế độ: TỰ ĐỘNG ĐỐI CHIẾU 9ROUTER & CHỈ XỬ LÝ CÁC TÀI KHOẢN BỊ "TOKEN INVALID OR REVOKED" 🔴...`);
    queue = queue.filter(a => a.in9Router && a.isTokenRevoked);
  } else if (onlyDeactivated) {
    console.log(`🎯 Chế độ: CHỈ XỬ LÝ CÁC TÀI KHOẢN BỊ OPENAI DEACTIVATED / KHÓA ⛔...`);
    queue = queue.filter(a => a.in9Router && a.isDeactivated);
  } else if (onlyMissing || skipAdded) {
    console.log(`🎯 Chế độ: CHỈ XỬ LÝ CÁC TÀI KHOẢN CHƯA ADD VÀO 9ROUTER ⚪ (BỎ QUA TÀI KHOẢN ĐÃ CÓ & ĐÃ KHÓA ⛔)...`);
    queue = queue.filter(a => !a.in9Router && !a.isDeactivated);
  } else if (!forceAll) {
    const scopeLabel = onlyGmail ? 'GMAIL SSO' : (onlyDomain ? 'EMAIL DOMAIN' : 'TOÀN BỘ HỆ THỐNG');
    console.log(`🎯 Chế độ: [${scopeLabel}] -> TỰ ĐỘNG BỎ QUA CÁC TÀI KHOẢN LIVE 🟢, TẮT ⏸️ VÀ ĐÃ KHÓA ⛔`);
    console.log(`🎯 Chỉ xử lý các tài khoản BỊ LỖI TOKEN REVOKED 🔴 hoặc CHƯA NẠP ⚪...`);
    queue = queue.filter(a => (!a.in9Router || a.isTokenRevoked) && !a.isDeactivated);
  }

  // Filter out skipped accounts
  if (skipList.length > 0) {
    console.log(`🚫 Bỏ qua (Skip): ${skipList.join(', ')}`);
    queue = queue.filter(p => !skipList.some(s => p.email.toLowerCase().includes(s) || (p.profileDir && p.profileDir.toLowerCase().includes(s))));
  }

  if (startFromIdx > 1) {
    console.log(`⏩ Bắt đầu từ số thứ tự: ${startFromIdx}`);
    queue = queue.slice(startFromIdx - 1);
  }

  console.log('='.repeat(75));
  console.log('⚡ 9Router - TRÌNH QUẢN LÝ ĐĂNG NHẬP & BỔ SUNG DATA TOKEN TỰ ĐỘNG');
  console.log('='.repeat(75));
  console.log(`🎯 Tổng số tài khoản cần xử lý trong lượt này: ${queue.length} tài khoản\n`);

  if (queue.length === 0) {
    console.log('✅ Tất cả tài khoản đã hoạt động tốt (LIVE / SẴN SÀNG) hoặc không có tài khoản lỗi cần xử lý!');
    console.log('🍪 Tất cả Session/Cookies của các tài khoản đã được tự động xuất sang thư mục Cookies!');
    process.exit(0);
  }

  queue.forEach((t, i) => {
    const modeTag = t.type === 'gmail_sso' ? `[Gmail SSO | ${t.profileDir}]` : `[Domain Incognito]`;
    const st = !t.in9Router ? '⚪ CHƯA ADD' : (t.isTokenRevoked ? '🔴 TOKEN REVOKED' : (t.isDeactivated ? '⛔ DEACTIVATED' : (t.isDisabled ? '⏸️ DISABLED' : '🟢 ACTIVE')));
    console.log(`  [${i + 1}/${queue.length}] ${modeTag.padEnd(28)} ${t.email.padEnd(42)} -> ${st}`);
  });

  console.log('\n' + '-'.repeat(75));
  console.log('🚀 Bắt đầu quá trình nạp token & xuất cookies...');
  if (isStealth) {
    console.log('🥷 CHẾ ĐỘ: TÀNG HÌNH (STEALTH MODE) -> Trình duyệt chạy ngoài màn hình, không làm phiền Desktop!');
  } else {
    console.log('⚡ BẤM PHÍM [S] ĐỂ BỎ QUA | BẤM PHÍM [D] NẾU THẤY BÁO DEACTIVATED!');
  }
  console.log('-'.repeat(75));

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
      if (key && key.ctrl && key.name === 'c') {
        console.log('\n🛑 Đã dừng chương trình.');
        process.exit(0);
      }
      if (key && (key.name === 'd')) {
        if (typeof currentSkipHandler === 'function') {
          currentSkipHandler('deactivated');
        }
      }
      if (key && (key.name === 's' || key.name === 'space' || key.name === 'right' || key.name === 'return' || key.name === 'n')) {
        if (typeof currentSkipHandler === 'function') {
          currentSkipHandler('skip');
        }
      }
    });
  }

  let okCount = 0;
  let skipCount = 0;
  let deactDetectedCount = 0;
  let failCount = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      if (item.type === 'gmail_sso') {
        await loginChromeProfileSSO(item.profileDir, item.email, i + 1, queue.length, isStealth);
      } else {
        await loginIncognitoDomainAccount(item, i + 1, queue.length, isStealth);
      }
      okCount++;
    } catch (err) {
      if (err.message === 'DEACTIVATED_DETECTED') {
        deactDetectedCount++;
        console.log(`🚨 [TỰ ĐỘNG SKIP] Đã ghi nhận tài khoản BỊ DEACTIVATED vào DB: ${item.email}`);
      } else if (err.message === 'SKIPPED_BY_USER') {
        skipCount++;
        console.log(`⏭️  ĐÃ BỎ QUA tài khoản: ${item.email}`);
      } else {
        failCount++;
        console.error(`❌ Lỗi tại tài khoản ${item.email}: ${err.message}`);
      }
    }

    if (i < queue.length - 1) {
      console.log('⏳ Đợi 1.5 giây trước khi sang tài khoản tiếp theo...');
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log('\n' + '='.repeat(75));
  console.log('🎉 HOÀN TẤT TOÀN BỘ QUÁ TRÌNH!');
  console.log(`• Thành công             : ${okCount}`);
  console.log(`• Phát hiện Deactivated  : ${deactDetectedCount} (Đã ghi vào DB)`);
  console.log(`• Bỏ qua (Skip)          : ${skipCount}`);
  console.log(`• Thất bại               : ${failCount}`);
  console.log(`• Tổng cộng              : ${queue.length}`);
  console.log(`🍪 Toàn bộ file Cookies & Session đã được lưu tại: D:\\Music\\Ruby\\Produce for Customer\\Tools\\ChatGPT\\Cookies\\`);
  console.log('='.repeat(75));
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
