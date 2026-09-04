const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let puppeteer = null;
const puppeteerCandidates = [
  'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/dashboard/node_modules/puppeteer-core',
  'C:/Users/Linh/AppData/Roaming/npm/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core',
  'puppeteer-core'
];
for (const cand of puppeteerCandidates) {
  try {
    puppeteer = require(cand);
    if (puppeteer) break;
  } catch {}
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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
  return null;
}

function getChatgptAccountsPath() {
  const candidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_accounts.json',
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/data/chatgpt_accounts.json',
    path.join(__dirname, '..', '..', 'dashboard', 'data', 'chatgpt_accounts.json'),
    path.join(__dirname, '..', '..', 'data', 'chatgpt_accounts.json'),
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

function extractChatGPTPlanType(tokenData) {
  if (!tokenData) return 'free';
  
  // 1. Try access_token first
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
  } catch (err) {
    console.error(`⚠️ Lỗi khi xuất cookie/session cho ${email}:`, err.message);
  }
}

// Sync Deactivated Account to Automation Browser & Delete OAuth Token in 9Router
function handleAccountDeactivatedSync(email, reason = 'Deactivated by OpenAI') {
  const normEmail = normalizeEmail(email);
  if (!normEmail) return { success: false, error: 'Email invalid' };

  let dbDeleted = 0;
  // 1. DELETE from 9Router Database
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  const dbCandidates = [
    path.join(appData, '9router', 'db', 'data.sqlite'),
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/9router/data/data.sqlite',
    path.join(__dirname, '..', '..', 'data', 'data.sqlite')
  ];
  for (const dbPath of dbCandidates) {
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        const db = new DatabaseSync(dbPath, { open: true });
        const delRes = db.prepare("DELETE FROM providerConnections WHERE provider = 'codex' AND (LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?))").run(normEmail, normEmail);
        db.close();
        if (delRes.changes > 0) dbDeleted += delRes.changes;
      } catch (err) {
        console.error(`⚠️ [9Router DB] Lỗi xóa OAuth token: ${err.message}`);
      }
    }
  }

  // 2. Sync into Automation Browser: chatgpt_account_health.json
  const healthCandidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_account_health.json',
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/VPS/dashboard/data/chatgpt_account_health.json',
    path.join(__dirname, '..', '..', 'dashboard', 'data', 'chatgpt_account_health.json'),
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
          lastCheckMode: 'deactivated_sync',
          email: normEmail
        };
        healthData.updatedAt = new Date().toISOString();
        fs.writeFileSync(hp, JSON.stringify(healthData, null, 2), 'utf8');
      } catch (err) {
        console.error(`⚠️ [Automation Browser] Lỗi cập nhật ${hp}: ${err.message}`);
      }
    }
  }

  // 3. Sync into Automation Browser: chatgpt_accounts.json
  const accountsCandidates = [
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/Local/dashboard/data/chatgpt_accounts.json',
    'D:/Music/Ruby/Produce for Customer/Tools/Automation Browser/VPS/dashboard/data/chatgpt_accounts.json',
    path.join(__dirname, '..', '..', 'dashboard', 'data', 'chatgpt_accounts.json'),
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
        }
      } catch (err) {
        console.error(`⚠️ [Automation Browser] Lỗi cập nhật ${ap}: ${err.message}`);
      }
    }
  }

  // 4. Clean up session and cookie files
  const sanitizedEmail = normEmail.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetDirs = [
    'D:\\Music\\Ruby\\Produce for Customer\\Tools\\ChatGPT\\Cookies',
    'D:\\Music\\Ruby\\Produce for Customer\\Tools\\Automation Browser\\Local\\dashboard\\data\\cookies',
    'D:\\Music\\Ruby\\Produce for Customer\\Tools\\Automation Browser\\dashboard\\data\\cookies'
  ];

  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      try {
        const cookieFile = path.join(dir, `${sanitizedEmail}.json`);
        if (fs.existsSync(cookieFile)) {
          fs.unlinkSync(cookieFile);
          console.log(`🗑️ [Cookies] Đã xóa file cookies: ${cookieFile}`);
        }
      } catch (err) {
        console.error(`⚠️ [Cookies Dir] Lỗi cập nhật cookie files: ${err.message}`);
      }
    }
  }

  return { success: true, email: normEmail, dbDeleted };
}

function getUnifiedAccountStats() {
  const dbPath = getNineRouterDbPath();
  const dbMap = new Map();
  if (dbPath) {
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
            lastErrLower.includes('invalid') ||
            lastErrLower.includes('revoked') ||
            lastErrLower.includes('token expired') ||
            lastErrLower.includes('failed: token') ||
            lastErrLower.includes('401') ||
            testStatusLower === 'error'
          );
          const isDisabled = !isActive && !isTokenRevoked && !isDeactivated;

          dbMap.set(norm, {
            id: r.id,
            isActive,
            isDisabled,
            isDeactivated,
            isTokenRevoked,
            planType: parsed.providerSpecificData?.chatgptPlanType || 'unknown',
            accessToken: parsed.accessToken || null
          });
        }
      }
    } catch {}
  }

  // Gmail Profiles Breakdown
  const chromeUserData = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  const localStatePath = path.join(chromeUserData, 'Local State');
  const gmailEmails = [];
  if (fs.existsSync(localStatePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
      const profilesMap = state.profile?.info_cache || {};
      for (const [, info] of Object.entries(profilesMap)) {
        const email = normalizeEmail(info.user_name || info.hosted_domain || info.email || '');
        if (email && email.includes('@')) gmailEmails.push(email);
      }
    } catch {}
  }



  // Domain Accounts Breakdown
  const accFile = getChatgptAccountsPath();
  const domainEmails = [];
  const deactSet = new Set();
  if (accFile && fs.existsSync(accFile)) {
    try {
      const list = JSON.parse(fs.readFileSync(accFile, 'utf8'));
      for (const a of list) {
        const norm = normalizeEmail(a.email);
        if (norm) {
          domainEmails.push(norm);
          if (String(a.status).toLowerCase() === 'deactivated' || String(a.accountStatus).toLowerCase() === 'deactivated' || a.isDeactivated) {
            deactSet.add(norm);
          }
        }
      }
    } catch {}
  }

  // Also check health json
  const healthFile = accFile ? path.join(path.dirname(accFile), 'chatgpt_account_health.json') : null;
  if (healthFile && fs.existsSync(healthFile)) {
    try {
      const hd = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
      const recs = hd.records || {};
      for (const [em, rec] of Object.entries(recs)) {
        if (String(rec.accountStatus).toLowerCase() === 'deactivated' || rec.reasonCode === 'ACCOUNT_DEACTIVATED') {
          deactSet.add(normalizeEmail(em));
        }
      }
    } catch {}
  }

  let domainActiveSuccess = 0, domainDisabledSuccess = 0, domainRevoked = 0, domainDeactivated = 0, domainMissing = 0;
  for (const e of domainEmails) {
    const info = dbMap.get(e);
    const isDeact = deactSet.has(e) || (info && info.isDeactivated);
    if (isDeact) domainDeactivated++;
    else if (!info) domainMissing++;
    else if (info.isTokenRevoked) domainRevoked++;
    else if (info.isActive) domainActiveSuccess++;
    else domainDisabledSuccess++;
  }

  let gmailActiveSuccess = 0, gmailDisabledSuccess = 0, gmailRevoked = 0, gmailDeactivated = 0, gmailMissing = 0;
  for (const e of gmailEmails) {
    const info = dbMap.get(e);
    const isDeact = deactSet.has(e) || (info && info.isDeactivated);
    if (isDeact) gmailDeactivated++;
    else if (!info) gmailMissing++;
    else if (info.isTokenRevoked) gmailRevoked++;
    else if (info.isActive) gmailActiveSuccess++;
    else gmailDisabledSuccess++;
  }

  const liveActiveCount = gmailActiveSuccess + domainActiveSuccess;
  const liveDisabledCount = gmailDisabledSuccess + domainDisabledSuccess;
  const totalLiveTokens = liveActiveCount + liveDisabledCount; // Live = Test Connection Success

  // Include any accounts in 9router that have revoked tokens
  let allDbRevoked = 0;
  for (const [email, info] of dbMap.entries()) {
    if (info.isTokenRevoked) allDbRevoked++;
  }
  const revokedCount = Math.max(gmailRevoked + domainRevoked, allDbRevoked);
  const deactCount = domainDeactivated + gmailDeactivated;
  const missingCount = gmailMissing + domainMissing;
  const totalAccounts = gmailEmails.length + domainEmails.length;
  const totalInDb = dbMap.size;

  const gmailNeedRun = gmailRevoked + gmailMissing;
  const domainNeedRun = domainRevoked + domainMissing;
  const needRunTotal = revokedCount + missingCount;

  return {
    success: true,
    totalLiveTokens,
    liveActiveCount,
    liveDisabledCount,
    liveCount: liveActiveCount,
    disabledCount: liveDisabledCount,
    revokedCount,
    deactCount,
    missingCount,
    totalInDb,
    totalAccounts,
    needRunTotal,
    gmailTotal: gmailEmails.length,
    gmailLive: gmailActiveSuccess + gmailDisabledSuccess,
    gmailNeedRun,
    domainTotal: domainEmails.length,
    domainLive: domainActiveSuccess + domainDisabledSuccess,
    domainDisabled: domainDisabledSuccess,
    domainNeedRun,
    domainDeactivated
  };
}

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
      signal: AbortSignal.timeout(5000)
    });
    if (res.status === 400 || res.status === 200 || res.ok) return { live: true, status: res.status };
    return { live: false, status: res.status, error: 'Token revoked (HTTP ' + res.status + ')' };
  } catch (err) {
    return { live: false, error: err.message };
  }
}

async function runLiveAutoDetectAndReactivate() {
  const dbPath = getNineRouterDbPath();
  if (!dbPath) return { success: false, error: 'DB not found' };

  const db = new DatabaseSync(dbPath, { open: true });
  const rows = db.prepare("SELECT id, name, email, priority, isActive, data, updatedAt FROM providerConnections WHERE provider = 'codex'").all();

  let liveCount = 0;
  let reactivatedCount = 0;
  let deadCount = 0;

  for (const r of rows) {
    let parsed = {};
    try { parsed = JSON.parse(r.data || '{}'); } catch {}
    const isCurrentlyActive = r.isActive === 1 || r.isActive === true;

    if (!parsed.accessToken) {
      deadCount++;
      continue;
    }

    const testRes = await checkCodexTokenLive(parsed.accessToken);
    if (testRes.live) {
      liveCount++;
      if (!isCurrentlyActive) {
        parsed.testStatus = 'active';
        parsed.lastError = null;
        const now = new Date().toISOString();
        db.prepare("UPDATE providerConnections SET isActive = 1, data = ?, updatedAt = ? WHERE id = ?")
          .run(JSON.stringify(parsed), now, r.id);
        reactivatedCount++;
      }
    } else {
      deadCount++;
      if (isCurrentlyActive) {
        parsed.testStatus = 'error';
        parsed.lastError = testRes.error || 'Token invalid or revoked';
        const now = new Date().toISOString();
        db.prepare("UPDATE providerConnections SET isActive = 0, data = ?, updatedAt = ? WHERE id = ?")
          .run(JSON.stringify(parsed), now, r.id);
      }
    }
  }
  db.close();

  return {
    success: true,
    totalScanned: rows.length,
    liveCount,
    reactivatedCount,
    deadCount
  };
}

function launchAutoLoginRunner(mode = '', stealth = false) {
  const candidates = [
    'D:\\Music\\Ruby\\Produce for Customer\\Tools\\Automation Browser\\Local\\9router\\patches',
    path.resolve(__dirname, '..'),
    path.resolve(__dirname),
    'D:\\Music\\Ruby\\Produce for Customer\\Tools\\9router-patches'
  ];
  const dir = candidates.find(d => fs.existsSync(path.join(d, '4-chay-fix-loi-revoked.bat'))) || candidates[0];
  let batFile = '1-chay-tat-ca-can-nap.bat';
  if (mode === 'domain') batFile = '3-chay-chi-domain.bat';
  else if (mode === 'gmail') batFile = '2-chay-chi-gmail.bat';
  else if (mode === 'revoked') batFile = '4-chay-fix-loi-revoked.bat';

  try {
    const { spawn } = require('child_process');

    if (stealth) {
      const scriptCandidates = [
        path.join(dir, 'auto-login-all-chrome-sso.mjs'),
        path.join(dir, 'auto-login-all-chrome-sso.js')
      ];
      const scriptPath = scriptCandidates.find(p => fs.existsSync(p)) || scriptCandidates[0];
      const logDir = path.join(dir, 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logFilePath = path.join(logDir, 'auto-login.log');
      const outFd = fs.openSync(logFilePath, 'a');

      const scriptArgs = [scriptPath, '--stealth'];
      if (mode === 'domain') scriptArgs.push('--domain');
      else if (mode === 'gmail') scriptArgs.push('--gmail');
      else if (mode === 'revoked') scriptArgs.push('--revoked');

      const child = spawn(process.execPath, scriptArgs, {
        cwd: dir,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', outFd, outFd]
      });
      child.unref();

      const modeText = mode === 'revoked' ? 'Fix lỗi Revoked' : (mode === 'domain' ? 'Chỉ Domain' : (mode === 'gmail' ? 'Chỉ Gmail' : 'Tất cả cần nạp'));
      return {
        success: true,
        stealth: true,
        message: `🥷 Đã khởi động Chạy Ẩn Tàng Hình [${modeText}]! Không hiện cửa sổ Terminal và Trình duyệt.`
      };
    }

    const fullBatPath = path.join(dir, batFile);

    // Launch via cmd.exe start to ensure an interactive, visible window on desktop
    const child = spawn('cmd.exe', ['/c', 'start', `9Router - ${batFile}`, 'cmd.exe', '/k', fullBatPath], {
      cwd: dir,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { success: true, stealth: false, message: `🚀 Đã mở cửa sổ Terminal [${batFile}] trên màn hình!` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getChromeProfilesWith9RouterStatus() {
  const chromeUserData = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  const localStatePath = path.join(chromeUserData, 'Local State');
  if (!fs.existsSync(localStatePath)) {
    return { success: false, error: 'Chrome User Data not found on this machine', profiles: [] };
  }

  let profilesMap = {};
  try {
    const state = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    profilesMap = state.profile?.info_cache || {};
  } catch (err) {
    return { success: false, error: 'Failed to read Chrome Local State: ' + err.message, profiles: [] };
  }

  const dbPath = getNineRouterDbPath();
  const dbConnections = new Map();
  if (dbPath) {
    try {
      const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
      const rows = db.prepare("SELECT id, name, email, priority, isActive, data, updatedAt FROM providerConnections WHERE provider = 'codex'").all();
      db.close();
      for (const r of rows) {
        const norm = normalizeEmail(r.email || r.name);
        if (norm) {
          let parsed = {};
          try { parsed = JSON.parse(r.data || '{}'); } catch {}
          dbConnections.set(norm, {
            id: r.id,
            name: r.name,
            isActive: Boolean(r.isActive),
            priority: r.priority,
            testStatus: parsed.testStatus || (parsed.lastError ? 'error' : 'active'),
            lastError: parsed.lastError || null,
            updatedAt: r.updatedAt
          });
        }
      }
    } catch (err) {
      console.warn('[ChromeSSO] Error reading 9Router DB:', err.message);
    }
  }

  const result = [];
  for (const [dir, info] of Object.entries(profilesMap)) {
    const email = normalizeEmail(info.user_name || info.hosted_domain || info.email || '');
    const conn = email ? dbConnections.get(email) : null;
    result.push({
      profileDir: dir,
      profileName: info.name || dir,
      email: email || '',
      gaiaName: info.gaia_name || '',
      in9Router: Boolean(conn),
      connectionId: conn ? conn.id : null,
      isActive: conn ? conn.isActive : false,
      priority: conn ? conn.priority : null,
      testStatus: conn ? conn.testStatus : 'not_connected',
      lastError: conn ? conn.lastError : null
    });
  }

  result.sort((a, b) => {
    if (a.in9Router && !b.in9Router) return -1;
    if (!a.in9Router && b.in9Router) return 1;
    return a.profileName.localeCompare(b.profileName);
  });

  return {
    success: true,
    total: result.length,
    in9RouterCount: result.filter(p => p.in9Router).length,
    profiles: result
  };
}

async function loginCodexWithChromeProfile({ profileDir, email = '', timeoutMs = 60000 }) {
  if (!profileDir) throw new Error('profileDir is required');

  const chromeExe = findChromeExecutable();
  const chromeUserData = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
  const redirectUri = 'http://localhost:1455/auth/callback';

  const authUrl = `https://auth.openai.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+profile+email+offline_access&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&id_token_add_organizations=true&codex_cli_simplified_flow=true&originator=codex_cli_rs`;

  let server = null;
  const codePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (server) try { server.close(); } catch {}
      reject(new Error('OAuth callback timed out after ' + (timeoutMs / 1000) + 's'));
    }, timeoutMs);

    server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost:1455');
        if (reqUrl.pathname === '/auth/callback') {
          const code = reqUrl.searchParams.get('code');
          const returnedState = reqUrl.searchParams.get('state');
          const error = reqUrl.searchParams.get('error');

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:40px;background:#0d1117;color:#fff;">
            <h2 style="color:#22c55e;">✅ Đăng nhập Google SSO thành công!</h2>
            <p>9Router đã nhận được mã xác thực và đang đồng bộ tài khoản...</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body></html>`);

          clearTimeout(timer);
          try { server.close(); } catch {}

          if (error) {
            reject(new Error('OpenAI Auth error: ' + error));
          } else if (code) {
            resolve({ code, returnedState });
          } else {
            reject(new Error('No code returned from OpenAI callback'));
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (err) {
        clearTimeout(timer);
        try { server.close(); } catch {}
        reject(err);
      }
    });

    server.listen(1455, '127.0.0.1', () => {
      console.log('[ChromeSSO] Callback server listening on 127.0.0.1:1455');
    });

    server.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error('Cannot bind callback server on port 1455: ' + err.message));
    });
  });

  let browser = null;
  try {
    if (puppeteer) {
      try {
        browser = await puppeteer.launch({
          executablePath: chromeExe,
          headless: false,
          userDataDir: chromeUserData,
          defaultViewport: null,
          ignoreDefaultArgs: ['--enable-automation'],
          args: [
            `--profile-directory=${profileDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled'
          ]
        });
      } catch (launchErr) {
        console.warn(`[ChromeSSO] Puppeteer launch with userDataDir failed (${launchErr.message}). Falling back to native Chrome spawn...`);
      }
    }

    if (browser) {
      const pages = await browser.pages();
      const page = pages[0] || (await browser.newPage());
      await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    } else {
      const child = spawn(chromeExe, [`--profile-directory=${profileDir}`, authUrl], { detached: true, stdio: 'ignore' });
      child.unref();
    }

    const { code } = await codePromise;

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
      throw new Error('Token exchange failed: ' + (tokenData.error_description || tokenData.error || tokenRes.status));
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const idToken = tokenData.id_token;
    const expiresIn = tokenData.expires_in;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined;

    const idTokenClaims = parseJwt(idToken || '');
    const resolvedEmail = normalizeEmail(idTokenClaims.email || email);
    const resolvedName = idTokenClaims.name || resolvedEmail;
    const planType = extractChatGPTPlanType(tokenData);
    const chatgptAccountId = idTokenClaims['https://api.openai.com/auth']?.user_id || resolvedEmail;

    const dbPath = getNineRouterDbPath();
    if (!dbPath) throw new Error('9Router database not found');

    const db = new DatabaseSync(dbPath, { open: true });
    const existing = db.prepare("SELECT id, data FROM providerConnections WHERE provider = 'codex' AND (LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?))").get(resolvedEmail, resolvedEmail);
    const nowIso = new Date().toISOString();

    let connectionId;
    if (existing) {
      connectionId = existing.id;
      let prevData = {};
      try { prevData = JSON.parse(existing.data || '{}'); } catch {}

      const updatedData = {
        ...prevData,
        accessToken,
        refreshToken: refreshToken || prevData.refreshToken,
        idToken: idToken || prevData.idToken,
        expiresIn: expiresIn || prevData.expiresIn,
        expiresAt: expiresAt || prevData.expiresAt,
        lastRefreshAt: nowIso,
        testStatus: 'active',
        providerSpecificData: {
          chatgptAccountId,
          chatgptPlanType: planType
        }
      };
      delete updatedData.errorCode;
      delete updatedData.lastError;
      delete updatedData.lastErrorAt;

      db.prepare(`UPDATE providerConnections SET isActive = 1, data = ?, updatedAt = ? WHERE id = ?`)
        .run(JSON.stringify(updatedData), nowIso, connectionId);
    } else {
      connectionId = crypto.randomUUID();
      const maxPriorityRow = db.prepare("SELECT MAX(priority) as maxP FROM providerConnections WHERE provider = 'codex'").get();
      const nextPriority = (maxPriorityRow?.maxP || 0) + 1;

      const newData = {
        accessToken,
        refreshToken,
        idToken,
        expiresIn,
        expiresAt,
        lastRefreshAt: nowIso,
        testStatus: 'active',
        providerSpecificData: {
          chatgptAccountId,
          chatgptPlanType: planType
        }
      };

      db.prepare(`INSERT INTO providerConnections (id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt) VALUES (?, 'codex', 'oauth', ?, ?, ?, 1, ?, ?, ?)`)
        .run(connectionId, resolvedName, resolvedEmail, nextPriority, JSON.stringify(newData), nowIso, nowIso);
    }
    db.close();

    exportSessionAndCookies(resolvedEmail, {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      expires_in: expiresIn,
      expiresAt
    }, []);

    return {
      success: true,
      email: resolvedEmail,
      name: resolvedName,
      connectionId,
      expiresAt
    };
  } finally {
    if (server) try { server.close(); } catch {}
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

function getAutoLoginLogs(lineCount = 80) {
  const candidates = [
    'D:\\Music\\Ruby\\Produce for Customer\\Tools\\Automation Browser\\Local\\9router\\patches\\logs\\auto-login.log',
    'D:\\Music\\Ruby\\Produce for Customer\\Tools\\9router-patches\\logs\\auto-login.log',
    path.join(__dirname, '..', 'logs', 'auto-login.log'),
    path.join(__dirname, 'logs', 'auto-login.log')
  ];
  let logFile = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      logFile = c;
      break;
    }
  }
  if (!logFile) {
    return { success: true, logs: 'Chưa có file log. Vui lòng bấm chạy Auto-Login để ghi nhật ký.' };
  }
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n');
    const tail = lines.slice(-lineCount).join('\n');
    return { success: true, logs: tail, totalLines: lines.length, logPath: logFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

let autoUpdateService = null;
try {
  const auCandidates = [
    path.join(__dirname, 'auto-update-service.js'),
    'D:/Music/Ruby/Produce for Customer/Tools/9router-patches/automation/auto-update-service.js'
  ];
  for (const c of auCandidates) {
    if (fs.existsSync(c)) {
      autoUpdateService = require(c);
      break;
    }
  }
} catch {}

module.exports = {
  getChromeProfilesWith9RouterStatus,
  getUnifiedAccountStats,
  runLiveAutoDetectAndReactivate,
  launchAutoLoginRunner,
  getAutoLoginLogs,
  handleAccountDeactivatedSync,
  loginCodexWithChromeProfile,
  findChromeExecutable,
  getNineRouterDbPath,
  checkUpdate: () => autoUpdateService ? autoUpdateService.checkUpdate() : Promise.resolve({ error: 'Service not available' }),
  triggerUpdate: (target) => autoUpdateService ? autoUpdateService.triggerUpdate(target) : { success: false, message: 'Service not available' },
  getUpdateProgress: (n) => autoUpdateService ? autoUpdateService.getUpdateProgress(n) : { status: 'idle', logs: [] },
  getUpdateConfig: () => autoUpdateService ? autoUpdateService.getUpdateConfig() : {},
  saveUpdateConfig: (c) => autoUpdateService ? autoUpdateService.saveUpdateConfig(c) : {}
};
