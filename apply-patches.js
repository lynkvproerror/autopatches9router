// ============================================================
// 9router Patch Script (Node.js)
// Usage: node apply-patches.js --app-root <prepared-app-root> --scope <dashboard|api|all>
// Re-apply all custom patches after npm update
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const getArgValue = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
};
const requestedScope = getArgValue('--scope') || 'all';
const requestedAppRoot = getArgValue('--app-root');
const listTargets = args.includes('--list-targets');
const requestedScopeHash = getArgValue('--scope-hash');
const includeExperimental = args.includes('--experimental');

if (!requestedAppRoot && !listTargets && !requestedScopeHash) {
    console.error('Refusing to patch an implicit global install. Use automation/9router-control.ps1 or pass --app-root explicitly.');
    process.exit(1);
}

const BASE = requestedAppRoot ? path.resolve(requestedAppRoot) : null;
const BUILD = BASE ? path.join(BASE, '.next-cli-build') : null;

function getQuotaBundleAliases(content) {
    if (content.includes('[eM,eO]=(0,i.useState)(1)')) {
        // Detect loadingSetter: v0.5.40 uses 'z', v0.5.45 uses 'L'
        const loadingSetter = content.includes('eB=(0,i.useCallback)(async(e,t)=>{L(t=>') ? 'L' : 'z';
        return {
            react: 'i', list: 'e8', quotaMap: 'I', quotaSetter: '_', loadingSetter, errorSetter: 'R',
            busy: 'eD', busySetter: 'eT', fetchAccounts: 'eV', fetchQuota: 'eB', page: 'eM', pageSetter: 'eO',
            toggle: 'e9', emptyPredicate: 'e6', statusFilter: 'ef', bulkLabel: 'e7', displayName: 'D',
            sortDeps: '[r,I,e$,ef,eN]', refreshBusy: 'Q', refreshBusySetter: 'Y', initialLoadingSetter: 'et',
            countdownSetter: 'Z', refreshCallback: 'e1', generationRef: 'eG', afterCallback: 'eW',
            cardComponent: 'C', successValue: 'i', emptyFlag: 'tt', lastRefreshSetter: 'V',
        };
    }
    if (content.includes('[eP,eq]=(0,s.useState)(1)')) {
        return {
            react: 's', list: 'eZ', quotaMap: 'M', quotaSetter: 'O', loadingSetter: '_', errorSetter: 'L',
            busy: 'e$', busySetter: 'eE', fetchAccounts: 'eJ', fetchQuota: 'eK', page: 'eP', pageSetter: 'eq',
            toggle: 'e1', emptyPredicate: 'e0', statusFilter: 'eb', bulkLabel: 'e5', displayName: 'P',
            sortDeps: '[r,M,eN,eb,ek]', refreshBusy: 'V', refreshBusySetter: 'W', initialLoadingSetter: 'Z',
            countdownSetter: 'Q', refreshCallback: 'eQ', generationRef: 'eU', afterCallback: 'eG',
            cardComponent: 'w', successValue: 's', emptyFlag: 'e3', lastRefreshSetter: 'G',
        };
    }
    throw new Error('Unsupported quota bundle layout');
}

function getProviderDetailAliases(content) {
    const providerMatch = content.match(/([A-Za-z_$][\w$]*)=t\.id/);
    const modalMatch = content.match(/([A-Za-z_$][\w$]*)\(\{title:"Delete Connection"/);
    if (!providerMatch || !modalMatch) throw new Error('Unsupported provider detail bundle layout');
    return { providerId: providerMatch[1], modalSetter: modalMatch[1] };
}

// ============================================================
// PATCH 1: Bulk Import - Multi-format auto-convert
// ============================================================
function patchBulkImport() {
    console.log('[PATCH 1] Bulk Import: multi-format auto-convert');
    const file = path.join(BUILD, 'server/app/api/oauth/codex/bulk-import/route.js');
    if (!fs.existsSync(file)) { console.log('  ✗ File not found'); return false; }
    
    let c = fs.readFileSync(file, 'utf8');
    const normalizerMarker = '/*__9router_bulk_import_normalizer_v2__*/';
    if (c.includes(normalizerMarker)) {
        console.log('  → Already patched'); return true;
    }

    const target = '!Array.isArray(c)||0===c.length)return e.NextResponse.json({error:"No accounts provided"},{status:400});let d=[],h=0,i=0;';
    const legacyNormalizer = 'Array.isArray(c)&&(c=c.map(function(item){if(!item||"object"!=typeof item||Array.isArray(item))return item;if(item.credentials&&item.credentials.access_token&&!item.accessToken){var cr=item.credentials,ex=item.extra||{};return{accessToken:cr.access_token||"",refreshToken:cr.refresh_token||"",email:cr.email||ex.email||"",expiresAt:cr.expires_at?new Date(cr.expires_at*1000).toISOString():undefined,providerSpecificData:{chatgptAccountId:ex.source_target_id||cr.chatgpt_account_id||"",chatgptPlanType:cr.plan_type||item.plan_type||""}}}if(item.access_token&&!item.accessToken)return{accessToken:item.access_token||"",refreshToken:item.refresh_token||item.refreshToken||"",email:item.email||"",expiresAt:item.expires_at?"number"==typeof item.expires_at?new Date(item.expires_at*1000).toISOString():item.expires_at:item.expiresAt||undefined,providerSpecificData:item.providerSpecificData||{chatgptAccountId:item.chatgpt_account_id||"",chatgptPlanType:item.chatgpt_plan_type||item.plan_type||""}};if(!item.accessToken&&(item.token||item.session_token||item.sessionToken))return{accessToken:item.token||item.session_token||item.sessionToken||"",refreshToken:item.refresh_token||item.refreshToken||"",email:item.email||"",expiresAt:item.expiresAt||item.expires_at||undefined,providerSpecificData:item.providerSpecificData||{}};return item})),';
    const normalizer = '/*__9router_bulk_import_normalizer_v2__*/var __9routerNormalizeExpiry=function(value){if(null==value||""===value)return void 0;if("number"==typeof value){var numericDate=new Date(value*1000);return isNaN(numericDate.getTime())?void 0:numericDate.toISOString()}var parsedDate=new Date(value);return isNaN(parsedDate.getTime())?value:parsedDate.toISOString()};Array.isArray(c)&&(c=c.map(function(item){if(!item||"object"!=typeof item||Array.isArray(item))return item;if(item.tokens&&item.tokens.access_token&&!item.accessToken){var tk=item.tokens;return{accessToken:tk.access_token||"",refreshToken:tk.refresh_token||tk.refreshToken||item.refresh_token||item.refreshToken||void 0,idToken:tk.id_token||tk.idToken||item.id_token||item.idToken||void 0,email:item.email||tk.email||"",expiresAt:__9routerNormalizeExpiry(item.expires_at||item.expiresAt||item.expired),lastRefreshAt:item.last_refresh||item.lastRefreshAt||void 0,providerSpecificData:{chatgptAccountId:tk.account_id||item.account_id||"",chatgptPlanType:item.plan_type||item.chatgpt_plan_type||""}}}if(item.credentials&&item.credentials.access_token&&!item.accessToken){var cr=item.credentials,ex=item.extra||{};return{accessToken:cr.access_token||"",refreshToken:cr.refresh_token||void 0,idToken:cr.id_token||cr.idToken||void 0,sessionToken:cr.session_token||cr.sessionToken||void 0,email:cr.email||ex.email||"",expiresAt:__9routerNormalizeExpiry(cr.expires_at||cr.expiresAt),lastRefreshAt:cr.last_refresh||cr.lastRefreshAt||void 0,providerSpecificData:{chatgptAccountId:ex.source_target_id||cr.chatgpt_account_id||cr.account_id||"",chatgptPlanType:cr.plan_type||cr.chatgpt_plan_type||item.plan_type||""}}}if(item.access_token&&!item.accessToken){var flatExpiry=item.expires_at||item.expiresAt||item.expired;return{accessToken:item.access_token||"",refreshToken:item.refresh_token||item.refreshToken||void 0,idToken:item.id_token||item.idToken||void 0,sessionToken:item.session_token||item.sessionToken||void 0,email:item.email||"",expiresAt:__9routerNormalizeExpiry(flatExpiry),lastRefreshAt:item.last_refresh||item.lastRefreshAt||void 0,providerSpecificData:item.providerSpecificData||{chatgptAccountId:item.chatgpt_account_id||item.account_id||"",chatgptPlanType:item.chatgpt_plan_type||item.plan_type||""}}}if(!item.accessToken&&item.token)return{accessToken:item.token||"",refreshToken:item.refresh_token||item.refreshToken||void 0,idToken:item.id_token||item.idToken||void 0,sessionToken:item.session_token||item.sessionToken||void 0,email:item.email||"",expiresAt:__9routerNormalizeExpiry(item.expiresAt||item.expires_at||item.expired),lastRefreshAt:item.last_refresh||item.lastRefreshAt||void 0,providerSpecificData:item.providerSpecificData||{}};return item})),';

    if (c.includes(legacyNormalizer)) {
        c = c.replace(legacyNormalizer, normalizer);
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Upgraded: v2 credential normalizer');
        return true;
    }
    if (!c.includes(target)) { console.log('  ✗ Target pattern not found'); return false; }

    c = c.replace(target, normalizer + target);
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Patched: v2 credential normalizer');
    return true;
}

// ============================================================
// PATCH 18: Redirect legacy dashboard routes away from the API port
// ============================================================
function patchApiDashboardRedirect() {
    console.log('[PATCH 18] API dashboard redirect');
    const file = path.join(BASE, 'custom-server.js');
    if (!fs.existsSync(file)) { console.log('  ✗ custom-server.js not found'); return false; }

    let content = fs.readFileSync(file, 'utf8');
    const marker = 'x-9router-dashboard-redirect';
    const redirectBlock = [
        '    let requestUrl;',
        '    try { requestUrl = new URL(req.url || "/", "http://api.local"); } catch {}',
        '    if (requestUrl && (requestUrl.pathname === "/dashboard" || requestUrl.pathname.startsWith("/dashboard/"))) {',
        '      const requestHost = String((req.headers && req.headers.host) || "").toLowerCase();',
        '      const dashboardHost = requestHost === "localhost" || requestHost.startsWith("localhost:") ? "localhost" : "127.0.0.1";',
        '      const dashboardOrigin = `http://${dashboardHost}:20128`;',
        '      res.statusCode = 307;',
        '      res.setHeader("location", `${dashboardOrigin}${requestUrl.pathname}${requestUrl.search}`);',
        '      res.setHeader("cache-control", "no-store");',
        '      res.setHeader("x-9router-dashboard-redirect", "20128");',
        '      return res.end();',
        '    }',
        '',
    ].join('\n');

    if (content.includes(marker)) {
        const patchedBlock = /    let requestUrl;[\s\S]*?    }\r?\n(?=    const socketIp =)/;
        const complete = patchedBlock.test(content) &&
            content.includes('requestUrl.pathname === "/dashboard"') &&
            content.includes('requestUrl.pathname.startsWith("/dashboard/")') &&
            content.includes('res.statusCode = 307');
        if (!complete) { console.log('  ✗ Partial API dashboard redirect patch found'); return false; }
        if (content.includes('const dashboardOrigin = `http://${dashboardHost}:20128`;')) {
            console.log('  → Legacy dashboard redirect already present');
            return true;
        }
        content = content.replace(patchedBlock, redirectBlock);
        fs.writeFileSync(file, content, 'utf8');
        console.log('  ✅ Upgraded dashboard redirect to preserve the loopback login host');
        return true;
    }

    const handlerAnchor = /(  const wrapped = \(req, res\) => \{\r?\n)(    const socketIp =)/;
    if (!handlerAnchor.test(content)) {
        console.log('  ✗ custom-server handler anchor not found');
        return false;
    }

    content = content.replace(handlerAnchor, (_match, prefix, socketLine) =>
        `${prefix}${redirectBlock}${socketLine}`);
    if ((content.match(/x-9router-dashboard-redirect/g) || []).length !== 1) {
        console.log('  ✗ API dashboard redirect validation failed');
        return false;
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log('  ✅ Redirected /dashboard routes from API port 53220 to dashboard port 20128');
    return true;
}

// ============================================================
// PATCH 2: Providers list - refresh 30s->5min, show 20->100
// ============================================================
function patchProvidersPage() {
    console.log('[PATCH 2] Providers list: refresh=5min, show=100');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/providers');
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    let changed = false;
    
    if (c.includes('setInterval(u,3e4)')) {
        c = c.split('setInterval(u,3e4)').join('setInterval(u,3e5)');
        console.log('  ✅ Refresh: 30s → 5min');
        changed = true;
    }
    if (c.includes('.slice(0,20)')) {
        c = c.split('M.slice(0,20)').join('M.slice(0,100)');
        c = c.split('M.length-20').join('M.length-100');
        console.log('  ✅ Show: 20 → 100');
        changed = true;
    }
    if (changed) fs.writeFileSync(file, c, 'utf8');
    else console.log('  → Already patched');
    return true;
}

// ============================================================
// PATCH 3: Quota page - refresh 60s->5min, default pageSize 500
// ============================================================
function patchQuotaPage() {
    console.log('[PATCH 3] Quota: refresh=5min, pageSize=500, countdown=300');
    
    // Find quota page
    const quotaDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(quotaDir)) { console.log('  ✗ Quota dir not found'); return false; }
    const pageFile = fs.readdirSync(quotaDir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(quotaDir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    let changed = false;
    
    const replacements = [
        // Refresh interval: 60s -> 5min (target setInterval only)
        ['setInterval(()=>{eQ()},6e4)', 'setInterval(()=>{eQ()},3e5)', 'Refresh: 60s → 5min'],
        ['setInterval(()=>eQ(),6e4)', 'setInterval(()=>eQ(),3e5)', 'Refresh (visibility): 60s → 5min'],
        ['setInterval(()=>{e1()},6e4)', 'setInterval(()=>{e1()},3e5)', 'Refresh: 60s → 5min'],
        ['setInterval(()=>e1(),6e4)', 'setInterval(()=>e1(),3e5)', 'Refresh (visibility): 60s → 5min'],
        // Countdown state + reset
        ['useState)(60)', 'useState)(300)', 'Countdown init: 60 → 300'],
        ['e<=1?60:e-1', 'e<=1?300:e-1', 'Countdown loop: 60 → 300'],
        ['Q(60)', 'Q(300)', 'Countdown reset: Q(60) → Q(300)'],
        ['Z(60)', 'Z(300)', 'Countdown reset: Z(60) → Z(300)'],
        // Default pageSize
        ['useState)(20)', 'useState)(500)', 'Default pageSize: 20 → 500'],
        ['useState)(100)', 'useState)(500)', 'Default pageSize: 100 → 500'],
        ['useState)(String(20))', 'useState)(String(500))', 'Default custom input: 20 → 500'],
        ['useState)(String(100))', 'useState)(String(500))', 'Default custom input: 100 → 500'],
        ['pageSize:20', 'pageSize:500', 'Pagination init: 20 → 500'],
        ['pageSize:100', 'pageSize:500', 'Pagination init: 100 → 500'],
        // PageSize dropdown options
        ['d=[10,20,50,100]', 'd=[50,100,200,500]', 'PageSize options'],
    ];
    
    for (const [from, to, desc] of replacements) {
        if (c.includes(from)) {
            c = c.split(from).join(to);
            console.log(`  ✅ ${desc}`);
            changed = true;
        }
    }
    
    const quotaAliases = getQuotaBundleAliases(c);

    // Guard auto-refresh interval: skip if refreshBusy to prevent stale generation cancel
    const refreshGuards = [
        [
            `setInterval(()=>{${quotaAliases.refreshCallback}()},3e5)`,
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(300)},3e5)`,
            'Auto-refresh guard (main)'
        ],
        [
            `setInterval(()=>${quotaAliases.refreshCallback}(),3e5)`,
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(300)},3e5)`,
            'Auto-refresh guard (visibility)'
        ],
    ];
    for (const [from, to, desc] of refreshGuards) {
        if (c.includes(from)) {
            c = c.split(from).join(to);
            console.log(`  ✅ ${desc}`);
            changed = true;
        }
    }

    const refreshReady = c.includes(`setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}()`) &&
        c.includes(`${quotaAliases.countdownSetter}(300)`);
    if (!refreshReady) { console.log('  ✗ Client quota refresh timing is not fully patched'); return false; }
    if (changed) fs.writeFileSync(file, c, 'utf8');
    else console.log('  → Client already patched');

    // Keep the RSC/server render defaults identical to the client bundle.
    // A mismatch here triggers React hydration error #418 on /dashboard/quota.
    const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page.js');
    if (!fs.existsSync(serverFile)) { console.log('  ✗ Server quota page not found'); return false; }
    let server = fs.readFileSync(serverFile, 'utf8');
    let serverChanged = false;
    const serverReplacements = [
        ['useState)(60)', 'useState)(300)', 'Server countdown init: 60 → 300'],
        ['S(!0),U(60);', 'S(!0),U(300);', 'Server countdown reset: 60 → 300'],
        ['U(!0),W(60);', 'U(!0),W(300);', 'Server countdown reset: 60 → 300'],
        ['useState)(20)', 'useState)(500)', 'Server pageSize: 20 → 500'],
        ['useState)(100)', 'useState)(500)', 'Server pageSize: 100 → 500'],
        ['useState)(String(20))', 'useState)(String(500))', 'Server custom pageSize: 20 → 500'],
        ['useState)(String(100))', 'useState)(String(500))', 'Server custom pageSize: 100 → 500'],
        ['pageSize:20', 'pageSize:500', 'Server pagination init: 20 → 500'],
        ['pageSize:100', 'pageSize:500', 'Server pagination init: 100 → 500'],
        ['[10,20,50,100]', '[50,100,200,500]', 'Server pageSize options'],
    ];
    for (const [from, to, desc] of serverReplacements) {
        if (server.includes(from)) {
            server = server.split(from).join(to);
            console.log(`  ✅ ${desc}`);
            serverChanged = true;
        }
    }
    if (serverChanged) fs.writeFileSync(serverFile, server, 'utf8');
    const serverReady = [
        'useState)(300)',
        'useState)(500)',
        'useState)(String(500))',
        'pageSize:500',
        '[50,100,200,500]',
    ].every((target) => server.includes(target)) &&
        (server.includes('S(!0),U(300);') || server.includes('U(!0),W(300);'));
    if (!serverReady) { console.log('  ✗ Server/client quota defaults are not aligned'); return false; }
    if (!serverChanged) console.log('  → Server already patched');
    return true;
}

// ============================================================
// PATCH 19: Recompute account-list totalPages from total/pageSize
// ============================================================
function patchQuotaPaginationNormalization() {
    console.log('[PATCH 19] Quota: normalize account pagination totals');

    const clientDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(clientDir)) { console.log('  ✗ Quota dir not found'); return false; }
    const clientFiles = fs.readdirSync(clientDir)
        .filter(f => f.startsWith('page-') && f.endsWith('.js'))
        .map(f => path.join(clientDir, f));
    const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page.js');
    if (clientFiles.length !== 1 || !fs.existsSync(serverFile)) {
        console.log('  ✗ Expected one client quota bundle and one server quota bundle');
        return false;
    }

    const helper = 'function __9rNormalizePagination(e,t){let r=e||{page:1,pageSize:t,total:0,totalPages:1};return{...r,totalPages:Math.max(1,Math.ceil((r.total||0)/(r.pageSize||t||1)))}}';
    const responsePattern = /\(([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.pagination,\1\|\|\{page:1,pageSize:([A-Za-z_$][\w$]*),total:0,totalPages:1\}\)/;
    const normalizedCallPattern = /__9rNormalizePagination\([A-Za-z_$][\w$]*\.pagination,[A-Za-z_$][\w$]*\)/;
    const componentPattern = /function ([A-Za-z_$][\w$]*)\(\)\{let\{copied:/;

    const transformedBundles = [];
    for (const file of [...clientFiles, serverFile]) {
        let content = fs.readFileSync(file, 'utf8');
        let changed = false;

        if (!content.includes(helper)) {
            const component = content.match(componentPattern);
            if (!component) {
                console.log(`  ✗ Component anchor not found in ${file}`);
                return false;
            }
            content = content.replace(`function ${component[1]}(){`, `${helper}function ${component[1]}(){`);
            changed = true;
        }

        if (responsePattern.test(content)) {
            content = content.replace(responsePattern, (_match, _temp, response, pageSize) =>
                `__9rNormalizePagination(${response}.pagination,${pageSize})`);
            changed = true;
        } else if (!normalizedCallPattern.test(content)) {
            console.log(`  ✗ Pagination response anchor not found in ${file}`);
            return false;
        }

        transformedBundles.push({ file, content, changed });
    }

    for (const result of transformedBundles) {
        if (result.changed) {
            fs.writeFileSync(result.file, result.content, 'utf8');
            console.log(`  ✅ Normalized pagination in ${path.basename(result.file)}`);
        } else {
            console.log(`  → Pagination already normalized in ${path.basename(result.file)}`);
        }
    }
    return true;
}

// ============================================================
// PATCH 4: Auto-enable AutoPing after Add/BulkAdd
// ============================================================
function patchAutoPingEnable() {
    console.log('[PATCH 4] Auto-enable AutoPing after Add/BulkAdd');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/providers/[id]');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const { providerId } = getProviderDetailAliases(c);

    const newTT = [
        'tT=async()=>{',
        `const __9rProviderId=${providerId};`,
        'await tg();',
        'try{',
        'if(M[__9rProviderId]){',
        'let __9rProvidersResponse=await fetch("/api/providers",{cache:"no-store"}),',
        '__9rProviderData=await __9rProvidersResponse.json(),',
        '__9rConnections=(__9rProviderData.connections||[]).filter(e=>e.provider===__9rProviderId&&"oauth"===e.authType),',
        '__9rPing={...eC,enabled:!0,connections:{}};',
        '__9rConnections.forEach(e=>{__9rPing.connections[e.id]=!0});',
        'await tj(__9rPing)',
        '}',
        '}catch(e){console.log("Auto-ping enable error:",e)}',
        'T(!1)}'
    ].join('');

    if (c.includes('Auto-ping enable error')) {
        const start = c.indexOf('tT=async()=>{');
        const endMarker = 'Auto-ping enable error:",e)}T(!1)}';
        const end = c.indexOf(endMarker, start);
        if (start < 0 || end < start) {
            console.log('  ✗ Existing AutoPing patch boundaries not found');
            return false;
        }
        const current = c.slice(start, end + endMarker.length);
        if (current === newTT) {
            console.log('  → Already patched');
            return true;
        }
        c = c.slice(0, start) + newTT + c.slice(end + endMarker.length);
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Upgraded AutoPing provider binding');
        return true;
    }

    // 0.5.40 moved provider success callbacks and AutoPing state into a new bundle layout.
    const modernSuccess = 'tI=()=>{tj(),O(!1)}';
    if (c.includes(modernSuccess)) {
        const modernHelper = [
            '__9rEnableProviderAutoPing=async()=>{',
            'await tj();',
            'try{',
            `if(M[${providerId}]){`,
            'let __9rProvidersResponse=await fetch("/api/providers",{cache:"no-store"}),',
            '__9rProviderData=await __9rProvidersResponse.json(),',
            `__9rConnections=(__9rProviderData.connections||[]).filter(e=>e.provider===${providerId}&&"oauth"===e.authType),`,
            '__9rPing={...eS,enabled:!0,connections:{}};',
            '__9rConnections.forEach(e=>{__9rPing.connections[e.id]=!0});',
            'await tC(__9rPing)',
            '}',
            '}catch(e){console.log("Auto-ping enable error:",e)}',
            '}',
        ].join('');
        const modernReplacement = modernHelper + ',tI=async()=>{await __9rEnableProviderAutoPing();O(!1)}';
        c = c.replace(modernSuccess, modernReplacement);

        const saveSuccess = 'if(t.ok){await tj(),z(!1);return}';
        if (c.includes(saveSuccess)) {
            c = c.replace(saveSuccess, 'if(t.ok){await __9rEnableProviderAutoPing(),z(!1);return}');
        }

        const bulkSuccess = `"codex"===${providerId}&&(0,i.jsx)(K,{isOpen:J,onClose:()=>W(!1),onSuccess:tj})`;
        if (c.includes(bulkSuccess)) {
            c = c.replace(
                bulkSuccess,
                `"codex"===${providerId}&&(0,i.jsx)(K,{isOpen:J,onClose:()=>W(!1),onSuccess:async()=>{await __9rEnableProviderAutoPing();W(!1)}})`,
            );
        }

        const modernReady = c.includes('__9rEnableProviderAutoPing=async()=>{') &&
            c.includes('await tC(__9rPing)') &&
            c.includes('onSuccess:async()=>{await __9rEnableProviderAutoPing();W(!1)}');
        if (!modernReady) {
            console.log('  ✗ Modern AutoPing layout could not be patched completely');
            return false;
        }
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Added AutoPing enable flow for the 0.5.40 provider layout');
        return true;
    }
    
    const oldTT = 'tT=()=>{tg(),T(!1)}';
    if (!c.includes(oldTT)) {
        console.log('  ✗ Target pattern not found');
        return false;
    }
    
    c = c.replace(oldTT, newTT);
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ onSuccess now auto-enables AutoPing for all connections');
    return true;
}


// ============================================================
// PATCH 5: Bulk Actions on Quota Page
// ============================================================
function patchQuotaPageBulk() {
    console.log('[PATCH 5] Bulk Actions on Quota Page');
    const quotaDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(quotaDir)) { console.log('  ✗ Quota dir not found'); return false; }
    const pageFile = fs.readdirSync(quotaDir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(quotaDir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);
    
    if (c.includes('bulkDelete401')) {
        let upgraded = false;
        const replaceFirst = (from, to) => {
            if (!c.includes(from)) return false;
            c = c.replace(from, to);
            upgraded = true;
            return true;
        };
        const oldRemaining = [
            'const getRemaining=(q)=>{',
            '  if(!q)return 0;',
            '  if(q.remaining!==undefined)return Math.max(0,Math.round(q.remaining));',
            '  if(q.remainingPercentage!==undefined)return Math.round(q.remainingPercentage);',
            '  if(q.total&&q.total>0)return Math.round((q.total-q.used)/q.total*100);',
            '  return 0;',
            '};',
        ].join('\n');
        const newRemaining = oldRemaining.replace('if(!q)return 0;', 'if(!q)return null;').replace('  return 0;\n};', '  return null;\n};');
        replaceFirst(oldRemaining, newRemaining);

        const deactivateStart = c.indexOf('const bulkDeactivate0Weekly=async()=>{');
        const activateStart = c.indexOf('const bulkActivateWeekly=async()=>{', deactivateStart);
        if (deactivateStart < 0 || activateStart < 0) {
            console.log('  ✗ Existing zero-token action boundaries not found');
            return false;
        }
        let deactivate = c.slice(deactivateStart, activateStart);
        const oldWeeklyOnly = [
            '    const q=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));',
            '    return q&&getRemaining(q)===0;',
        ].join('\n');
        const oldNamedFallback = [
            '    const q=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"))||qList.find(q=>q.name&&q.name.toLowerCase().includes("session"));',
            '    return q&&getRemaining(q)===0;',
        ].join('\n');
        const usableTokenFallback = [
            '    const weekly=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly")&&getRemaining(q)!==null);',
            '    const session=qList.find(q=>q.name&&q.name.toLowerCase().includes("session")&&getRemaining(q)!==null);',
            '    const remaining=getRemaining(weekly||session);',
            '    return remaining===0;',
        ].join('\n');
        if (deactivate.includes(oldWeeklyOnly)) {
            deactivate = deactivate.replace(oldWeeklyOnly, usableTokenFallback);
            upgraded = true;
        } else if (deactivate.includes(oldNamedFallback)) {
            deactivate = deactivate.replace(oldNamedFallback, usableTokenFallback);
            upgraded = true;
        }
        c = c.slice(0, deactivateStart) + deactivate + c.slice(activateStart);

        const repairedActivateStart = c.indexOf('const bulkActivateWeekly=async()=>{', deactivateStart);
        const smartPriorityBoundary = c.indexOf('const bulkPriorityReassign=async()=>{', repairedActivateStart);
        const actionEnd = smartPriorityBoundary > repairedActivateStart
            ? smartPriorityBoundary
            : c.indexOf(`let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`, repairedActivateStart);
        let activate = c.slice(repairedActivateStart, actionEnd);
        const activateFallback = '    const q=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"))||qList.find(q=>q.name&&q.name.toLowerCase().includes("session"));';
        const activateWeeklyOnly = '    const q=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));';
        if (activate.includes(activateFallback)) {
            activate = activate.replace(activateFallback, activateWeeklyOnly);
            c = c.slice(0, repairedActivateStart) + activate + c.slice(actionEnd);
            upgraded = true;
        }

        const textUpgrades = [
            ['No active connections with 0% weekly remaining found on this page.', 'No active connections with 0% token remaining found on this page.'],
            ['connections with 0% weekly remaining on this page?', 'connections with 0% token remaining on this page?'],
            ['title:"Deactivate all active connections with 0% weekly quota"', 'title:"Deactivate active connections whose weekly or session token quota is 0%"'],
            ['children:"Tắt 0% Weekly"', 'children:"Tắt 0% token"'],
        ];
        for (const [from, to] of textUpgrades) replaceFirst(from, to);

        const readyDeactivateStart = c.indexOf('const bulkDeactivate0Weekly=async()=>{');
        const readyActivateStart = c.indexOf('const bulkActivateWeekly=async()=>{', readyDeactivateStart);
        const readySmartPriorityBoundary = c.indexOf('const bulkPriorityReassign=async()=>{', readyActivateStart);
        const readyEnd = readySmartPriorityBoundary > readyActivateStart
            ? readySmartPriorityBoundary
            : c.indexOf(`let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`, readyActivateStart);
        const readyDeactivate = c.slice(readyDeactivateStart, readyActivateStart);
        const readyActivate = c.slice(readyActivateStart, readyEnd);
        const ready = c.includes('children:"Tắt 0% token"') &&
            readyDeactivate.includes('const weekly=qList.find(') &&
            readyDeactivate.includes('const session=qList.find(') &&
            readyDeactivate.includes('const remaining=getRemaining(weekly||session);') &&
            !readyActivate.includes('includes("session")') &&
            c.includes('0% token remaining');
        if (!ready) { console.log('  ✗ Existing quota bulk patch could not be upgraded'); return false; }
        if (upgraded) {
            fs.writeFileSync(file, c, 'utf8');
            console.log('  ✅ Upgraded zero-token bulk action');
        } else {
            console.log('  → Already patched');
        }
        return true;
    }
    
    const targetSearch = `finally{${aliases.busySetter}(!1)}}},[${aliases.busy},${aliases.fetchAccounts},${aliases.page}]),${aliases.bulkLabel}="all"===${aliases.statusFilter}`;
    if (!c.includes(targetSearch)) {
        console.log('  ✗ Target functions pattern not found');
        return false;
    }
    
    const buttonSearch = `(0,a.jsxs)("button",{type:"button",onClick:()=>{${aliases.toggle}(${aliases.list}.filter(e=>!(e.isActive??!0)&&!${aliases.emptyPredicate}(e)).map(e=>e.id),!0)},disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50",title:"Enable connections that still have quota on the current page",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"check_circle"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Turn on Available"})]})`;
    if (!c.includes(buttonSearch)) {
        console.log('  ✗ Target button render pattern not found');
        return false;
    }
    
    const injectedFuncs = [
        `finally{${aliases.busySetter}(!1)}}},[${aliases.busy},${aliases.fetchAccounts},${aliases.page}]);`,
        'const getRemaining=(q)=>{',
        '  if(!q)return null;',
        '  if(q.remaining!==undefined)return Math.max(0,Math.round(q.remaining));',
        '  if(q.remainingPercentage!==undefined)return Math.round(q.remainingPercentage);',
        '  if(q.total&&q.total>0)return Math.round((q.total-q.used)/q.total*100);',
        '  return null;',
        '};',
        `const __9rTurnOffEmpty=async()=>{`,
        `  let targets=${aliases.list}.filter(e=>(e.isActive??!0)&&${aliases.emptyPredicate}(e));`,
        `  ${aliases.toggle}(targets.map(e=>e.id),!1);`,
        `  let k12Hit=targets.some(e=>{let p=String(${aliases.quotaMap}[e.id]?.plan||"").toLowerCase();return p.includes("k12")});`,
        '  if(k12Hit&&typeof __9rSyncK12Rotation==="function")try{await __9rSyncK12Rotation(false,"K12 b\u1ecb t\u1eaft b\u1edfi Turn off Empty")}catch(_){}',
        '};',
        `const __9rTurnOnAvailable=async()=>{`,
        `  let targets=${aliases.list}.filter(e=>!(e.isActive??!0)&&!${aliases.emptyPredicate}(e));`,
        `  ${aliases.toggle}(targets.map(e=>e.id),!0);`,
        `  let k12Hit=targets.some(e=>{let p=String(${aliases.quotaMap}[e.id]?.plan||"").toLowerCase();return p.includes("k12")});`,
        '  if(k12Hit&&typeof __9rSyncK12Rotation==="function")try{await __9rSyncK12Rotation(true,"K12 \u0111\u01b0\u1ee3c b\u1eadt b\u1edfi Turn on Available")}catch(_){}',
        '};',
        'const bulkDelete401=async()=>{',
        `  const targets=planFilteredEZ.filter(e=>e.errorCode===401||e.errorCode==="401"||e.errorCode===402||e.errorCode==="402"||e.testStatus==="invalid"||(e.lastError&&(String(e.lastError).includes("401")||String(e.lastError).includes("402")))||(${aliases.quotaMap}[e.id]?.message&&(String(${aliases.quotaMap}[e.id].message).includes("401")||String(${aliases.quotaMap}[e.id].message).includes("402"))));`,
        '  if(!targets.length){alert("No 401/402 connections found on this page.");return;}',
        '  if(confirm(`Delete all ${targets.length} connections with 401/402 errors on this page?`)){',
        `    ${aliases.busySetter}(true);`,
        '    try{',
        '      await Promise.all(targets.map(async(e)=>{',
        '        await fetch(`/api/providers/${e.id}`,{method:"DELETE"});',
        `        ${aliases.quotaSetter}(t=>{let r={...t};delete r[e.id];return r;});`,
        `        ${aliases.loadingSetter}(t=>{let r={...t};delete r[e.id];return r;});`,
        `        ${aliases.errorSetter}(t=>{let r={...t};delete r[e.id];return r;});`,
        '      }));',
        `      await b(${aliases.fetchAccounts},${aliases.page});`,
        `      let __k12DelHit=targets.some(e=>{let p=String(${aliases.quotaMap}[e.id]?.plan||"").toLowerCase();return p.includes("k12")});`,
        '      if(__k12DelHit&&typeof __9rSyncK12Rotation==="function")try{alert("\u26a0\ufe0f C\u00e1c t\u00e0i kho\u1ea3n K12 v\u1eeba b\u1ecb x\u00f3a. K12 Rotation Engine s\u1ebd t\u1ef1 \u0111\u1ed9ng nh\u1eadn ra \u1edf l\u1ea7n rotation ti\u1ebfp theo.");await __9rSyncK12Rotation(false,"K12 b\u1ecb x\u00f3a b\u1edfi X\u00f3a 401/402")}catch(_){}',
        '    }catch(err){console.error(err)}',
        `    finally{${aliases.busySetter}(false);}`,
        '  }',
        '};',
        'const bulkDeactivate0Weekly=async()=>{',
        `  const activeConns=${aliases.list}.filter(e=>e.isActive??true);`,
        '  const targets=activeConns.filter(e=>{',
        `    const qList=${aliases.quotaMap}[e.id]?.quotas||[];`,
        '    const weekly=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly")&&getRemaining(q)!==null);',
        '    const session=qList.find(q=>q.name&&q.name.toLowerCase().includes("session")&&getRemaining(q)!==null);',
        '    const remaining=getRemaining(weekly||session);',
        '    return remaining===0;',
        '  });',
        '  if(!targets.length){alert("No active connections with 0% token remaining found on this page.");return;}',
        '  if(confirm(`Deactivate ${targets.length} connections with 0% token remaining on this page?`)){',
        `    ${aliases.busySetter}(true);`,
        '    try{',
        '      await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{',
        '        method:"PUT",',
        '        headers:{"Content-Type":"application/json"},',
        '        body:JSON.stringify({isActive:false})',
        '      })));',
        `      await b(${aliases.fetchAccounts},${aliases.page});`,
        `      let __k12Hit=targets.some(e=>{let p=String(${aliases.quotaMap}[e.id]?.plan||"").toLowerCase();return p.includes("k12")});`,
        '      if(__k12Hit&&typeof __9rSyncK12Rotation==="function")try{await __9rSyncK12Rotation(false,"K12 b\u1ecb t\u1eaft do h\u1ebft token 0%")}catch(_){}',
        '    }catch(err){console.error(err)}',
        `    finally{${aliases.busySetter}(false);}`,
        '  }',
        '};',
        'const bulkActivateWeekly=async()=>{',
        `  const inactiveConns=${aliases.list}.filter(e=>!(e.isActive??true));`,
        '  const targets=inactiveConns.filter(e=>{',
        `    const qList=${aliases.quotaMap}[e.id]?.quotas||[];`,
        '    const q=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));',
        '    return q&&getRemaining(q)>0;',
        '  });',
        '  if(!targets.length){alert("No inactive connections with >0% weekly remaining found on this page.");return;}',
        '  if(confirm(`Activate ${targets.length} connections with >0% weekly remaining on this page?`)){',
        `    ${aliases.busySetter}(true);`,
        '    try{',
        '      await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{',
        '        method:"PUT",',
        '        headers:{"Content-Type":"application/json"},',
        '        body:JSON.stringify({isActive:true})',
        '      })));',
        `      await b(${aliases.fetchAccounts},${aliases.page});`,
        `      let __k12Hit=targets.some(e=>{let p=String(${aliases.quotaMap}[e.id]?.plan||"").toLowerCase();return p.includes("k12")});`,
        '      if(__k12Hit&&typeof __9rSyncK12Rotation==="function")try{await __9rSyncK12Rotation(true,"K12 \u0111\u01b0\u1ee3c b\u1eadt b\u1edfi Turn on Available")}catch(_){}',
        '    }catch(err){console.error(err)}',
        `    finally{${aliases.busySetter}(false);}`,
        '  }',
        '};',
        `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`
    ].join('\n');
    
    const injectedButtons = [
        `(0,a.jsxs)("button",{type:"button",onClick:__9rTurnOnAvailable,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50",title:"Enable connections that still have quota on the current page",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"check_circle"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Turn on Available"})]}),`,
        `(0,a.jsxs)("button",{type:"button",onClick:bulkDelete401,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-red-500/30 px-2 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50",title:"Delete all connections with 401/402 error on the current page",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"delete_forever"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Xóa 401/402"})]}),`,

        `(0,a.jsxs)("button",{type:"button",onClick:bulkDeactivate0Weekly,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-amber-500/30 px-2 text-xs text-amber-500 transition-colors hover:bg-amber-500/10 disabled:opacity-50",title:"Deactivate active connections whose weekly or session token quota is 0%",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"block"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Tắt 0% token"})]}),`,
        `(0,a.jsxs)("button",{type:"button",onClick:bulkActivateWeekly,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50",title:"Activate all inactive connections with >0% weekly quota",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"play_circle"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Bật >0% Weekly"})]})`
    ].join('');
    
    c = c.replace(targetSearch, injectedFuncs).replace(buttonSearch, injectedButtons);

    // Wrap native "Turn off Empty" button onClick with K12 sync wrapper
    const turnOffEmptyOnClick = `onClick:()=>{${aliases.toggle}(${aliases.list}.filter(e=>(e.isActive??!0)&&${aliases.emptyPredicate}(e)).map(e=>e.id),!1)}`;
    if (c.includes(turnOffEmptyOnClick)) {
        c = c.replace(turnOffEmptyOnClick, 'onClick:__9rTurnOffEmpty');
        console.log('  ✅ Wrapped Turn off Empty with K12 sync');
    }

    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added bulk actions on Quota page');
    return true;
}

// ============================================================
// PATCH 6: Bulk Actions on Provider Detail Page
// ============================================================
function patchDetailPageBulk() {
    console.log('[PATCH 6] Bulk Actions on Provider Detail Page');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/providers/[id]');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const { providerId, modalSetter } = getProviderDetailAliases(c);
    
    if (c.includes('bulkDelete401')) {
        const upgrades = [
            ['children:"Tắt 0% Weekly"', 'children:"Tắt 0% token"'],
            ['title:"Deactivate 0% Weekly"', 'title:"Deactivate 0% token"'],
            ['Scan active connections and deactivate those with 0% weekly remaining?', 'Scan active connections and deactivate those with 0% weekly or session token remaining?'],
            ['No connections with 0% weekly remaining found', 'No connections with 0% token remaining found'],
            ['const q=(quotasMap[e.id]||[]).find(q=>q.name&&q.name.toLowerCase().includes("weekly"));return q&&getRemaining(q)===0', 'const qList=quotasMap[e.id]||[];const weekly=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));const session=qList.find(q=>q.name&&q.name.toLowerCase().includes("session"));const q=weekly||session;return q&&getRemaining(q)===0'],
        ];
        let upgraded = false;
        for (const [from, to] of upgrades) {
            if (c.includes(from)) {
                c = c.replace(from, to);
                upgraded = true;
            }
        }
        if (!c.includes('children:"Tắt 0% token"') || !c.includes('const session=qList.find(')) {
            console.log('  ✗ Existing provider detail bulk patch could not be upgraded');
            return false;
        }
        if (upgraded) fs.writeFileSync(file, c, 'utf8');
        console.log(upgraded ? '  ✅ Upgraded provider zero-token action' : '  → Already patched');
        return true;
    }
    
    const targetSearch = 'Auto-ping enable error:",e)}T(!1)},tO=async e=>{';
    if (!c.includes(targetSearch)) {
        const modernTarget = ',tI=async()=>{await __9rEnableProviderAutoPing();O(!1)},tD=async e=>{';
        const connectionsMatch = c.match(/,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.filter\(e=>[A-Za-z_$][\w$]*\.includes\(e\.id\)\),[A-Za-z_$][\w$]*=\2\.length>0/);
        const modernButtonPattern = new RegExp(
            `"codex"===${providerId}&&\\(0,([A-Za-z_$][\\w$]*)\\.jsx\\)\\(([A-Za-z_$][\\w$]*)\\.\\$n,\\{size:"sm",icon:"playlist_add",variant:"secondary",onClick:\\(\\)=>[A-Za-z_$][\\w$]*\\(!0\\),children:\\(0,[A-Za-z_$][\\w$]*\\.Tl\\)\\("Bulk Add"\\)\\}\\)`,
        );
        const modernButtonMatch = c.match(modernButtonPattern);
        if (!c.includes(modernTarget) || !connectionsMatch || !modernButtonMatch) {
            console.log('  ✗ Target functions pattern not found');
            return false;
        }

        const connections = connectionsMatch[2];
        const modernFuncs = [
            ',__9rFetchAllQuotas=async conns=>{',
            'let results={};',
            'await Promise.all(conns.map(async connection=>{try{',
            'let response=await fetch("/api/usage/"+connection.id);',
            'if(response.ok){let data=await response.json(),raw=data.quotas||{},quotas=Array.isArray(raw)?raw:Object.entries(raw).map(([name,value])=>({name,...value}));results[connection.id]=quotas;results[connection.id]._message=data.message||null}',
            '}catch(e){console.log("Error fetching usage:",e)}}));',
            'return results',
            '},__9rGetRemaining=q=>{if(!q)return 0;if(q.remaining!==undefined)return Math.max(0,Math.round(q.remaining));if(q.remainingPercentage!==undefined)return Math.round(q.remainingPercentage);if(q.total&&q.total>0)return Math.round((q.total-q.used)/q.total*100);return 0},',
            `bulkDelete401=()=>{let conns=(${connections}||[]);if(!conns.length){${modalSetter}({title:"No targets",message:"No connections found",onConfirm:()=>${modalSetter}(null)});return}${modalSetter}({title:"Scanning for 401/402 errors...",message:"Check all connections and delete invalid 401/402 entries?",onConfirm:async()=>{${modalSetter}(null);let quotasMap=await __9rFetchAllQuotas(conns),targets=conns.filter(e=>e.errorCode===401||e.errorCode==="401"||e.errorCode===402||e.errorCode==="402"||e.testStatus==="invalid"||(e.lastError&&/[401|402]/.test(String(e.lastError)))||(quotasMap[e.id]?._message&&/[401|402]/.test(String(quotasMap[e.id]._message))));if(targets.length&&confirm("Delete "+targets.length+" connections with 401/402 errors?")){await Promise.all(targets.map(e=>fetch("/api/providers/"+e.id,{method:"DELETE"})));await tj()}}})},`,
            `bulkDeactivate0Weekly=()=>{let active=(${connections}||[]).filter(e=>e.isActive);if(!active.length){${modalSetter}({title:"No targets",message:"No active connections found",onConfirm:()=>${modalSetter}(null)});return}${modalSetter}({title:"Deactivate 0% token",message:"Scan active connections and deactivate 0% weekly/session token accounts?",onConfirm:async()=>{${modalSetter}(null);let quotasMap=await __9rFetchAllQuotas(active),targets=active.filter(e=>{let list=quotasMap[e.id]||[],weekly=list.find(q=>q.name&&q.name.toLowerCase().includes("weekly")),session=list.find(q=>q.name&&q.name.toLowerCase().includes("session"));return __9rGetRemaining(weekly||session)===0});if(targets.length){await Promise.all(targets.map(e=>fetch("/api/providers/"+e.id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:false})})));await tj()}}})},`,
            `bulkActivateWeekly=()=>{let inactive=(${connections}||[]).filter(e=>!e.isActive);if(!inactive.length){${modalSetter}({title:"No targets",message:"No inactive connections found",onConfirm:()=>${modalSetter}(null)});return}${modalSetter}({title:"Activate >0% Weekly",message:"Scan inactive connections and activate accounts with weekly quota remaining?",onConfirm:async()=>{${modalSetter}(null);let quotasMap=await __9rFetchAllQuotas(inactive),targets=inactive.filter(e=>{let q=(quotasMap[e.id]||[]).find(q=>q.name&&q.name.toLowerCase().includes("weekly"));return q&&__9rGetRemaining(q)>0});if(targets.length){await Promise.all(targets.map(e=>fetch("/api/providers/"+e.id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:true})})));await tj()}}})}`,
            modernTarget,
        ].join('');
        c = c.replace(modernTarget, modernFuncs);

        const jsxAlias = modernButtonMatch[1];
        const componentAlias = modernButtonMatch[2];
        const modernButtons = modernButtonMatch[0] + ',' +
            `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",icon:"delete_forever",variant:"secondary",onClick:bulkDelete401,children:"Xóa 401/402"}),` +
            `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",icon:"block",variant:"secondary",onClick:bulkDeactivate0Weekly,children:"Tắt 0% token"}),` +
            `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",icon:"play_circle",variant:"secondary",onClick:bulkActivateWeekly,children:"Bật >0% Weekly"})`;
        c = c.split(modernButtonMatch[0]).join(modernButtons);

        if (!c.includes('bulkDelete401=()=>{') || !c.includes('children:"Tắt 0% token"')) {
            console.log('  ✗ Modern provider detail bulk patch validation failed');
            return false;
        }
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Added provider detail bulk actions for the 0.5.40 layout');
        return true;
    }
    
    const buttonSearch = `"codex"===${providerId}&&(0,i.jsx)(d.$n,{size:"sm",icon:"playlist_add",variant:"secondary",onClick:()=>J(!0),children:(0,w.Tl)("Bulk Add")})`;
    if (!c.includes(buttonSearch)) {
        console.log('  ✗ Target button render pattern not found');
        return false;
    }
    
    // Keep the let chain intact: ...,tT=async()=>{...T(!1)},fetchAllQuotas=...,bulkDelete401=...,tO=async e=>{
    const injectedFuncs = 'Auto-ping enable error:",e)}T(!1)},' +
        'fetchAllQuotas=async(conns)=>{const results={};await Promise.all(conns.map(async(c)=>{try{const res=await fetch(`/api/usage/${c.id}`);if(res.ok){const data=await res.json();results[c.id]=data.quotas||[];results[c.id]._message=data.message||null}}catch(e){console.log("Error fetching usage:",e)}}));return results},' +
        'getRemaining=(q)=>{if(!q)return 0;if(q.remaining!==undefined)return Math.max(0,Math.round(q.remaining));if(q.remainingPercentage!==undefined)return Math.round(q.remainingPercentage);if(q.total&&q.total>0)return Math.round((q.total-q.used)/q.total*100);return 0},' +
        'bulkDelete401=()=>{const conns=(x||[]);if(!conns.length){eR({title:"No targets",message:"No connections found",onConfirm:()=>eR(null)});return}eR({title:"Scanning for 401/402 errors...",message:"Checking all connections for 401/402 errors (including usage API)...",onConfirm:async()=>{eR(null);f(true);try{const quotasMap=await fetchAllQuotas(conns);const targets=conns.filter(e=>e.errorCode===401||e.errorCode==="401"||e.errorCode===402||e.errorCode==="402"||e.testStatus==="invalid"||(e.lastError&&(String(e.lastError).includes("401")||String(e.lastError).includes("402")))||(quotasMap[e.id]?._message&&(String(quotasMap[e.id]._message).includes("401")||String(quotasMap[e.id]._message).includes("402"))));if(!targets.length){setTimeout(()=>alert("No 401/402 connections found"),300);f(false);return}if(confirm(`Delete ${targets.length} connections with 401/402 errors?`)){await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{method:"DELETE"})));await tg()}else{f(false)}}catch(err){console.log(err)}finally{f(false)}}})},' +
        'bulkDeactivate0Weekly=()=>{const activeConns=(x||[]).filter(e=>e.isActive);if(!activeConns.length){eR({title:"No targets",message:"No active connections found",onConfirm:()=>eR(null)});return}eR({title:"Deactivate 0% token",message:"Scan active connections and deactivate those with 0% weekly or session token remaining?",onConfirm:async()=>{eR(null);f(true);try{const quotasMap=await fetchAllQuotas(activeConns);const targets=activeConns.filter(e=>{const qList=quotasMap[e.id]||[];const weekly=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));const session=qList.find(q=>q.name&&q.name.toLowerCase().includes("session"));const q=weekly||session;return q&&getRemaining(q)===0});if(targets.length){await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:false})})));await tg()}else{setTimeout(()=>alert("No connections with 0% token remaining found"),300)}}catch(err){console.log(err)}finally{f(false)}}})},' +
        'bulkActivateWeekly=()=>{const inactiveConns=(x||[]).filter(e=>!e.isActive);if(!inactiveConns.length){eR({title:"No targets",message:"No inactive connections found",onConfirm:()=>eR(null)});return}eR({title:"Activate >0% Weekly",message:"Scan inactive connections and activate those with >0% weekly remaining?",onConfirm:async()=>{eR(null);f(true);try{const quotasMap=await fetchAllQuotas(inactiveConns);const targets=inactiveConns.filter(e=>{const q=(quotasMap[e.id]||[]).find(q=>q.name&&q.name.toLowerCase().includes("weekly"));return q&&getRemaining(q)>0});if(targets.length){await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:true})})));await tg()}else{setTimeout(()=>alert("No inactive connections with >0% weekly remaining found"),300)}}catch(err){console.log(err)}finally{f(false)}}})},' +
        'tO=async e=>{';
    
    const injectedButtons = [
        `"codex"===${providerId}&&(0,i.jsx)(d.$n,{size:"sm",icon:"playlist_add",variant:"secondary",onClick:()=>J(!0),children:(0,w.Tl)("Bulk Add")}),`,
        '(0,i.jsx)(d.$n,{size:"sm",icon:"delete_forever",variant:"secondary",onClick:bulkDelete401,children:"Xóa 401/402"}),',

        '(0,i.jsx)(d.$n,{size:"sm",icon:"block",variant:"secondary",onClick:bulkDeactivate0Weekly,children:"Tắt 0% token"}),',
        '(0,i.jsx)(d.$n,{size:"sm",icon:"play_circle",variant:"secondary",onClick:bulkActivateWeekly,children:"Bật >0% Weekly"})'
    ].join('');
    
    const providerBoundFuncs = injectedFuncs.replaceAll('eR', modalSetter);
    c = c.replace(targetSearch, providerBoundFuncs).replace(buttonSearch, injectedButtons);
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added bulk actions on Provider detail page');
    return true;
}

// ============================================================
// PATCH 7: Weekly Quota Filter on Quota Page
// ============================================================
function patchQuotaPageWeeklyFilter() {
    console.log('[PATCH 7] Weekly Quota Filter on Quota Page');
    const quotaDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(quotaDir)) { console.log('  ✗ Quota dir not found'); return false; }
    const pageFile = fs.readdirSync(quotaDir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(quotaDir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);
    
    if (c.includes('Filter by weekly remaining percentage')) {
        console.log('  → Already patched');
        return true;
    }
    
    // 1. Inject state
    const stateSearch = `[${aliases.page},${aliases.pageSetter}]=(0,${aliases.react}.useState)(1)`;
    if (!c.includes(stateSearch)) {
        console.log('  ✗ State search pattern not found');
        return false;
    }
    c = c.replace(stateSearch, `[ewMin,sewMin]=(0,${aliases.react}.useState)("all"),${stateSearch}`);
    
    // 2. Inject filteredEZ AFTER eZ memo definition
    //    eZ ends with: ,[r,M,eN,eb,ek]),e0=
    //    We insert filteredEZ between ]), and e0=
    const eZEndAnchor = `,${aliases.sortDeps}),${aliases.emptyPredicate}=`;
    if (!c.includes(eZEndAnchor)) {
        console.log('  ✗ eZ end anchor not found');
        return false;
    }
    const filteredMemo = `,${aliases.sortDeps});let filteredEZ=(0,${aliases.react}.useMemo)(()=>${aliases.list}.filter(e=>{if(ewMin==="all")return true;let qList=${aliases.quotaMap}[e.id]?.quotas||[];let q=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));if(!q)return false;let pct=0;if(q.remaining!==undefined)pct=Math.max(0,Math.round(q.remaining));else if(q.remainingPercentage!==undefined)pct=Math.round(q.remainingPercentage);else if(q.total&&q.total>0)pct=Math.round((q.total-q.used)/q.total*100);return pct>Number(ewMin)}),[${aliases.list},ewMin,${aliases.quotaMap}]),${aliases.emptyPredicate}=`;
    c = c.replace(eZEndAnchor, filteredMemo);
    
    // 3. Update references from eZ to filteredEZ for rendering & bulk actions
    c = c.split(`children:${aliases.list}.map(r=>{`).join('children:filteredEZ.map(r=>{');
    c = c.split(`${aliases.emptyFlag}=${aliases.list}.length>0`).join(`${aliases.emptyFlag}=filteredEZ.length>0`);
    c = c.split(`const targets=${aliases.list}.filter(e=>`).join('const targets=filteredEZ.filter(e=>');
    c = c.split(`const activeConns=${aliases.list}.filter(e=>`).join('const activeConns=filteredEZ.filter(e=>');
    c = c.split(`const inactiveConns=${aliases.list}.filter(e=>`).join('const inactiveConns=filteredEZ.filter(e=>');
    c = c.split(`${aliases.toggle}(${aliases.list}.filter(`).join(`${aliases.toggle}(filteredEZ.filter(`);
    
    // 4. Inject the Select dropdown in JSX after status filter
    const selectSearch = 'Filter accounts by status",children:c.map(e=>(0,a.jsx)("option",{value:e.value,children:e.label},e.value))})';
    if (!c.includes(selectSearch)) {
        console.log('  ✗ Select search pattern not found');
        return false;
    }
    
    const weeklySelect = [
        'Filter accounts by status",children:c.map(e=>(0,a.jsx)("option",{value:e.value,children:e.label},e.value))}),',
        '(0,a.jsx)("select",{value:ewMin,onChange:e=>sewMin(e.target.value),className:"h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10","aria-label":"Filter by weekly remaining percentage",children:[',
        '(0,a.jsx)("option",{value:"all",children:"All Weekly %"},"all"),',
        '(0,a.jsx)("option",{value:"0",children:"> 0% Weekly"},"0"),',
        '(0,a.jsx)("option",{value:"10",children:"> 10% Weekly"},"10"),',
        '(0,a.jsx)("option",{value:"25",children:"> 25% Weekly"},"25"),',
        '(0,a.jsx)("option",{value:"50",children:"> 50% Weekly"},"50"),',
        '(0,a.jsx)("option",{value:"75",children:"> 75% Weekly"},"75")',
        ']})'
    ].join('');
    c = c.replace(selectSearch, weeklySelect);
    
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added weekly filter on Quota page');
    return true;
}

// ============================================================
// PATCH 22: Session Quota Filter on Quota Page
// ============================================================
function patchQuotaPageSessionFilter() {
    console.log('[PATCH 22] Session Quota Filter on Quota Page');
    const quotaDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(quotaDir)) { console.log('  ✗ Quota dir not found'); return false; }
    const pageFile = fs.readdirSync(quotaDir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }

    const file = path.join(quotaDir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);

    if (c.includes('Filter by session remaining percentage') &&
        c.includes('function __9rFilterByQuotaRemaining(') &&
        c.includes('sessionFilteredEZ=')) {
        console.log('  → Already patched');
        return true;
    }

    const weeklyState = `[ewMin,sewMin]=(0,${aliases.react}.useState)("all")`;
    if (!c.includes(weeklyState)) {
        console.log('  ✗ Weekly filter state not found');
        return false;
    }
    if (!c.includes('[esMin,sesMin]=')) {
        c = c.replace(weeklyState, weeklyState + `,[esMin,sesMin]=(0,${aliases.react}.useState)("all")`);
    }

    const inlineWeeklyMemo = `let filteredEZ=(0,${aliases.react}.useMemo)(()=>${aliases.list}.filter(e=>{if(ewMin==="all")return true;let qList=${aliases.quotaMap}[e.id]?.quotas||[];let q=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));if(!q)return false;let pct=0;if(q.remaining!==undefined)pct=Math.max(0,Math.round(q.remaining));else if(q.remainingPercentage!==undefined)pct=Math.round(q.remainingPercentage);else if(q.total&&q.total>0)pct=Math.round((q.total-q.used)/q.total*100);return pct>Number(ewMin)}),[${aliases.list},ewMin,${aliases.quotaMap}])`;
    const filterHelper = 'function __9rFilterByQuotaRemaining(accounts,quotaMap,kind,threshold){' +
        'if(threshold==="all")return accounts;' +
        'let limit=Number(threshold);' +
        'return accounts.filter(e=>{' +
        'let q=(quotaMap[e.id]?.quotas||[]).find(q=>q.name&&q.name.toLowerCase().includes(String(kind).toLowerCase()));' +
        'if(!q)return false;' +
        'let pct=null;' +
        'if(q.remaining!==undefined)pct=Number(q.remaining);' +
        'else if(q.remainingPercentage!==undefined)pct=Number(q.remainingPercentage);' +
        'else if(q.total&&q.total>0)pct=(q.total-q.used)/q.total*100;' +
        'if(!Number.isFinite(pct))return false;' +
        'pct=Math.max(0,Math.min(100,Math.round(pct)));' +
        'return pct>limit' +
        '})}';
    const weeklyMemo = `let filteredEZ=(0,${aliases.react}.useMemo)(()=>__9rFilterByQuotaRemaining(${aliases.list},${aliases.quotaMap},"weekly",ewMin),[${aliases.list},ewMin,${aliases.quotaMap}])`;

    if (c.includes(inlineWeeklyMemo)) {
        c = c.replace(inlineWeeklyMemo, filterHelper + ';' + weeklyMemo);
    } else if (!c.includes('function __9rFilterByQuotaRemaining(') || !c.includes(weeklyMemo)) {
        console.log('  ✗ Weekly filter memo layout not found');
        return false;
    }

    if (!c.includes('sessionFilteredEZ=')) {
        c = c.replace(
            weeklyMemo,
            weeklyMemo + `,sessionFilteredEZ=(0,${aliases.react}.useMemo)(()=>__9rFilterByQuotaRemaining(filteredEZ,${aliases.quotaMap},"session",esMin),[filteredEZ,esMin,${aliases.quotaMap}])`,
        );
    }

    c = c.split(`planFilteredEZ=(0,${aliases.react}.useMemo)(()=>filteredEZ.filter(`)
        .join(`planFilteredEZ=(0,${aliases.react}.useMemo)(()=>sessionFilteredEZ.filter(`);
    c = c.split(`[filteredEZ,ePlanFilter,${aliases.quotaMap}]`)
        .join(`[sessionFilteredEZ,ePlanFilter,${aliases.quotaMap}]`);
    c = c.split('filteredEZ.forEach(e=>{let p=normPlan(')
        .join('sessionFilteredEZ.forEach(e=>{let p=normPlan(');
    c = c.split(`[filteredEZ,${aliases.quotaMap}]`)
        .join(`[sessionFilteredEZ,${aliases.quotaMap}]`);

    c = c.split('children:filteredEZ.map(r=>{').join('children:sessionFilteredEZ.map(r=>{');
    c = c.split(`${aliases.emptyFlag}=filteredEZ.length>0`).join(`${aliases.emptyFlag}=sessionFilteredEZ.length>0`);
    c = c.split('const targets=filteredEZ.filter(e=>').join('const targets=sessionFilteredEZ.filter(e=>');
    c = c.split('const activeConns=filteredEZ.filter(e=>').join('const activeConns=sessionFilteredEZ.filter(e=>');
    c = c.split('const inactiveConns=filteredEZ.filter(e=>').join('const inactiveConns=sessionFilteredEZ.filter(e=>');
    c = c.split(`${aliases.toggle}(filteredEZ.filter(`).join(`${aliases.toggle}(sessionFilteredEZ.filter(`);

    const weeklyFilterEnd = '(0,a.jsx)("option",{value:"75",children:"> 75% Weekly"},"75")' + ']})';
    if (!c.includes(weeklyFilterEnd)) {
        console.log('  ✗ Weekly filter select not found');
        return false;
    }
    if (!c.includes('Filter by session remaining percentage')) {
        const sessionSelect = weeklyFilterEnd + ',' +
            '(0,a.jsx)("select",{value:esMin,onChange:e=>sesMin(e.target.value),' +
            'className:"h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10",' +
            '"aria-label":"Filter by session remaining percentage",children:[' +
            '(0,a.jsx)("option",{value:"all",children:"All Session %"},"all"),' +
            '(0,a.jsx)("option",{value:"0",children:"> 0% Session"},"0"),' +
            '(0,a.jsx)("option",{value:"10",children:"> 10% Session"},"10"),' +
            '(0,a.jsx)("option",{value:"25",children:"> 25% Session"},"25"),' +
            '(0,a.jsx)("option",{value:"50",children:"> 50% Session"},"50"),' +
            '(0,a.jsx)("option",{value:"75",children:"> 75% Session"},"75")' +
            ']})';
        c = c.replace(weeklyFilterEnd, sessionSelect);
    }

    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added independent Session quota filter');
    return true;
}

// ============================================================
// PATCH 8: Plan Badge on Quota Page
// ============================================================
function patchQuotaPlanBadge() {
    console.log('[PATCH 8] Plan Badge on Quota Page');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    
    if (c.includes('planBadge')) {
        console.log('  → Already patched');
        return true;
    }
    
    // Anchor: after the minified display-name getter, before the provider badge section.
    const anchorMatch = c.match(/([A-Za-z_$][\w$]*)\(r\)\?\(0,a\.jsx\)\("p",\{className:"text-\[11px\] text-text-muted\/80 truncate",children:\1\(r\)\}\):null/);
    const anchor = anchorMatch && anchorMatch[0];
    if (!anchor) {
        console.log('  ✗ Anchor pattern not found');
        return false;
    }
    
    // Build the badge injection
    // o = M[r.id] which has o.plan for all providers:
    //   codex: "free"|"plus"|"pro"|"team"|"enterprise"|"k12"|"unknown"
    //   gemini-cli: "Free"|"Pro"|"Ultra"|"Google One AI Premium"|etc (from currentTier.name)
    //   antigravity: similar to gemini-cli
    const badge = anchor + ',' +
        '(()=>{' +
        'let planBadge=o?.plan||null;' +
        'if(!planBadge||planBadge==="unknown")return null;' +
        'let pl=planBadge.toLowerCase().trim();' +
        'let colors={' +
        'free:"bg-gray-400/20 text-gray-600 dark:text-gray-300",' +
        'plus:"bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",' +
        'pro:"bg-violet-500/15 text-violet-600 dark:text-violet-400",' +
        'ultra:"bg-amber-500/15 text-amber-600 dark:text-amber-300",' +
        'k12:"bg-blue-500/15 text-blue-600 dark:text-blue-400",' +
        'team:"bg-orange-500/15 text-orange-600 dark:text-orange-400",' +
        'enterprise:"bg-red-500/15 text-red-600 dark:text-red-400"' +
        '};' +
        'let key=pl;' +
        'if(pl.includes("premium")||pl.includes("ultra"))key="ultra";' +
        'else if(pl.includes("pro"))key="pro";' +
        'else if(pl.includes("plus"))key="plus";' +
        'else if(pl.includes("team"))key="team";' +
        'else if(pl.includes("enterprise"))key="enterprise";' +
        'else if(pl.includes("k12"))key="k12";' +
        'else if(pl.includes("free")||pl==="free")key="free";' +
        'let cls=colors[key]||colors.free;' +
        'let labels={free:"Free",plus:"Plus",pro:"Pro",ultra:"Ultra",k12:"K12",team:"Team",enterprise:"Enterprise"};' +
        'let label=labels[key]||planBadge;' +
        'return(0,a.jsx)("span",{className:"inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold "+cls,children:label})' +
        '})()';
    
    c = c.replace(anchor, badge);
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added plan badge on Quota page');
    return true;
}

// ============================================================
// PATCH 9: Dynamic Plan Filter on Quota Page
// ============================================================
function patchQuotaPlanFilter() {
    console.log('[PATCH 9] Plan Filter on Quota Page');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);
    
    if (c.includes('ePlanFilter')) {
        console.log('  → Already patched');
        return true;
    }
    
    // 1. Add state for plan filter - inject after ewMin state
    const stateAnchor = `[ewMin,sewMin]=(0,${aliases.react}.useState)("all")`;
    if (!c.includes(stateAnchor)) {
        console.log('  ✗ ewMin state not found');
        return false;
    }
    c = c.replace(stateAnchor, stateAnchor + `,[ePlanFilter,sePlanFilter]=(0,${aliases.react}.useState)("all")`);
    
    // 2. Add planFilteredEZ after the most specific quota filter available.
    const quotaFilterSource = c.includes('sessionFilteredEZ=') ? 'sessionFilteredEZ' : 'filteredEZ';
    const filterEnd = quotaFilterSource === 'sessionFilteredEZ'
        ? `),[filteredEZ,esMin,${aliases.quotaMap}]),${aliases.emptyPredicate}=`
        : `),[${aliases.list},ewMin,${aliases.quotaMap}]),${aliases.emptyPredicate}=`;
    if (!c.includes(filterEnd)) {
        console.log('  ✗ quota filter end not found');
        return false;
    }
    
    // Helper to normalize plan names (reused in filter and dropdown)
    const normalizePlanFn = 'normPlan=p=>{' +
        'if(!p)return"unknown";' +
        'let l=p.toLowerCase().trim();' +
        'if(l.includes("premium")||l.includes("ultra"))return"ultra";' +
        'if(l.includes("pro"))return"pro";' +
        'if(l.includes("plus"))return"plus";' +
        'if(l.includes("team"))return"team";' +
        'if(l.includes("enterprise"))return"enterprise";' +
        'if(l.includes("k12"))return"k12";' +
        'if(l==="free"||l.includes("free"))return"free";' +
        'if(!l||l==="unknown")return"unknown";' +
        'return l}';
    
    const quotaFilterDeps = quotaFilterSource === 'sessionFilteredEZ'
        ? `[filteredEZ,esMin,${aliases.quotaMap}]`
        : `[${aliases.list},ewMin,${aliases.quotaMap}]`;
    const newFilterEnd = `),${quotaFilterDeps}),` +
        normalizePlanFn + ',' +
        // planFilteredEZ: apply plan filter
        `planFilteredEZ=(0,${aliases.react}.useMemo)(()=>${quotaFilterSource}.filter(e=>{` +
        'if(ePlanFilter==="all")return true;' +
        `return normPlan(${aliases.quotaMap}[e.id]?.plan)===ePlanFilter` +
        `}),[${quotaFilterSource},ePlanFilter,${aliases.quotaMap}]),` +
        // availablePlans: dynamic list from the current quota-filtered list
        `availablePlans=(0,${aliases.react}.useMemo)(()=>{` +
        'let planSet=new Set();' +
        `${quotaFilterSource}.forEach(e=>{let p=normPlan(${aliases.quotaMap}[e.id]?.plan);planSet.add(p)});` +
        'let order=["free","plus","pro","ultra","k12","team","enterprise","unknown"];' +
        'return order.filter(p=>planSet.has(p))' +
        `},[${quotaFilterSource},${aliases.quotaMap}]),` +
        `${aliases.emptyPredicate}=`;
    c = c.replace(filterEnd, newFilterEnd);
    
    // 3. Replace all quota-filtered references with planFilteredEZ.
    c = c.split(`children:${quotaFilterSource}.map(r=>{`).join('children:planFilteredEZ.map(r=>{');
    c = c.split(`${aliases.emptyFlag}=${quotaFilterSource}.length>0`).join(`${aliases.emptyFlag}=planFilteredEZ.length>0`);
    c = c.split(`const targets=${quotaFilterSource}.filter(e=>`).join('const targets=planFilteredEZ.filter(e=>');
    c = c.split(`const activeConns=${quotaFilterSource}.filter(e=>`).join('const activeConns=planFilteredEZ.filter(e=>');
    c = c.split(`const inactiveConns=${quotaFilterSource}.filter(e=>`).join('const inactiveConns=planFilteredEZ.filter(e=>');
    c = c.split(`${aliases.toggle}(${quotaFilterSource}.filter(`).join(`${aliases.toggle}(planFilteredEZ.filter(`);
    
    // 4. Add dynamic plan filter dropdown after weekly filter
    const weeklyFilterEnd = '(0,a.jsx)("option",{value:"75",children:"> 75% Weekly"},"75")' + ']})';
    const sessionFilterEnd = '(0,a.jsx)("option",{value:"75",children:"> 75% Session"},"75")' + ']})';
    const quotaFilterEnd = c.includes(sessionFilterEnd) ? sessionFilterEnd : weeklyFilterEnd;
    if (!c.includes(quotaFilterEnd)) {
        console.log('  ✗ Quota filter select end not found');
        return false;
    }
    
    // Dynamic dropdown: "All Plans" + map from availablePlans
    const planLabels = '{free:"Free",plus:"Plus",pro:"Pro",ultra:"Ultra",k12:"K12",team:"Team",enterprise:"Enterprise",unknown:"Unknown"}';
    const planSelect = quotaFilterEnd + ',' +
        '(0,a.jsx)("select",{value:ePlanFilter,onChange:e=>sePlanFilter(e.target.value),' +
        'className:"h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10",' +
        '"aria-label":"Filter by plan type",' +
        'children:[(0,a.jsx)("option",{value:"all",children:"All Plans"},"all")].concat(availablePlans.map(p=>' +
        '(0,a.jsx)("option",{value:p,children:' + planLabels + '[p]||p},p)))' +
        '})';
    c = c.replace(quotaFilterEnd, planSelect);
    
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added dynamic plan filter on Quota page');
    return true;
}

// ============================================================
// PATCH 10: Remove Reset Time Badge on Card Header
// ============================================================
function patchQuotaResetTime() {
    console.log('[PATCH 10] Remove Reset Time Badge on Card Header');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    
    if (!c.includes('let planBadge=')) {
        console.log('  ✗ Plan badge anchor is missing');
        return false;
    }

    if (!c.includes('earliestReset')) {
        console.log('  → Reset-time badge is already absent');
        return true;
    }

    const resetStart = ',(()=>{let qList=o?.quotas||[];if(!qList.length)return null;let earliestReset=null;';
    const resetEnd = ',"kiro"===r.provider';
    const start = c.indexOf(resetStart);
    const end = start >= 0 ? c.indexOf(resetEnd, start) : -1;
    if (start < 0 || end < 0) {
        console.log('  ✗ Reset-time badge boundaries not found');
        return false;
    }

    c = c.slice(0, start) + c.slice(end);
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Removed reset-time badge while preserving the plan badge');
    return true;
}

// ============================================================
// PATCH 11: Bulk Priority Reassign on Quota Page
// ============================================================
function patchBulkPriorityReassign() {
    console.log('[PATCH 11] Bulk Priority Reassign');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);
    
    const brokenStateScope = `[priResult,setPriResult]=(0,${aliases.react}.useState)(null);(0,${aliases.react}.useEffect)`;
    const fixedStateScope = `[priResult,setPriResult]=(0,${aliases.react}.useState)(null),sidebarOverflowEffect=(0,${aliases.react}.useEffect)`;

    if (c.includes('bulkPriorityReassign')) {
        if (c.includes(brokenStateScope)) {
            c = c.replace(brokenStateScope, fixedStateScope);
            fs.writeFileSync(file, c, 'utf8');
            console.log('  ✅ Repaired quota state declaration scope');
        } else {
            console.log('  → Already patched');
        }
        return true;
    }
    
    // 1. Add states for priority modal - after ePlanFilter state
    const stateAnchor = `,[ePlanFilter,sePlanFilter]=(0,${aliases.react}.useState)("all")`;
    if (!c.includes(stateAnchor)) {
        console.log('  ✗ ePlanFilter state not found');
        return false;
    }
    c = c.replace(stateAnchor, stateAnchor +
        `,[priModalOpen,setPriModalOpen]=(0,${aliases.react}.useState)(false)` +
        `,[priFrom,setPriFrom]=(0,${aliases.react}.useState)("")` +
        `,[priTo,setPriTo]=(0,${aliases.react}.useState)("")` +
        `,[priNewStart,setPriNewStart]=(0,${aliases.react}.useState)("")` +
        `,[priLoading,setPriLoading]=(0,${aliases.react}.useState)(false)` +
        `,[priResult,setPriResult]=(0,${aliases.react}.useState)(null)` +
        `,sidebarOverflowEffect=(0,${aliases.react}.useEffect)(()=>{` +
        'let el=document.querySelector(".sidebarToolbar");' +
        'if(el){let p=el.parentElement;' +
        'while(p&&p!==document.body){' +
        'let style=window.getComputedStyle(p);' +
        'if(style.overflow==="hidden"||style.overflowX==="hidden"||style.overflowY==="hidden")p.style.overflow="visible";' +
        'p=p.parentElement}}' +
        '},[])'
    );
    
    // 2. Add bulkPriorityReassign function - inject after bulkActivateWeekly
    const funcAnchor = `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`;
    if (!c.includes(funcAnchor)) {
        console.log('  ✗ funcAnchor not found');
        return false;
    }
    
    const priFuncs = 'const bulkPriorityReassign=async()=>{' +
        'let from=parseInt(priFrom),to=parseInt(priTo),newStart=parseInt(priNewStart);' +
        'if(isNaN(from)||isNaN(to)||isNaN(newStart)||from<0||to<from||newStart<0){alert("Invalid input. Check From/To/New Start values.");return}' +
        'let targets=planFilteredEZ.filter(e=>typeof e.priority==="number"&&e.priority>=from&&e.priority<=to);' +
        'targets.sort((a,b)=>a.priority-b.priority);' +
        'if(!targets.length){alert("No connections found with priority "+from+"-"+to);return}' +
        'if(!confirm("Reassign "+targets.length+" connections (priority "+from+"-"+to+") to start from priority "+newStart+"?"))return;' +
        'setPriLoading(true);setPriResult(null);' +
        'let ok=0,fail=0;' +
        'for(let i=0;i<targets.length;i++){' +
        'try{let res=await fetch("/api/providers/"+targets[i].id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({priority:newStart+i})});' +
        'if(res.ok)ok++;else fail++}catch(err){fail++}}' +
        'setPriResult("Done: "+ok+" updated, "+fail+" failed");' +
        'setPriLoading(false);' +
        `await b(${aliases.fetchAccounts},${aliases.page})};` +
        `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`;
    
    c = c.replace(funcAnchor, priFuncs);
    
    // 3. Add button + modal in the toolbar
    // Find end of bulk buttons to add priority button
    const btnAnchor = 'children:"Bật >0% Weekly"})]})'
    if (!c.includes(btnAnchor)) {
        console.log('  ✗ btnAnchor not found');
        return false;
    }
    
    const priButton = 'children:"Bật >0% Weekly"})]}),'+
        `(0,a.jsxs)("button",{type:"button",onClick:()=>{setPriModalOpen(true);setPriResult(null)},disabled:${aliases.busy},` +
        'className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-indigo-500/30 px-2 text-xs text-indigo-500 transition-colors hover:bg-indigo-500/10 disabled:opacity-50",' +
        'title:"Bulk reassign priority",' +
        'children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"low_priority"}),' +
        '(0,a.jsx)("span",{className:"hidden sm:inline",children:"Priority"})]})';
    
    c = c.replace(btnAnchor, priButton);
    
    // 4. Add modal - inject right before the card grid in the main render
    const gridAnchor = '(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-3",children:planFilteredEZ';
    if (!c.includes(gridAnchor)) {
        console.log('  ✗ grid anchor not found');
        return false;
    }
    
    // Inject the modal right before the grid
    const priModal = 'priModalOpen&&(0,a.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/50",onClick:e=>{if(e.target===e.currentTarget&&!priLoading)setPriModalOpen(false)},children:' +
        '(0,a.jsxs)("div",{className:"w-[420px] rounded-2xl border border-black/10 dark:border-white/10 bg-surface-1 p-6 shadow-2xl",children:[' +
        '(0,a.jsx)("h3",{className:"text-lg font-bold text-text-primary mb-4",children:"Bulk Priority Reassign"}),' +
        '(0,a.jsxs)("div",{className:"space-y-3",children:[' +
        '(0,a.jsxs)("div",{className:"flex gap-2 items-center",children:[' +
        '(0,a.jsx)("label",{className:"text-xs text-text-muted w-24",children:"From Priority"}),' +
        '(0,a.jsx)("input",{type:"number",value:priFrom,onChange:e=>setPriFrom(e.target.value),min:0,className:"flex-1 h-8 rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]",placeholder:"e.g. 39"})]}),' +
        '(0,a.jsxs)("div",{className:"flex gap-2 items-center",children:[' +
        '(0,a.jsx)("label",{className:"text-xs text-text-muted w-24",children:"To Priority"}),' +
        '(0,a.jsx)("input",{type:"number",value:priTo,onChange:e=>setPriTo(e.target.value),min:0,className:"flex-1 h-8 rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]",placeholder:"e.g. 44"})]}),' +
        '(0,a.jsxs)("div",{className:"flex gap-2 items-center",children:[' +
        '(0,a.jsx)("label",{className:"text-xs text-text-muted w-24",children:"New Start"}),' +
        '(0,a.jsx)("input",{type:"number",value:priNewStart,onChange:e=>setPriNewStart(e.target.value),min:0,className:"flex-1 h-8 rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]",placeholder:"e.g. 9"})]}),' +
        '(0,a.jsx)("p",{className:"text-[11px] text-text-muted",children:"Connections with priority From\\u2192To will be reassigned starting at New Start."})' +
        ']}),' +
        'priResult&&(0,a.jsx)("p",{className:"mt-3 text-sm font-medium "+(priResult.includes("fail")?"text-red-500":"text-emerald-500"),children:priResult}),' +
        '(0,a.jsxs)("div",{className:"flex justify-end gap-2 mt-4",children:[' +
        '(0,a.jsx)("button",{type:"button",onClick:()=>setPriModalOpen(false),disabled:priLoading,className:"h-8 rounded-lg border border-black/10 px-4 text-xs text-text-muted hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 disabled:opacity-50",children:"Cancel"}),' +
        '(0,a.jsx)("button",{type:"button",onClick:bulkPriorityReassign,disabled:priLoading,className:"h-8 rounded-lg bg-indigo-500 px-4 text-xs text-white font-medium hover:bg-indigo-600 disabled:opacity-50",children:priLoading?"Updating...":"Reassign"})' +
        ']})' +
        ']})}),';
    
    c = c.replace(gridAnchor, priModal + gridAnchor);
    
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added bulk priority reassign on Quota page');
    return true;
}

// ============================================================
// PATCH 21: Smart Priority by Plan and Session Remaining
// ============================================================
function patchSmartPrioritySort() {
    console.log('[PATCH 21] Smart Priority by Plan and Session Remaining');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }

    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);

    const currentMarker = 'const __9rSmartPriorityVersion="v3"';
    const hasLegacySmartPriority = c.includes('bulkSmartPrioritySort') &&
        c.includes('function __9rBuildSmartPriorityPlan(') && !c.includes(currentMarker);
    if (c.includes('bulkSmartPrioritySort') && c.includes(currentMarker)) {
        console.log('  → Already patched');
        return true;
    }

    const smartFunctions = currentMarker + ';' +
        'const __9rSyncK12Rotation=async(shouldEnable,reason)=>{try{let base="http://"+(window.location?window.location.hostname:"127.0.0.1")+":53220";let r=await fetch(base+"/api/k12-rotation/status");if(!r.ok)return;let s=await r.json();if(!shouldEnable&&s.enabled){await fetch(base+"/api/k12-rotation/toggle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:false})});alert("\u26a0\ufe0f K12 Rotation Engine \u0111\u00e3 t\u1ef1 \u0111\u1ed9ng t\u1eaft"+(reason?" \u2014 "+reason:""));if(typeof k12RotFetch==="function")try{k12RotFetch()}catch(_){}}else if(shouldEnable&&!s.enabled){if(confirm("K12 Rotation Engine \u0111ang t\u1eaft. B\u1ea1n v\u1eeba b\u1eadt K12 \u2014 b\u1eadt l\u1ea1i K12 Rotation Engine?")){await fetch(base+"/api/k12-rotation/toggle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true})});if(typeof k12RotFetch==="function")try{k12RotFetch()}catch(_){}}}}catch(_){}};' +
        'function __9rBuildSmartPriorityPlan(accounts,quotaMap,options){' +
        'let opts=options||{};' +
        'let normPlan=p=>{if(!p)return"unknown";let l=String(p).toLowerCase().trim();if(l.includes("premium")||l.includes("ultra"))return"ultra";if(l.includes("pro"))return"pro";if(l.includes("plus"))return"plus";if(l.includes("team"))return"team";if(l.includes("enterprise"))return"enterprise";if(l.includes("k12"))return"k12";if(l.includes("free"))return"free";if(!l||l==="unknown")return"unknown";return l};' +
        'let quotaPct=q=>{if(!q)return null;let pct=null;if(q.remaining!==undefined)pct=Number(q.remaining);else if(q.remainingPercentage!==undefined)pct=Number(q.remainingPercentage);else if(q.total&&q.total>0)pct=(q.total-q.used)/q.total*100;if(!Number.isFinite(pct))return null;return Math.max(0,Math.min(100,Math.round(pct)))};' +
        'let preferredPlan=normPlan(opts.preferredPlan||"all"),activationMode=opts.activationMode||"priority-only",sessionOrder=opts.sessionOrder==="asc"?"asc":"desc";' +
        'if(activationMode==="preferred-only"&&(preferredPlan==="all"||preferredPlan==="unknown"))throw Error("Select a specific preferred plan before changing activation status.");' +
        'let rows=accounts.map(account=>{let plan=normPlan(quotaMap[account.id]?.plan);if(plan==="unknown")return null;let sessionQuota=(quotaMap[account.id]?.quotas||[]).find(q=>q.name&&q.name.toLowerCase().includes("session"));return{account,plan,sessionRemaining:quotaPct(sessionQuota)}}).filter(Boolean);' +
        'if(preferredPlan!=="all"&&!rows.some(row=>row.plan===preferredPlan))throw Error("The preferred plan is absent from the loaded population. Choose an available plan.");' +
        'let slots=rows.map(row=>row.account.priority);' +
        'if(!slots.every(Number.isInteger)||new Set(slots).size!==slots.length)throw Error("Smart Priority requires unique integer priority slots in the filtered accounts.");' +
        'slots.sort((a,b)=>a-b);' +
        'rows.sort((a,b)=>{let ag=preferredPlan==="all"?0:a.plan===preferredPlan?0:1,bg=preferredPlan==="all"?0:b.plan===preferredPlan?0:1;if(ag!==bg)return ag-bg;if(a.sessionRemaining===null&&b.sessionRemaining!==null)return 1;if(b.sessionRemaining===null&&a.sessionRemaining!==null)return-1;if(a.sessionRemaining!==b.sessionRemaining)return sessionOrder==="asc"?a.sessionRemaining-b.sessionRemaining:b.sessionRemaining-a.sessionRemaining;let priorityDiff=a.account.priority-b.account.priority;if(priorityDiff)return priorityDiff;return String(a.account.id).localeCompare(String(b.account.id))});' +
        'return rows.map((row,index)=>({id:row.account.id,priority:slots[index],isActive:activationMode==="preferred-only"?row.plan===preferredPlan:(row.account.isActive??true),sessionRemaining:row.sessionRemaining}))' +
        '};' +
        'async function __9rLoadSmartPriorityPopulation(provider,weeklyThreshold,sessionThreshold,fetchQuota){' +
        'let page=1,pageSize=500,totalPages=1,accounts=[],seen=new Set();' +
        'while(page<=totalPages){' +
        'let params=new URLSearchParams({page:String(page),pageSize:String(pageSize),accountStatus:"all",sort:"priority"});' +
        'if(provider&&provider!=="all")params.set("provider",provider);' +
        'let response=await fetch("/api/providers/client?"+params.toString());' +
        'if(!response.ok)throw Error("Failed to load the complete Smart Priority account population.");' +
        'let payload=await response.json(),batch=Array.isArray(payload.connections)?payload.connections:[];' +
        'batch.forEach(account=>{if(account&&account.id!==undefined&&account.id!==null&&!seen.has(account.id)){seen.add(account.id);accounts.push(account)}});' +
        'let pagination=payload.pagination||{},reportedPages=Number(pagination.totalPages),reportedTotal=Number(pagination.total);' +
        'totalPages=Number.isFinite(reportedPages)&&reportedPages>0?Math.ceil(reportedPages):Number.isFinite(reportedTotal)&&reportedTotal>0?Math.ceil(reportedTotal/pageSize):page;' +
        'if(totalPages>1000)throw Error("Smart Priority stopped because account pagination exceeded 1000 pages.");' +
        'if(batch.length===0)break;page++' +
        '}' +
        'let quotaBatch={loading:{},errors:{},quotas:{}};' +
        'await __9rRunQuotaPool(accounts,account=>fetchQuota(account.id,account.provider,quotaBatch),8);' +
        'let weeklyAccounts=__9rFilterByQuotaRemaining(accounts,quotaBatch.quotas,"weekly",weeklyThreshold);' +
        'let sessionAccounts=__9rFilterByQuotaRemaining(weeklyAccounts,quotaBatch.quotas,"session",sessionThreshold);' +
        'return{accounts:sessionAccounts,quotaMap:quotaBatch.quotas,loadedCount:accounts.length,quotaFailures:Object.values(quotaBatch.errors).filter(Boolean).length}' +
        '};' +
        'const bulkSmartPrioritySort=async()=>{' +
        `if(${aliases.busy}||smartPriLoading)return;` +
        `setSmartPriLoading(true);${aliases.busySetter}(true);setSmartPriResult("Loading all account statuses, pages, and quotas...");` +
        'let ok=0,fail=0;' +
        'try{' +
        `let smartPopulation=await __9rLoadSmartPriorityPopulation(${aliases.statusFilter},ewMin,esMin,${aliases.fetchQuota});` +
        'let smartPlan=__9rBuildSmartPriorityPlan(smartPopulation.accounts,smartPopulation.quotaMap,{preferredPlan:smartPriPlan,activationMode:smartPriActivation,sessionOrder:smartPriSessionOrder});' +
        'if(!smartPlan.length){alert("No known-plan accounts match the current provider, Weekly, and Session filters.");return}' +
        'let activateCount=smartPlan.filter(item=>item.isActive).length,deactivateCount=smartPlan.length-activateCount,skipped=smartPopulation.accounts.length-smartPlan.length;' +
        'if(!confirm("Apply Smart Priority to "+smartPlan.length+" accounts across all statuses and pages? Active: "+activateCount+", inactive: "+deactivateCount+", skipped unknown plans: "+skipped+"."))return;' +
        'setSmartPriResult("Updating "+smartPlan.length+" accounts...");' +
        'await __9rRunQuotaPool(smartPlan,async item=>{try{let res=await fetch("/api/providers/"+item.id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:item.isActive,priority:item.priority})});if(res.ok)ok++;else fail++}catch(err){fail++}},8);' +
        'setSmartPriResult("Done: "+ok+" updated, "+fail+" failed, "+skipped+" unknown plans skipped, "+smartPopulation.quotaFailures+" quota fetches failed.");' +
        `await b(${aliases.fetchAccounts},${aliases.page});` +
        'if(smartPriActivation==="preferred-only"){await __9rSyncK12Rotation(smartPriPlan==="k12",smartPriPlan==="k12"?"K12 \u0111\u01b0\u1ee3c \u01b0u ti\u00ean b\u1edfi Smart Priority":"Smart Priority \u0111\u00e3 t\u1eaft K12 (\u01b0u ti\u00ean "+smartPriPlan.toUpperCase()+")")}' +
        '}catch(err){setSmartPriResult("Failed: "+(err.message||String(err)));alert(err.message||String(err))}' +
        `finally{${aliases.busySetter}(false);setSmartPriLoading(false)}` +
        '};' +
        `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`;

    const smartScopeTextOld = 'Uses the accounts matching the current Weekly and Session filters. Unknown plans are skipped.';
    const smartScopeTextNew = 'Loads every active/inactive account and page for the current provider filter, then applies the current Weekly and Session filters. Unknown plans are skipped.';
    const preferredOptionsOld = 'children:[(0,a.jsx)("option",{value:"all",children:"No preferred plan"},"all")].concat(availablePlans.filter(p=>p!=="unknown").map(p=>(0,a.jsx)("option",{value:p,children:' +
        '{free:"Free",plus:"Plus",pro:"Pro",ultra:"Ultra",k12:"K12",team:"Team",enterprise:"Enterprise"}' +
        '[p]||p},p)))';
    const preferredOptionsNew = 'children:[(0,a.jsx)("option",{value:"all",children:"No preferred plan"},"all"),(0,a.jsx)("option",{value:"k12",children:"K12"},"k12"),(0,a.jsx)("option",{value:"plus",children:"Plus"},"plus"),(0,a.jsx)("option",{value:"pro",children:"Pro"},"pro"),(0,a.jsx)("option",{value:"ultra",children:"Ultra"},"ultra"),(0,a.jsx)("option",{value:"team",children:"Team"},"team"),(0,a.jsx)("option",{value:"enterprise",children:"Enterprise"},"enterprise"),(0,a.jsx)("option",{value:"free",children:"Free"},"free")]';

    if (hasLegacySmartPriority) {
        const legacyStart = c.indexOf('function __9rBuildSmartPriorityPlan(');
        const legacyEndMarker = `;let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`;
        const legacyEnd = legacyStart >= 0 ? c.indexOf(legacyEndMarker, legacyStart) : -1;
        if (legacyStart < 0 || legacyEnd < 0) {
            console.log('  ✗ Legacy Smart Priority boundaries not found');
            return false;
        }
        c = c.slice(0, legacyStart) + smartFunctions + c.slice(legacyEnd + legacyEndMarker.length);
        c = c.split(smartScopeTextOld).join(smartScopeTextNew);
        if (c.includes(preferredOptionsOld)) c = c.replace(preferredOptionsOld, preferredOptionsNew);
        c = c.replace(
            `onClick:()=>{setSmartPriOpen(true);setSmartPriResult(null)},disabled:${aliases.busy},`,
            `onClick:()=>{setSmartPriOpen(true);setSmartPriResult(null)},disabled:${aliases.busy}||smartPriLoading||${aliases.refreshBusy},`,
        );
        c = c.replace(
            `onClick:()=>${aliases.refreshCallback}(!0),disabled:${aliases.refreshBusy},`,
            `onClick:()=>${aliases.refreshCallback}(!0),disabled:${aliases.refreshBusy}||${aliases.busy},`,
        );
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Upgraded Smart Priority to full-population planning and shared locking');
        return true;
    }

    const stateAnchor = `[priResult,setPriResult]=(0,${aliases.react}.useState)(null)`;
    if (!c.includes(stateAnchor)) {
        console.log('  ✗ Priority state anchor not found');
        return false;
    }
    c = c.replace(stateAnchor, stateAnchor +
        `,[smartPriOpen,setSmartPriOpen]=(0,${aliases.react}.useState)(false)` +
        `,[smartPriPlan,setSmartPriPlan]=(0,${aliases.react}.useState)("all")` +
        `,[smartPriActivation,setSmartPriActivation]=(0,${aliases.react}.useState)("priority-only")` +
        `,[smartPriSessionOrder,setSmartPriSessionOrder]=(0,${aliases.react}.useState)("desc")` +
        `,[smartPriLoading,setSmartPriLoading]=(0,${aliases.react}.useState)(false)` +
        `,[smartPriResult,setSmartPriResult]=(0,${aliases.react}.useState)(null)`
    );

    const funcAnchor = `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`;
    if (!c.includes(funcAnchor)) {
        console.log('  ✗ Smart Priority function anchor not found');
        return false;
    }
    c = c.replace(funcAnchor, smartFunctions);

    const priorityButtonEnd = '(0,a.jsx)("span",{className:"hidden sm:inline",children:"Priority"})]})';
    if (!c.includes(priorityButtonEnd)) {
        console.log('  ✗ Priority button anchor not found');
        return false;
    }
    const smartButton = priorityButtonEnd + ',' +
        `(0,a.jsxs)("button",{type:"button",onClick:()=>{setSmartPriOpen(true);setSmartPriResult(null)},disabled:${aliases.busy}||smartPriLoading||${aliases.refreshBusy},` +
        'className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-cyan-500/30 px-2 text-xs text-cyan-600 transition-colors hover:bg-cyan-500/10 dark:text-cyan-400 disabled:opacity-50",' +
        'title:"Sort priority by preferred plan and Session remaining",children:[' +
        '(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"sort"}),' +
        '(0,a.jsx)("span",{className:"hidden sm:inline",children:"Smart Priority"})]})';
    c = c.replace(priorityButtonEnd, smartButton);

    const gridAnchor = c.includes('(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:planFilteredEZ')
        ? '(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:planFilteredEZ'
        : '(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-3",children:planFilteredEZ';
    if (!c.includes(gridAnchor)) {
        console.log('  ✗ Smart Priority grid anchor not found');
        return false;
    }
    const smartModal = 'smartPriOpen&&(0,a.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",onClick:e=>{if(e.target===e.currentTarget&&!smartPriLoading)setSmartPriOpen(false)},onKeyDown:e=>{if(e.key==="Escape"&&!smartPriLoading)setSmartPriOpen(false)},children:' +
        '(0,a.jsxs)("div",{role:"dialog","aria-modal":true,"aria-label":"Smart Priority",className:"w-[520px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-black/10 bg-surface-1 p-5 shadow-2xl dark:border-white/10",children:[' +
        '(0,a.jsx)("h3",{className:"text-lg font-bold text-text-primary",children:"Smart Priority"}),' +
        '(0,a.jsx)("p",{className:"mt-1 text-xs text-text-muted",children:"' + smartScopeTextNew + '"}),' +
        '(0,a.jsxs)("div",{className:"mt-4 space-y-3",children:[' +
        '(0,a.jsxs)("label",{className:"block space-y-1",children:[(0,a.jsx)("span",{className:"text-xs text-text-muted",children:"Preferred plan"}),(0,a.jsx)("select",{autoFocus:true,value:smartPriPlan,onChange:e=>setSmartPriPlan(e.target.value),className:"h-9 w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]","aria-label":"Preferred plan for smart priority",' + preferredOptionsNew + '})]}),' +
        '(0,a.jsxs)("label",{className:"block space-y-1",children:[(0,a.jsx)("span",{className:"text-xs text-text-muted",children:"Account status action"}),(0,a.jsxs)("select",{value:smartPriActivation,onChange:e=>setSmartPriActivation(e.target.value),className:"h-9 w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]","aria-label":"Activation mode for smart priority",children:[(0,a.jsx)("option",{value:"priority-only",children:"Priority only — keep current status"}),(0,a.jsx)("option",{value:"preferred-only",children:"Activate selected plan and deactivate others"})]})]}),' +
        '(0,a.jsxs)("label",{className:"block space-y-1",children:[(0,a.jsx)("span",{className:"text-xs text-text-muted",children:"Session ordering"}),(0,a.jsxs)("select",{value:smartPriSessionOrder,onChange:e=>setSmartPriSessionOrder(e.target.value),className:"h-9 w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]","aria-label":"Session order for smart priority",children:[(0,a.jsx)("option",{value:"desc",children:"Highest Session % first"}),(0,a.jsx)("option",{value:"asc",children:"Lowest Session % first"})]})]})' +
        ']}),' +
        'smartPriResult&&(0,a.jsx)("p",{role:"status","aria-live":"polite",className:"mt-3 text-sm font-medium text-text-primary",children:smartPriResult}),' +
        '(0,a.jsxs)("div",{className:"mt-4 flex justify-end gap-2",children:[(0,a.jsx)("button",{type:"button",onClick:()=>setSmartPriOpen(false),disabled:smartPriLoading,className:"h-8 rounded-lg border border-black/10 px-4 text-xs text-text-muted hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 disabled:opacity-50",children:"Cancel"}),(0,a.jsx)("button",{type:"button",onClick:bulkSmartPrioritySort,disabled:smartPriLoading,"aria-busy":smartPriLoading,className:"h-8 rounded-lg bg-cyan-600 px-4 text-xs font-medium text-white hover:bg-cyan-700 disabled:opacity-50",children:smartPriLoading?"Updating...":"Apply Smart Priority"})]})' +
        ']})}),';
    c = c.replace(gridAnchor, smartModal + gridAnchor);
    c = c.replace(
        `onClick:()=>${aliases.refreshCallback}(!0),disabled:${aliases.refreshBusy},`,
        `onClick:()=>${aliases.refreshCallback}(!0),disabled:${aliases.refreshBusy}||${aliases.busy},`,
    );

    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added full-population Smart Priority planner and controls');
    return true;
}

// ============================================================
// PATCH 23: Bulk Toggle (Activate/Deactivate) by Plan Type
// ============================================================
function patchBulkToggleByPlan() {
    console.log('[PATCH 23] Bulk Toggle by Plan');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }

    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);

    if (c.includes('bulkToggleByPlan')) {
        console.log('  → Already patched');
        return true;
    }

    // 1. State injection — after smartPriResult state (added by Patch 21)
    const stateAnchor = `,[smartPriResult,setSmartPriResult]=(0,${aliases.react}.useState)(null)`;
    if (!c.includes(stateAnchor)) {
        console.log('  ✗ Smart Priority state anchor not found');
        return false;
    }
    c = c.replace(stateAnchor, stateAnchor +
        `,[planToggleOpen,setPlanToggleOpen]=(0,${aliases.react}.useState)(false)` +
        `,[planToggleTarget,setPlanToggleTarget]=(0,${aliases.react}.useState)("free")` +
        `,[planToggleAction,setPlanToggleAction]=(0,${aliases.react}.useState)("deactivate")` +
        `,[planToggleLoading,setPlanToggleLoading]=(0,${aliases.react}.useState)(false)` +
        `,[planToggleResult,setPlanToggleResult]=(0,${aliases.react}.useState)(null)`
    );

    // 2. Function injection — before bulkLabel assignment
    const funcAnchor = `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`;
    if (!c.includes(funcAnchor)) {
        console.log('  ✗ Function anchor not found');
        return false;
    }

    const toggleFunc =
        'const bulkToggleByPlan=async()=>{' +
        'let isDeactivate=planToggleAction==="deactivate";' +
        `let allByPlan=${aliases.list}.filter(e=>normPlan(${aliases.quotaMap}[e.id]?.plan)===planToggleTarget);` +
        'let targets=isDeactivate?allByPlan.filter(e=>e.isActive??true):allByPlan.filter(e=>!(e.isActive??true));' +
        'if(!targets.length){alert("Không tìm thấy tài khoản "+(planToggleTarget.toUpperCase())+" "+(isDeactivate?"đang bật":"đang tắt")+" trên trang này.");return}' +
        'let actionLabel=isDeactivate?"TẮT":"BẬT";' +
        'if(!confirm(actionLabel+" "+targets.length+" tài khoản "+planToggleTarget.toUpperCase()+" trên trang này?"))return;' +
        `setPlanToggleLoading(true);setPlanToggleResult(null);${aliases.busySetter}(true);` +
        'let ok=0,fail=0;' +
        'try{' +
        'await __9rRunQuotaPool(targets,async item=>{' +
        'try{let res=await fetch("/api/providers/"+item.id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:!isDeactivate})});' +
        'if(res.ok)ok++;else fail++}catch(err){fail++}},8);' +
        'setPlanToggleResult("Done: "+ok+" updated, "+fail+" failed");' +
        `await b(${aliases.fetchAccounts},${aliases.page});` +
        'if(planToggleTarget==="k12"&&ok>0){await __9rSyncK12Rotation(planToggleAction==="activate",planToggleAction==="deactivate"?"Bulk Toggle \u0111\u00e3 t\u1eaft K12":"Bulk Toggle \u0111\u00e3 b\u1eadt K12")}' +
        '}catch(err){setPlanToggleResult("Failed: "+(err.message||String(err)))}' +
        `finally{setPlanToggleLoading(false);${aliases.busySetter}(false)}` +
        '};' +
        `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`;

    c = c.replace(funcAnchor, toggleFunc);

    // 3. Button injection — after Smart Priority button
    const smartBtnEnd = '(0,a.jsx)("span",{className:"hidden sm:inline",children:"Smart Priority"})]})'
    if (!c.includes(smartBtnEnd)) {
        console.log('  ✗ Smart Priority button anchor not found');
        return false;
    }

    const toggleButton = smartBtnEnd + ',' +
        `(0,a.jsxs)("button",{type:"button",onClick:()=>{setPlanToggleOpen(true);setPlanToggleResult(null)},disabled:${aliases.busy}||planToggleLoading,` +
        'className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-violet-500/30 px-2 text-xs text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400 disabled:opacity-50",' +
        'title:"Tắt/Bật tài khoản theo gói",' +
        'children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"toggle_on"}),' +
        '(0,a.jsx)("span",{className:"hidden sm:inline",children:"Tắt/Bật theo Gói"})]})';

    c = c.replace(smartBtnEnd, toggleButton);

    // 4. Modal injection — before the card grid
    const gridAnchor = c.includes('(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:planFilteredEZ')
        ? '(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:planFilteredEZ'
        : '(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-3",children:planFilteredEZ';
    if (!c.includes(gridAnchor)) {
        console.log('  ✗ Grid anchor not found');
        return false;
    }

    const planLabels = '{free:"Free",plus:"Plus",pro:"Pro",ultra:"Ultra",k12:"K12",team:"Team",enterprise:"Enterprise",unknown:"Unknown"}';

    const toggleModal =
        'planToggleOpen&&(0,a.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",' +
        'onClick:e=>{if(e.target===e.currentTarget&&!planToggleLoading)setPlanToggleOpen(false)},' +
        'onKeyDown:e=>{if(e.key==="Escape"&&!planToggleLoading)setPlanToggleOpen(false)},children:' +
        '(0,a.jsxs)("div",{role:"dialog","aria-modal":true,"aria-label":"Tắt/Bật theo Gói",' +
        'className:"w-[480px] max-w-[calc(100vw-2rem)] rounded-xl border border-black/10 bg-surface-1 p-5 shadow-2xl dark:border-white/10",children:[' +
        // Title
        '(0,a.jsx)("h3",{className:"text-lg font-bold text-text-primary",children:"Tắt/Bật tài khoản theo Gói"}),' +
        '(0,a.jsx)("p",{className:"mt-1 text-xs text-text-muted",children:"Chọn gói và hành động để tắt hoặc bật hàng loạt tài khoản trên trang hiện tại."}),' +
        // Form fields
        '(0,a.jsxs)("div",{className:"mt-4 space-y-3",children:[' +
        // Plan dropdown
        '(0,a.jsxs)("label",{className:"block space-y-1",children:[' +
        '(0,a.jsx)("span",{className:"text-xs text-text-muted",children:"Chọn gói"}),' +
        '(0,a.jsx)("select",{value:planToggleTarget,onChange:e=>setPlanToggleTarget(e.target.value),' +
        'className:"h-9 w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]",' +
        '"aria-label":"Chọn gói",' +
        'children:availablePlans.filter(p=>p!=="unknown").map(p=>' +
        '(0,a.jsx)("option",{value:p,children:' + planLabels + '[p]||p},p))' +
        '})]}),' +
        // Action dropdown
        '(0,a.jsxs)("label",{className:"block space-y-1",children:[' +
        '(0,a.jsx)("span",{className:"text-xs text-text-muted",children:"Hành động"}),' +
        '(0,a.jsxs)("select",{value:planToggleAction,onChange:e=>setPlanToggleAction(e.target.value),' +
        'className:"h-9 w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]",' +
        '"aria-label":"Hành động",' +
        'children:[(0,a.jsx)("option",{value:"deactivate",children:"Tắt (Deactivate)"}),(0,a.jsx)("option",{value:"activate",children:"Bật (Activate)"})]' +
        '})]})' +
        // Preview box
        `,(0,a.jsx)("div",{className:"rounded-lg bg-black/[0.03] dark:bg-white/[0.05] p-3",children:(()=>{` +
        `let __tByPlan=${aliases.list}.filter(e=>normPlan(${aliases.quotaMap}[e.id]?.plan)===planToggleTarget);` +
        'let __tMatch=planToggleAction==="deactivate"?__tByPlan.filter(e=>e.isActive??true).length:__tByPlan.filter(e=>!(e.isActive??true)).length;' +
        'let __tTotal=__tByPlan.length;' +
        'let __tActionLabel=planToggleAction==="deactivate"?"tắt":"bật";' +
        'let __tStatusLabel=planToggleAction==="deactivate"?"đang bật":"đang tắt";' +
        'return (0,a.jsxs)("p",{className:"text-sm text-text-primary",children:[' +
        '(0,a.jsx)("span",{className:"font-bold text-violet-600 dark:text-violet-400",children:__tMatch}),' +
        '" / ",__tTotal," tài khoản ",' + planLabels + '[planToggleTarget]||planToggleTarget," ",__tStatusLabel," → sẽ được ",' +
        '(0,a.jsx)("span",{className:planToggleAction==="deactivate"?"font-bold text-red-500":"font-bold text-emerald-500",children:__tActionLabel})]})' +
        '})()})' +
        ']}),' +
        // Result text
        'planToggleResult&&(0,a.jsx)("p",{role:"status","aria-live":"polite",className:"mt-3 text-sm font-medium "+(planToggleResult.includes("fail")?"text-red-500":"text-emerald-500"),children:planToggleResult}),' +
        // Footer buttons
        '(0,a.jsxs)("div",{className:"mt-4 flex justify-end gap-2",children:[' +
        '(0,a.jsx)("button",{type:"button",onClick:()=>setPlanToggleOpen(false),disabled:planToggleLoading,' +
        'className:"h-8 rounded-lg border border-black/10 px-4 text-xs text-text-muted hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 disabled:opacity-50",children:"Cancel"}),' +
        `(0,a.jsx)("button",{type:"button",onClick:bulkToggleByPlan,disabled:planToggleLoading,"aria-busy":planToggleLoading,` +
        'className:"h-8 rounded-lg bg-violet-600 px-4 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50",' +
        'children:planToggleLoading?"Đang xử lý...":"Áp dụng"})]})' +
        ']})}),'
    ;

    c = c.replace(gridAnchor, toggleModal + gridAnchor);

    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Added bulk toggle by plan on Quota page');
    return true;
}

// ============================================================
// PATCH 24: K12 Rotation Engine (API Server)
// ============================================================
function patchK12RotationEngine() {
    console.log('[PATCH 24] K12 Rotation Engine');
    const file = path.join(BASE, 'custom-server.js');
    if (!fs.existsSync(file)) { console.log('  \u2717 custom-server.js not found'); return false; }

    let c = fs.readFileSync(file, 'utf8');
    if (c.includes('__k12_runRotation')) {
        console.log('  \u2192 Already patched');
        return true;
    }

    // Injection point 1: Before require("./server.js") — engine functions
    const requireAnchor = 'require("./server.js");';
    if (!c.includes(requireAnchor)) {
        console.log('  \u2717 require("./server.js") not found');
        return false;
    }

    const engineCode = [
        '/* K12 Rotation Engine (9router Patch 24) */',
        'var __k12_stateFile="",__k12_apiPort=53220,__k12_state={enabled:true,config:{activePercent:20,workMinutes:60,restMinutesMin:30,restMinutesMax:60,checkIntervalSeconds:120},accounts:{},lastRotation:null,log:[]},__k12_timer=null,__k12_running=false;',
        'var __k12_loadState=function(){},__k12_saveState=function(){},__k12_log=function(){},__k12_httpReq=function(){return Promise.resolve({status:0,data:null})},__k12_isK12=function(){return false},__k12_runRotation=function(){},__k12_startTimer=function(){},__k12_stopTimer=function(){},__k12_handleApi=function(u,req,res){res.writeHead(503);res.end()};',
        'try{(function(){',
        'var __req=eval("require"),__fs=__req("fs"),__path=__req("path"),__os=__req("os"),__crypto=__req("crypto"),__http=__req("http");',
        '__k12_stateFile=__path.join(process.env.APPDATA||__os.homedir(),"9router","k12-rotation.json");',
        '__k12_apiPort=parseInt(process.env.PORT,10)||53220;',
        'var __k12_dataDir=__path.join(process.env.APPDATA||__os.homedir(),"9router");',
        'var __k12_cliToken="";try{var __mid=__fs.readFileSync(__path.join(__k12_dataDir,"machine-id"),"utf8").trim();var __csec=__fs.readFileSync(__path.join(__k12_dataDir,"auth","cli-secret"),"utf8").trim();__k12_cliToken=__crypto.createHash("sha256").update(__mid+"9r-cli-auth"+__csec).digest("hex").substring(0,16);console.log("[K12 Rotation] CLI token computed")}catch(e){console.log("[K12 Rotation] CLI token error:"+e.message)};',
        '',
        '__k12_loadState=function(){try{if(__fs.existsSync(__k12_stateFile)){var d=JSON.parse(__fs.readFileSync(__k12_stateFile,"utf8"));if(d.config)Object.assign(__k12_state.config,d.config);__k12_state.enabled=!!d.enabled;__k12_state.accounts=d.accounts||{};__k12_state.lastRotation=d.lastRotation||null;__k12_state.log=Array.isArray(d.log)?d.log:[]}}catch(e){console.log("[K12 Rotation] Load error:"+e.message)}};',
        '',
        '__k12_saveState=function(){try{var dir=__path.dirname(__k12_stateFile);if(!__fs.existsSync(dir))__fs.mkdirSync(dir,{recursive:true});if(__k12_state.log&&__k12_state.log.length>100)__k12_state.log=__k12_state.log.slice(-50);__fs.writeFileSync(__k12_stateFile,JSON.stringify(__k12_state,null,2),"utf8")}catch(e){console.log("[K12 Rotation] Save error:"+e.message)}};',
        '',
        '__k12_log=function(msg){var entry=new Date().toISOString().slice(0,19).replace("T"," ")+" "+msg;console.log("[K12 Rotation] "+msg);if(!__k12_state.log)__k12_state.log=[];__k12_state.log.push(entry)};',
        '',
        '__k12_httpReq=function(method,reqPath,body){return new Promise(function(resolve,reject){var hdrs={"Content-Type":"application/json"};if(__k12_cliToken)hdrs["x-9r-cli-token"]=__k12_cliToken;var opts={hostname:"127.0.0.1",port:__k12_apiPort,path:reqPath,method:method,headers:hdrs};var r=__http.request(opts,function(res){var data="";res.on("data",function(ch){data+=ch});res.on("end",function(){try{resolve({status:res.statusCode,data:JSON.parse(data)})}catch(e){resolve({status:res.statusCode,data:null})}})});r.on("error",reject);r.setTimeout(15000,function(){r.destroy();reject(new Error("timeout"))});if(body)r.write(JSON.stringify(body));r.end()})};',
        '',
        '__k12_isK12=function(acc){var plan=String((acc&&acc.providerSpecificData&&acc.providerSpecificData.chatgptPlanType)||(acc&&acc.plan)||"").toLowerCase().trim();var em=String(acc.email||acc.name||"").toLowerCase();return plan.indexOf("k12")>=0||em.indexOf("@yeutiengnhat.com.vn")>=0};',
        '__k12_maskEmail=function(email){if(!email||typeof email!=="string")return email;var at=email.indexOf("@");if(at<0)return email;var user=email.substring(0,at),domain=email.substring(at+1);var uMask=user.length<=3?user:user.substring(0,3)+"***"+user.substring(user.length-2);var dots=domain.split(".");var dName=dots[0]||"";var dExt=dots.slice(1).join(".");var dMask=dName.length<=2?dName+"***":dName.substring(0,Math.min(2,dName.length))+"***";return uMask+"@"+dMask+(dExt?"."+dExt:"")};',
        '',
        '__k12_runRotation=function(){if(__k12_running||!__k12_state.enabled)return;__k12_running=true;(async function(){try{',
        '  var allAcc=[],pg=1,tp=1;while(pg<=tp){var resp=await __k12_httpReq("GET","/api/providers/client?pageSize=500&accountStatus=all&page="+pg);if(!resp||resp.status!==200||!resp.data)break;var batch=Array.isArray(resp.data.connections)?resp.data.connections:[];allAcc=allAcc.concat(batch);var pag=resp.data.pagination||{};tp=Number(pag.totalPages)||pg;if(batch.length===0)break;pg++}',
        '  if(allAcc.length===0){__k12_running=false;return}',
        '  for(var di=0;di<allAcc.length;di++){if(!allAcc[di].providerSpecificData||!allAcc[di].providerSpecificData.chatgptPlanType){try{var dr=await __k12_httpReq("GET","/api/providers/"+allAcc[di].id);if(dr&&dr.status===200&&dr.data&&dr.data.connection){allAcc[di]=dr.data.connection}}catch(e){}}}',
        '  var k12=allAcc.filter(__k12_isK12);__k12_log("Found "+allAcc.length+" total, "+k12.length+" K12");if(k12.length===0){__k12_running=false;return}',
        '  var usageMap={};for(var ui=0;ui<k12.length;ui++){try{var ur=await __k12_httpReq("GET","/api/usage/"+k12[ui].id);if(ur&&ur.status===200&&ur.data){usageMap[k12[ui].id]=ur.data}}catch(e){}}',
        '  var __scoreAcc=function(id){var u=usageMap[id];if(!u||!u.quotas)return 0.5;var ss=u.quotas.session,wk=u.quotas.weekly;var sPct=ss?(ss.remaining||0)/(ss.total||1):1;var wPct=wk?(wk.remaining||0)/(wk.total||1):1;var trk=__k12_state.accounts[id],restBonus=0;if(trk&&trk.activatedAt){var elapsed=Date.now()-new Date(trk.activatedAt).getTime();if(elapsed>3600000)restBonus=0.1}return sPct*0.6+wPct*0.3+restBonus};',
        '  var cfg=__k12_state.config,now=Date.now();',
        '  var targetActive=Math.max(1,Math.round(k12.length*cfg.activePercent/100));',
        '  var toDeact=[],eligible=[],activeCount=0;',
        '  for(var i=0;i<k12.length;i++){var acc=k12[i],id=acc.id,isAct=acc.isActive!==false,trk=__k12_state.accounts[id],u=usageMap[id];if(isAct){activeCount++;var sessOut=u&&u.quotas&&u.quotas.session&&u.quotas.session.remaining===0;var weekOut=u&&u.quotas&&u.quotas.weekly&&u.quotas.weekly.remaining===0;var limitHit=u&&u.limitReached;if(sessOut||weekOut||limitHit){toDeact.push(id)}else if(!trk||!trk.activatedAt){var jt=Math.random()*10*60000;__k12_state.accounts[id]={email:acc.email||acc.name||null,activatedAt:new Date(now).toISOString(),scheduledRestAt:new Date(now+cfg.workMinutes*60000+jt).toISOString(),restUntil:null}}else if(trk.scheduledRestAt&&now>new Date(trk.scheduledRestAt).getTime()){toDeact.push(id)}}else{var wkRemain=u&&u.quotas&&u.quotas.weekly?u.quotas.weekly.remaining:-1;if(wkRemain===0)continue;if(trk&&trk.restUntil){if(now>new Date(trk.restUntil).getTime())eligible.push(id)}else{eligible.push(id)}}}',
        '  __k12_log("Classify: active="+activeCount+" toDeact="+toDeact.length+" eligible="+eligible.length+" target="+targetActive);',
        '  var activated=0,deactivated=0;',
        '  for(var d=0;d<toDeact.length;d++){var du=usageMap[toDeact[d]],rdur;var dSessOut=du&&du.quotas&&du.quotas.session&&du.quotas.session.remaining===0;var dWkOut=du&&du.quotas&&du.quotas.weekly&&du.quotas.weekly.remaining===0;if(dWkOut){rdur=du.quotas.weekly.resetAt?Math.max(0,new Date(du.quotas.weekly.resetAt).getTime()-now):86400000}else if(dSessOut&&du.quotas.session.resetAt){rdur=Math.max(0,new Date(du.quotas.session.resetAt).getTime()-now);if(rdur<60000)rdur=cfg.restMinutesMin*60000}else{rdur=(cfg.restMinutesMin+Math.random()*(cfg.restMinutesMax-cfg.restMinutesMin))*60000}var ok=await __k12_httpReq("PUT","/api/providers/"+toDeact[d],{isActive:false});if(ok&&ok.status>=200&&ok.status<300){var prevE=__k12_state.accounts[toDeact[d]]?__k12_state.accounts[toDeact[d]].email:null;__k12_state.accounts[toDeact[d]]={email:prevE,activatedAt:null,scheduledRestAt:null,restUntil:new Date(now+rdur).toISOString()};deactivated++;activeCount--;__k12_log("Deact "+toDeact[d].substring(0,8)+(dSessOut?" (session=0)":dWkOut?" (weekly=0)":" (time)")+" rest="+(rdur/60000).toFixed(0)+"m")}}',
        '  if(activeCount>targetActive){var actK12=k12.filter(function(a){return a.isActive!==false&&toDeact.indexOf(a.id)<0}).sort(function(a,b){return __scoreAcc(a.id)-__scoreAcc(b.id)});var excess=activeCount-targetActive;__k12_log("Excess deact: "+excess+" candidates="+actK12.length);for(var x=0;x<actK12.length&&excess>0;x++){var xdu=usageMap[actK12[x].id],xrdur;var xSessOut=xdu&&xdu.quotas&&xdu.quotas.session&&xdu.quotas.session.remaining===0;if(xSessOut&&xdu.quotas.session.resetAt){xrdur=Math.max(0,new Date(xdu.quotas.session.resetAt).getTime()-now)}else{xrdur=(cfg.restMinutesMin+Math.random()*(cfg.restMinutesMax-cfg.restMinutesMin))*60000}try{var rr=await __k12_httpReq("PUT","/api/providers/"+actK12[x].id,{isActive:false});__k12_log("PUT "+actK12[x].id.substring(0,8)+" status="+(rr?rr.status:"null"));if(rr&&rr.status>=200&&rr.status<300){var prevEx=__k12_state.accounts[actK12[x].id]?__k12_state.accounts[actK12[x].id].email:actK12[x].email;__k12_state.accounts[actK12[x].id]={email:prevEx,activatedAt:null,scheduledRestAt:null,restUntil:new Date(now+xrdur).toISOString()};deactivated++;activeCount--;excess--}}catch(pe){__k12_log("PUT error: "+pe.message)}}}',
        '  if(activeCount<targetActive&&eligible.length>0){eligible.sort(function(a,b){return __scoreAcc(b)-__scoreAcc(a)});var needed=targetActive-activeCount;for(var a=0;a<Math.min(needed,eligible.length);a++){var eid=eligible[a],jit=Math.random()*10*60000;var elObj=k12.find(function(k){return k.id===eid});var elEmail=elObj?(elObj.email||elObj.name):null;var ar=await __k12_httpReq("PUT","/api/providers/"+eid,{isActive:true});if(ar&&ar.status>=200&&ar.status<300){__k12_state.accounts[eid]={email:elEmail,activatedAt:new Date(now).toISOString(),scheduledRestAt:new Date(now+cfg.workMinutes*60000+jit).toISOString(),restUntil:null};activated++;activeCount++}}}',
        '  if(activeCount===0&&k12.length>0){var bestId=null,bestReset=Infinity;for(var bi=0;bi<k12.length;bi++){var bu=usageMap[k12[bi].id];if(bu&&bu.quotas&&bu.quotas.session&&bu.quotas.session.resetAt){var rt=new Date(bu.quotas.session.resetAt).getTime();if(rt<bestReset){bestReset=rt;bestId=k12[bi].id}}}if(bestId){var bObj=k12.find(function(k){return k.id===bestId});var bEmail=bObj?(bObj.email||bObj.name):null;var er=await __k12_httpReq("PUT","/api/providers/"+bestId,{isActive:true});if(er&&er.status>=200&&er.status<300){__k12_state.accounts[bestId]={email:bEmail,activatedAt:new Date(now).toISOString(),scheduledRestAt:new Date(now+cfg.workMinutes*60000).toISOString(),restUntil:null};activated++;activeCount++;__k12_log("Emergency: activated "+bestId.substring(0,8)+" (nearest session reset)")}}}',
        '  var k12Ids={};k12.forEach(function(a){k12Ids[a.id]=true;if(!__k12_state.accounts[a.id]){__k12_state.accounts[a.id]={activatedAt:a.isActive!==false?new Date(now).toISOString():null,scheduledRestAt:null,restUntil:null}}__k12_state.accounts[a.id].email=a.email||a.name||__k12_state.accounts[a.id].email||null});Object.keys(__k12_state.accounts).forEach(function(id){if(!k12Ids[id])delete __k12_state.accounts[id]});',
        '  __k12_state.lastRotation=new Date(now).toISOString();',
        '  if(activated>0||deactivated>0)__k12_log("Rotation: +"+activated+" -"+deactivated+" Active:"+activeCount+"/"+k12.length+" (target "+targetActive+")");',
        '  __k12_saveState();',
        '}catch(e){__k12_log("Error: "+(e.message||String(e)))}finally{__k12_running=false}})()};',
        '__k12_restoreAllAccounts=function(){(async function(){try{var allAcc=[],pg=1,tp=1;while(pg<=tp){var resp=await __k12_httpReq("GET","/api/providers/client?pageSize=500&accountStatus=all&page="+pg);if(!resp||resp.status!==200||!resp.data)break;var batch=Array.isArray(resp.data.connections)?resp.data.connections:[];allAcc=allAcc.concat(batch);var pag=resp.data.pagination||{};tp=Number(pag.totalPages)||pg;if(batch.length===0)break;pg++}for(var di=0;di<allAcc.length;di++){if(!allAcc[di].providerSpecificData||!allAcc[di].providerSpecificData.chatgptPlanType){try{var dr=await __k12_httpReq("GET","/api/providers/"+allAcc[di].id);if(dr&&dr.status===200&&dr.data&&dr.data.connection){allAcc[di]=dr.data.connection}}catch(e){}}}var k12=allAcc.filter(__k12_isK12);var restored=0;for(var i=0;i<k12.length;i++){if(k12[i].isActive===false){var r=await __k12_httpReq("PUT","/api/providers/"+k12[i].id,{isActive:true});if(r&&r.status>=200&&r.status<300)restored++}}__k12_state.accounts={};__k12_saveState();__k12_log("Rotation disabled: "+restored+"/"+k12.length+" K12 accounts restored to active")}catch(e){__k12_log("Restore error: "+(e.message||String(e)))}})()};',
        '',
        '__k12_startTimer=function(){if(__k12_timer)clearInterval(__k12_timer);if(!__k12_state.enabled)return;__k12_timer=setInterval(__k12_runRotation,(__k12_state.config.checkIntervalSeconds||120)*1000);__k12_log(\"Timer started (interval: \"+(__k12_state.config.checkIntervalSeconds||120)+\"s)\")};',
        '',
        '__k12_stopTimer=function(){if(__k12_timer){clearInterval(__k12_timer);__k12_timer=null}__k12_log(\"Timer stopped\")};',
        '',
        '__k12_handleApi=function(requestUrl,req,res){',
        '  res.setHeader(\"Access-Control-Allow-Origin\",\"*\");res.setHeader(\"Access-Control-Allow-Methods\",\"GET, PUT, POST, OPTIONS\");res.setHeader(\"Access-Control-Allow-Headers\",\"Content-Type\");',
        '  if(req.method===\"OPTIONS\"){res.writeHead(204);return res.end()}',
        '  var sendJson=function(st,dt){res.writeHead(st,{\"Content-Type\":\"application/json\"});res.end(JSON.stringify(dt))};',
        '  var pn=requestUrl.pathname;',
        '  if(pn===\"/api/k12-rotation/status\"&&req.method===\"GET\"){var now=Date.now();if(__k12_state.enabled&&__k12_state.lastRotation){var elapsed=now-new Date(__k12_state.lastRotation).getTime();if(elapsed>=(__k12_state.config.checkIntervalSeconds||120)*1000){__k12_runRotation()}}var accs=Object.entries(__k12_state.accounts||{}).map(function(p){var id=p[0],info=p[1],isAct=!!(info.activatedAt&&!info.restUntil);return{id:id,email:__k12_maskEmail(info.email||null),isActive:isAct,activatedAt:info.activatedAt||null,scheduledRestAt:info.scheduledRestAt||null,restUntil:info.restUntil||null,minutesUntilRest:isAct&&info.scheduledRestAt?Math.max(0,Math.round((new Date(info.scheduledRestAt).getTime()-now)/60000)):null,minutesUntilEligible:!isAct&&info.restUntil?Math.max(0,Math.round((new Date(info.restUntil).getTime()-now)/60000)):0}});var actCnt=accs.filter(function(a){return a.isActive}).length;return sendJson(200,{enabled:__k12_state.enabled,totalK12:accs.length,activeCount:actCnt,restingCount:accs.length-actCnt,targetActive:Math.max(1,Math.round(accs.length*__k12_state.config.activePercent/100)),config:__k12_state.config,lastRotation:__k12_state.lastRotation,timerRunning:!!__k12_timer,accounts:accs,recentLog:(__k12_state.log||[]).slice(-20)})}',
        '  if(pn===\"/api/k12-rotation/toggle\"&&req.method===\"POST\"){var body=\"\";req.on(\"data\",function(ch){body+=ch});req.on(\"end\",function(){try{var dt=JSON.parse(body);__k12_state.enabled=!!dt.enabled;if(__k12_state.enabled){__k12_startTimer();setTimeout(__k12_runRotation,2000)}else{__k12_stopTimer();__k12_restoreAllAccounts()}__k12_saveState();return sendJson(200,{enabled:__k12_state.enabled})}catch(e){return sendJson(400,{error:e.message})}});return}',
        '  if(pn===\"/api/k12-rotation/config\"&&req.method===\"PUT\"){var body=\"\";req.on(\"data\",function(ch){body+=ch});req.on(\"end\",function(){try{var dt=JSON.parse(body),cf=__k12_state.config;if(dt.activePercent!==undefined)cf.activePercent=Math.max(5,Math.min(100,Number(dt.activePercent)));if(dt.workMinutes!==undefined)cf.workMinutes=Math.max(10,Math.min(180,Number(dt.workMinutes)));if(dt.restMinutesMin!==undefined)cf.restMinutesMin=Math.max(5,Math.min(120,Number(dt.restMinutesMin)));if(dt.restMinutesMax!==undefined)cf.restMinutesMax=Math.max(cf.restMinutesMin,Math.min(180,Number(dt.restMinutesMax)));if(dt.checkIntervalSeconds!==undefined)cf.checkIntervalSeconds=Math.max(30,Math.min(600,Number(dt.checkIntervalSeconds)));if(__k12_state.enabled){__k12_stopTimer();__k12_startTimer()}__k12_saveState();__k12_log(\"Config updated\");return sendJson(200,{config:cf})}catch(e){return sendJson(400,{error:e.message})}});return}',
        '  if(pn===\"/api/k12-rotation/force\"&&(req.method===\"POST\"||req.method===\"GET\")){if(!__k12_state.enabled)return sendJson(400,{error:\"Rotation is not enabled\"});__k12_runRotation();return sendJson(200,{message:\"Rotation triggered\"})}',
        '  return sendJson(404,{error:\"Unknown K12 rotation endpoint\"})};',
        '})()}catch(e){console.log(\"[K12 Rotation] Engine init skipped: \"+e.message)}',
    ].join('\n');

    // Injection point 2: API routing inside wrapped function
    const handlerReturn = 'return handler(req, res);';
    if (!c.includes(handlerReturn)) {
        console.log('  \u2717 handler return not found');
        return false;
    }

    const apiRouting = 'if(requestUrl&&requestUrl.pathname.startsWith("/api/k12-rotation")){return __k12_handleApi(requestUrl,req,res)}\n    ';

    // Injection point 3: Timer startup after require
    const timerStartup = '\ntry{setTimeout(function(){__k12_loadState();if(__k12_state.enabled){__k12_startTimer();setTimeout(__k12_runRotation,3000)}console.log("[K12 Rotation] Engine initialized (enabled: "+__k12_state.enabled+")")},8000)}catch(e){}\n';

    // Apply injections
    c = c.replace(requireAnchor, engineCode + '\n\n' + requireAnchor + timerStartup);
    c = c.replace(handlerReturn, apiRouting + handlerReturn);

    fs.writeFileSync(file, c, 'utf8');
    console.log('  \u2705 Added K12 rotation engine to custom-server.js');
    return true;
}

// ============================================================
// PATCH 25: K12 Rotation Dashboard UI
// ============================================================
function patchK12RotationDashboard() {
    console.log('[PATCH 25] K12 Rotation Dashboard');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  \u2717 Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  \u2717 File not found'); return false; }

    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);

    if (c.includes('k12RotOpen')) {
        console.log('  \u2192 Already patched');
        return true;
    }

    // 1. State injection — after planToggleResult state (added by Patch 23)
    const stateAnchor = `,[planToggleResult,setPlanToggleResult]=(0,${aliases.react}.useState)(null)`;
    if (!c.includes(stateAnchor)) {
        console.log('  \u2717 Plan Toggle state anchor not found');
        return false;
    }
    c = c.replace(stateAnchor, stateAnchor +
        `,[k12RotOpen,setK12RotOpen]=(0,${aliases.react}.useState)(false)` +
        `,[k12RotStatus,setK12RotStatus]=(0,${aliases.react}.useState)(null)` +
        `,[k12RotLoading,setK12RotLoading]=(0,${aliases.react}.useState)(false)` +
        `,[k12RotSaving,setK12RotSaving]=(0,${aliases.react}.useState)(false)` +
        `,[k12RotCfg,setK12RotCfg]=(0,${aliases.react}.useState)({activePercent:20,workMinutes:60,restMinutesMin:30,restMinutesMax:60})`
    );

    // 2. Functions injection — before bulkToggleByPlan
    const funcAnchor = 'const bulkToggleByPlan=async()=>';
    if (!c.includes(funcAnchor)) {
        console.log('  \u2717 bulkToggleByPlan function anchor not found');
        return false;
    }

    const k12Funcs =
        'const __k12ApiBase="http://"+(typeof window!=="undefined"&&window.location?window.location.hostname:"127.0.0.1")+":53220";' +
        `const k12RotPageRefresh=()=>{try{if(typeof ${aliases.fetchAccounts}==="function")${aliases.fetchAccounts}()}catch(_e){}};` +
        'const k12RotFetch=async()=>{setK12RotLoading(true);try{let r=await fetch(__k12ApiBase+"/api/k12-rotation/status");if(r.ok){let d=await r.json();setK12RotStatus(d);if(d.config)setK12RotCfg({activePercent:d.config.activePercent||20,workMinutes:d.config.workMinutes||60,restMinutesMin:d.config.restMinutesMin||30,restMinutesMax:d.config.restMinutesMax||60})}else{setK12RotStatus(null)}}catch(e){setK12RotStatus(null);console.error("K12 fetch error:",e)}finally{setK12RotLoading(false)}};' +
        'const k12RotToggle=async(enabled)=>{setK12RotSaving(true);try{let r=await fetch(__k12ApiBase+"/api/k12-rotation/toggle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled})});if(r.ok){await k12RotFetch();k12RotPageRefresh()}}catch(e){alert("Failed: "+e.message)}finally{setK12RotSaving(false)}};' +
        'const k12RotSaveCfg=async()=>{setK12RotSaving(true);try{let r=await fetch(__k12ApiBase+"/api/k12-rotation/config",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(k12RotCfg)});if(r.ok){await k12RotFetch();k12RotPageRefresh()}else alert("Save failed")}catch(e){alert("Failed: "+e.message)}finally{setK12RotSaving(false)}};' +
        'const k12RotForce=async()=>{setK12RotSaving(true);try{await fetch(__k12ApiBase+"/api/k12-rotation/force",{method:"POST"});await new Promise(r=>setTimeout(r,2500));await k12RotFetch();k12RotPageRefresh()}catch(e){alert("Failed: "+e.message)}finally{setK12RotSaving(false)}};' +
        funcAnchor;

    c = c.replace(funcAnchor, k12Funcs);

    // 3. Button injection — after Plan Toggle button
    const planToggleBtnEnd = '(0,a.jsx)("span",{className:"hidden sm:inline",children:"T\u1eaft/B\u1eadt theo G\u00f3i"})]})'
    if (!c.includes(planToggleBtnEnd)) {
        console.log('  \u2717 Plan Toggle button anchor not found');
        return false;
    }

    const k12Button = planToggleBtnEnd + ',' +
        `(0,a.jsxs)("button",{type:"button",onClick:()=>{setK12RotOpen(true);k12RotFetch()},disabled:${aliases.busy}||k12RotLoading,` +
        'className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-teal-500/30 px-2 text-xs text-teal-600 transition-colors hover:bg-teal-500/10 dark:text-teal-400 disabled:opacity-50",' +
        'title:"Qu\u1ea3n l\u00fd ngh\u1ec9 ng\u01a1i K12",' +
        'children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"sync"}),' +
        '(0,a.jsx)("span",{className:"hidden sm:inline",children:"K12 Rotation"})]})';

    c = c.replace(planToggleBtnEnd, k12Button);

    // 4. Modal injection — before the Plan Toggle modal (or grid)
    const gridAnchor = c.includes('(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:planFilteredEZ')
        ? '(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:planFilteredEZ'
        : '(0,a.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-3",children:planFilteredEZ';
    if (!c.includes(gridAnchor)) {
        console.log('  \u2717 Grid anchor not found');
        return false;
    }

    const k12Modal =
        'k12RotOpen&&(0,a.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",' +
        'onClick:e=>{if(e.target===e.currentTarget&&!k12RotSaving)setK12RotOpen(false)},' +
        'children:(0,a.jsxs)("div",{role:"dialog","aria-modal":true,"aria-label":"K12 Rotation",' +
        'className:"w-[560px] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-xl border border-black/10 bg-surface-1 p-5 shadow-2xl dark:border-white/10",children:[' +
        // Title row
        '(0,a.jsxs)("div",{className:"flex items-center justify-between",children:[' +
        '(0,a.jsx)("h3",{className:"text-lg font-bold text-text-primary",children:"K12 Rotation — Qu\u1ea3n l\u00fd Ngh\u1ec9 ng\u01a1i"}),' +
        // Enable/Disable toggle
        '(0,a.jsx)("button",{type:"button",onClick:()=>k12RotToggle(!(k12RotStatus&&k12RotStatus.enabled)),disabled:k12RotSaving||k12RotLoading,' +
        'className:"h-7 rounded-full px-3 text-xs font-medium transition-colors "+(k12RotStatus&&k12RotStatus.enabled?"bg-teal-600 text-white hover:bg-teal-700":"bg-black/5 text-text-muted hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"),' +
        'children:k12RotStatus&&k12RotStatus.enabled?"\u2714 \u0110ang b\u1eadt":"\u25CB T\u1eaft"})]}),' +
        '(0,a.jsx)("p",{className:"mt-1 text-xs text-text-muted",children:"T\u1ef1 \u0111\u1ed9ng xoay v\u00f2ng t\u00e0i kho\u1ea3n K12: ch\u1ec9 duy tr\u00ec 10-30% active, ngh\u1ec9 ng\u01a1i sau 1h ho\u1ea1t \u0111\u1ed9ng."}),' +
        // Status bar
        'k12RotStatus&&(0,a.jsxs)("div",{className:"mt-3 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] p-3 space-y-1",children:[' +
        '(0,a.jsxs)("div",{className:"flex items-center gap-2 text-sm",children:[' +
        '(0,a.jsx)("span",{className:"font-bold text-teal-600 dark:text-teal-400",children:k12RotStatus.activeCount||0}),' +
        '(0,a.jsx)("span",{className:"text-text-muted",children:"/"}),' +
        '(0,a.jsx)("span",{className:"text-text-primary",children:k12RotStatus.totalK12||0}),' +
        '(0,a.jsx)("span",{className:"text-text-muted",children:"K12 active"}),' +
        '(0,a.jsx)("span",{className:"text-text-muted",children:"(target: "+(k12RotStatus.targetActive||0)+")"})' +
        ']}),' +
        'k12RotStatus.lastRotation&&(0,a.jsx)("p",{className:"text-xs text-text-muted",children:"L\u1ea7n rotation cu\u1ed1i: "+new Date(k12RotStatus.lastRotation).toLocaleString()})' +
        ']}),' +
        // Config section
        '(0,a.jsxs)("div",{className:"mt-4 space-y-3",children:[' +
        '(0,a.jsx)("h4",{className:"text-sm font-semibold text-text-primary",children:"C\u1ea5u h\u00ecnh"}),' +
        // Active percent
        '(0,a.jsxs)("label",{className:"flex items-center gap-3",children:[' +
        '(0,a.jsx)("span",{className:"w-28 text-xs text-text-muted",children:"% Active"}),' +
        '(0,a.jsx)("input",{type:"range",min:5,max:100,step:1,value:k12RotCfg.activePercent,onChange:e=>setK12RotCfg(p=>({...p,activePercent:Number(e.target.value)})),className:"flex-1 accent-teal-500"}),' +
        '(0,a.jsx)("span",{className:"w-10 text-right text-xs font-medium text-teal-600 dark:text-teal-400",children:k12RotCfg.activePercent+"%"})' +
        ']}),' +
        // Work duration
        '(0,a.jsxs)("label",{className:"flex items-center gap-3",children:[' +
        '(0,a.jsx)("span",{className:"w-28 text-xs text-text-muted",children:"L\u00e0m vi\u1ec7c (ph\u00fat)"}),' +
        '(0,a.jsx)("input",{type:"number",min:10,max:180,value:k12RotCfg.workMinutes,onChange:e=>setK12RotCfg(p=>({...p,workMinutes:Number(e.target.value)})),' +
        'className:"h-8 w-20 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]"})' +
        ']}),' +
        // Rest min
        '(0,a.jsxs)("label",{className:"flex items-center gap-3",children:[' +
        '(0,a.jsx)("span",{className:"w-28 text-xs text-text-muted",children:"Ngh\u1ec9 t\u1ed1i thi\u1ec3u"}),' +
        '(0,a.jsx)("input",{type:"number",min:5,max:120,value:k12RotCfg.restMinutesMin,onChange:e=>setK12RotCfg(p=>({...p,restMinutesMin:Number(e.target.value)})),' +
        'className:"h-8 w-20 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]"}),' +
        '(0,a.jsx)("span",{className:"text-xs text-text-muted",children:"ph\u00fat"})' +
        ']}),' +
        // Rest max
        '(0,a.jsxs)("label",{className:"flex items-center gap-3",children:[' +
        '(0,a.jsx)("span",{className:"w-28 text-xs text-text-muted",children:"Ngh\u1ec9 t\u1ed1i \u0111a"}),' +
        '(0,a.jsx)("input",{type:"number",min:5,max:180,value:k12RotCfg.restMinutesMax,onChange:e=>setK12RotCfg(p=>({...p,restMinutesMax:Number(e.target.value)})),' +
        'className:"h-8 w-20 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-sm text-text-primary outline-none dark:border-white/10 dark:bg-white/[0.03]"}),' +
        '(0,a.jsx)("span",{className:"text-xs text-text-muted",children:"ph\u00fat"})' +
        ']})' +
        ']}),' +
        // Account list
        'k12RotStatus&&k12RotStatus.accounts&&k12RotStatus.accounts.length>0&&(0,a.jsxs)("div",{className:"mt-4",children:[' +
        '(0,a.jsx)("h4",{className:"text-sm font-semibold text-text-primary mb-2",children:"T\u00e0i kho\u1ea3n K12 ("+k12RotStatus.accounts.length+")"}),' +
        '(0,a.jsx)("div",{className:"max-h-40 overflow-y-auto rounded-lg border border-black/5 dark:border-white/5",children:' +
        '(0,a.jsx)("table",{className:"w-full text-xs",children:(0,a.jsxs)("tbody",{children:k12RotStatus.accounts.slice(0,50).map((acc,idx)=>' +
        '(0,a.jsxs)("tr",{className:"border-b border-black/5 dark:border-white/5 last:border-0",children:[' +
        '(0,a.jsx)("td",{className:"px-2 py-1 font-mono text-text-muted",children:acc.id.slice(0,12)+"..."}),' +
        '(0,a.jsx)("td",{className:"px-2 py-1",children:(0,a.jsx)("span",{className:"inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium "+(acc.isActive?"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400":"bg-orange-500/10 text-orange-600 dark:text-orange-400"),children:acc.isActive?"Active":"Resting"})}),' +
        '(0,a.jsx)("td",{className:"px-2 py-1 text-text-muted",children:acc.isActive?(acc.minutesUntilRest!=null?acc.minutesUntilRest+"m \u2192 rest":"-"):(acc.minutesUntilEligible>0?acc.minutesUntilEligible+"m \u2192 eligible":"Ready")})' +
        ']},idx))})})})' +
        ']}),' +
        // Recent logs
        'k12RotStatus&&k12RotStatus.recentLog&&k12RotStatus.recentLog.length>0&&(0,a.jsxs)("details",{className:"mt-3",children:[' +
        '(0,a.jsx)("summary",{className:"cursor-pointer text-xs text-text-muted hover:text-text-primary",children:"Log g\u1ea7n \u0111\u00e2y"}),' +
        '(0,a.jsx)("div",{className:"mt-1 max-h-24 overflow-y-auto rounded bg-black/[0.03] dark:bg-white/[0.05] p-2 text-[10px] font-mono text-text-muted",children:k12RotStatus.recentLog.map((l,i)=>(0,a.jsx)("div",{children:l},i))})' +
        ']}),' +
        // Footer buttons
        '(0,a.jsxs)("div",{className:"mt-4 flex justify-end gap-2",children:[' +
        '(0,a.jsx)("button",{type:"button",onClick:k12RotForce,disabled:k12RotSaving||k12RotLoading||!(k12RotStatus&&k12RotStatus.enabled),' +
        'className:"h-8 rounded-lg border border-teal-500/30 px-3 text-xs text-teal-600 hover:bg-teal-500/10 dark:text-teal-400 disabled:opacity-50",children:"Force Rotation"}),' +
        '(0,a.jsx)("button",{type:"button",onClick:k12RotSaveCfg,disabled:k12RotSaving||k12RotLoading,' +
        'className:"h-8 rounded-lg bg-teal-600 px-4 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50",' +
        'children:k12RotSaving?"\u0110ang l\u01b0u...":"L\u01b0u Config"}),' +
        '(0,a.jsx)("button",{type:"button",onClick:()=>setK12RotOpen(false),disabled:k12RotSaving,' +
        'className:"h-8 rounded-lg border border-black/10 px-4 text-xs text-text-muted hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 disabled:opacity-50",children:"\u0110\u00f3ng"})' +
        ']})' +
        ']})}),'
    ;

    c = c.replace(gridAnchor, k12Modal + gridAnchor);

    fs.writeFileSync(file, c, 'utf8');
    console.log('  \u2705 Added K12 rotation dashboard UI');
    return true;
}

// ============================================================
// PATCH 12: Sidebar Toolbar on Quota Page
// ============================================================
function patchStickyToolbar() {
    console.log('[PATCH 12] Sidebar Toolbar (Client + Server)');
    
    // 1. Locate Client File
    const clientDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(clientDir)) { console.log('  ✗ Client dir not found'); return false; }
    const clientPageFile = fs.readdirSync(clientDir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!clientPageFile) { console.log('  ✗ Client file not found'); return false; }
    const clientFile = path.join(clientDir, clientPageFile);
    
    // 2. Locate Server File
    const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page.js');
    if (!fs.existsSync(serverFile)) { console.log('  ✗ Server file not found'); return false; }
    
    const filesToPatch = [
        { path: clientFile, isServer: false },
        { path: serverFile, isServer: true }
    ];
    const sidebarClass = 'className:"sticky top-16 shrink-0 w-56 self-start max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl border border-white/5 bg-[var(--surface-1,#111)] p-2 flex flex-col gap-1.5 z-30"';
    const sidebarStyle = 'style:{position:"sticky",top:"4rem",alignSelf:"flex-start",width:"14rem",maxHeight:"calc(100vh - 5rem)",overflowY:"auto",zIndex:30,background:"var(--surface-1,#111)"}';
    
    for (const f of filesToPatch) {
        let c = fs.readFileSync(f.path, 'utf8');
        
        if (c.includes('className:"flex gap-4 sidebarToolbar"')) {
            if (!c.includes(sidebarStyle)) {
                if (!c.includes(sidebarClass)) {
                    console.log(`  ✗ Existing sidebar anchor not found in ${f.isServer ? 'Server' : 'Client'}`);
                    return false;
                }
                c = c.replace(sidebarClass, `${sidebarClass},${sidebarStyle}`);
                fs.writeFileSync(f.path, c, 'utf8');
                console.log(`  ✅ Upgraded ${f.isServer ? 'Server' : 'Client'} sidebar sticky styles`);
            } else {
                console.log(`  → ${f.isServer ? 'Server' : 'Client'} already patched`);
            }
            continue;
        }
        
        const jsx = f.isServer ? 'd' : 'a';
        
        // 1. Change parent container from vertical stack to horizontal flex
        const parentAnchor = `className:"space-y-6",children:[(0,${jsx}.jsx)("div",{className:"flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end"`;
        if (!c.includes(parentAnchor)) {
            console.log(`  ✗ Parent container not found in ${f.isServer ? 'Server' : 'Client'}`);
            return false;
        }
        
        const sidebarParent = `className:"flex gap-4 sidebarToolbar",children:[(0,${jsx}.jsx)("div",{${sidebarClass},${sidebarStyle}`;
        c = c.replace(parentAnchor, sidebarParent);
        
        // 2. Convert inner flex wrapper from horizontal wrap to vertical col
        const innerFlexAnchor = 'className:"flex flex-wrap items-center gap-1.5"';
        if (!c.includes(innerFlexAnchor)) {
            console.log(`  ✗ Inner flex wrapper not found in ${f.isServer ? 'Server' : 'Client'}`);
            return false;
        }
        c = c.replace(innerFlexAnchor, 'className:"flex flex-col items-stretch gap-1.5 w-full"');
        
        // 3. Inject a flex-1 wrapper div starting after the sidebar buttons (refresh button closing)
        const refreshCloseAnchor = 'refresh"})})]})}),';
        if (!c.includes(refreshCloseAnchor)) {
            console.log(`  ✗ Refresh button closing anchor not found in ${f.isServer ? 'Server' : 'Client'}`);
            return false;
        }
        c = c.replace(refreshCloseAnchor, `refresh"})})]})}),(0,${jsx}.jsxs)("div",{className:"flex-1 min-w-0 space-y-6",children:[`);
        
        // 4. Close the flex-1 wrapper div at the end of the children array
        const closingMatches = c.match(/onClose:\(\)=>\{[A-Za-z_$][\w$]*\(!1\),[A-Za-z_$][\w$]*\(null\)\}\}\)\]\}\)/g) || [];
        if (closingMatches.length !== 1) {
            console.log(`  ✗ Closing anchor not found in ${f.isServer ? 'Server' : 'Client'}`);
            return false;
        }
        const closingAnchor = closingMatches[0];
        c = c.replace(closingAnchor, `${closingAnchor}]})`);
        
        // 5. Update grid to scale nicely inside its new layout
        const gridAnchor = 'className:"grid grid-cols-1 md:grid-cols-2 gap-3"';
        if (!c.includes(gridAnchor)) {
            console.log(`  ✗ Grid container not found in ${f.isServer ? 'Server' : 'Client'}`);
            return false;
        }
        c = c.replace(gridAnchor, 'className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"');
        
        fs.writeFileSync(f.path, c, 'utf8');
        console.log(`  ✅ Converted ${f.isServer ? 'Server' : 'Client'} toolbar to sidebar layout`);
    }
    return true;
}

// ============================================================
// PATCH 20: Quota large-list performance
// ============================================================
function patchQuotaLargeListPerformance() {
    console.log('[PATCH 20] Quota: bounded refresh and off-screen rendering');
    const quotaDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(quotaDir)) { console.log('  ✗ Quota dir not found'); return false; }
    const pageFiles = fs.readdirSync(quotaDir).filter(f => f.startsWith('page-') && f.endsWith('.js'));
    if (pageFiles.length !== 1) { console.log(`  ✗ Expected one quota chunk, found ${pageFiles.length}`); return false; }

    const file = path.join(quotaDir, pageFiles[0]);
    let c = fs.readFileSync(file, 'utf8');
    const aliases = getQuotaBundleAliases(c);
    const readyMarkers = [
        'async function __9rRunQuotaPool(e,t,r=8)',
        `__9rQuotaGeneration=(0,${aliases.react}.useRef)(0)`,
        'async(e,t,__9rBatch)=>',
        '__9rFetchQuotaBatch=',
        'for(let r=0;r<e.length;r+=24)',
        '__9rQueueQuotaCache(i.quotas)',
        `${aliases.react}.startTransition`,
        '__9rQuotaCacheTimer',
        '__9rUsageTimeout=setTimeout(',
        'signal:__9rUsageController.signal',
        `disabled:${aliases.refreshBusy}||d||b`,
        `${aliases.refreshBusySetter}(!0),${aliases.initialLoadingSetter}(!0);try{`,
        `[${aliases.refreshBusy},${aliases.fetchAccounts},__9rFetchQuotaBatch,${aliases.page}]`,
        `[${aliases.fetchAccounts},__9rFetchQuotaBatch,${aliases.page}]`,
        'style:{contentVisibility:"auto",contain:"layout paint style",containIntrinsicSize:"420px"}',
        'await __9rFetchQuotaBatch(a.filter(',
        'await __9rFetchQuotaBatch(e)',
    ];
    const badMarkers = [
        'await Promise.all(a.filter(',
        `await Promise.all(e.map(e=>${aliases.fetchQuota}(e.id,e.provider)))`,
        'let r=await fetch(`/api/usage/${e}`);',
        'disabled:d||b',
    ];
    if (readyMarkers.every(marker => c.includes(marker)) && badMarkers.every(marker => !c.includes(marker))) {
        console.log('  → Already patched');
        return true;
    }

    const replaceOne = (from, to, label) => {
        const count = c.split(from).length - 1;
        if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
        c = c.replace(from, to);
    };
    const ensure = (marker, from, to, label) => {
        if (!c.includes(marker)) replaceOne(from, to, label);
    };

    const helperAnchor = 'async function b(e,t){return await e(t)}';
    const helperCode = helperAnchor +
        'async function __9rRunQuotaPool(e,t,r=8){let a=0;await Promise.all(Array.from({length:Math.min(r,e.length)},async()=>{for(;;){let r=a++;if(r>=e.length)return;await t(e[r],r)}}))}' +
        'function __9rYield(){return new Promise(e=>setTimeout(e,0))}';
    ensure('async function __9rRunQuotaPool(e,t,r=8)', helperAnchor, helperCode, 'quota worker helper');

    if (!c.includes('__9rQuotaCacheTimer')) {
        const cacheMatch = c.match(/function f\(e,t\)\{try\{let r=g\(\);r\[e\]=\{\.\.\.t,cachedAt:new Date\(\)\.toISOString\(\)\},window\.localStorage\.setItem\(([A-Za-z_$][\w$]*),JSON\.stringify\(r\)\)\}catch\(e\)\{console\.error\("Error writing quota cache:",e\)\}\}/);
        if (!cacheMatch) throw new Error('quota cache writer: expected one semantic anchor');
        const cacheKey = cacheMatch[1];
        const newCache = `let __9rQuotaCache=null,__9rQuotaCacheTimer=null;function __9rQueueQuotaCache(e){try{let t=__9rQuotaCache||(__9rQuotaCache=g());for(let[r,a]of Object.entries(e))t[r]={...a,cachedAt:new Date().toISOString()};__9rQuotaCacheTimer||(__9rQuotaCacheTimer=setTimeout(()=>{try{window.localStorage.setItem(${cacheKey},JSON.stringify(__9rQuotaCache))}catch(e){console.error("Error writing quota cache:",e)}finally{__9rQuotaCacheTimer=null}},500))}catch(e){console.error("Error writing quota cache:",e)}}function f(e,t){__9rQueueQuotaCache({[e]:t})}`;
        c = c.replace(cacheMatch[0], newCache);
    }

    ensure(
        `__9rQuotaGeneration=(0,${aliases.react}.useRef)(0)`,
        `${aliases.generationRef}=(0,${aliases.react}.useRef)(0),${aliases.fetchAccounts}=`,
        `${aliases.generationRef}=(0,${aliases.react}.useRef)(0),__9rQuotaGeneration=(0,${aliases.react}.useRef)(0),${aliases.fetchAccounts}=`,
        'quota generation ref',
    );
    ensure(
        'async(e,t,__9rBatch)=>',
        `${aliases.fetchQuota}=(0,${aliases.react}.useCallback)(async(e,t)=>{${aliases.loadingSetter}(t=>({...t,[e]:!0})),${aliases.errorSetter}(t=>({...t,[e]:null}));try{console.log(`,
        `${aliases.fetchQuota}=(0,${aliases.react}.useCallback)(async(e,t,__9rBatch)=>{__9rBatch?(__9rBatch.loading[e]=!0,__9rBatch.errors[e]=null):(${aliases.loadingSetter}(t=>({...t,[e]:!0})),${aliases.errorSetter}(t=>({...t,[e]:null})));try{__9rBatch||console.log(`,
        'quota fetch batch signature',
    );
    ensure('__9rBatch||console.log(`[ProviderLimits] Got quota', 'console.log(`[ProviderLimits] Got quota for ${t}:`,a);', '__9rBatch||console.log(`[ProviderLimits] Got quota for ${t}:`,a);', 'quota success log');
    ensure('__9rBatch?__9rBatch.quotas[e]=r:', `${aliases.quotaSetter}(t=>({...t,[e]:r})),f(e,r);return`, `__9rBatch?__9rBatch.quotas[e]=r:(${aliases.quotaSetter}(t=>({...t,[e]:r})),f(e,r));return`, 'quota auth result');
    ensure(`__9rBatch?__9rBatch.quotas[e]=${aliases.successValue}:`, `${aliases.quotaSetter}(t=>({...t,[e]:${aliases.successValue}})),f(e,${aliases.successValue})`, `__9rBatch?__9rBatch.quotas[e]=${aliases.successValue}:(${aliases.quotaSetter}(t=>({...t,[e]:${aliases.successValue}})),f(e,${aliases.successValue}))`, 'quota success state');
    ensure('__9rBatch?__9rBatch.errors[e]=', `${aliases.errorSetter}(t=>({...t,[e]:r.message||"Failed to fetch quota"}))`, `__9rBatch?__9rBatch.errors[e]=r.message||"Failed to fetch quota":${aliases.errorSetter}(t=>({...t,[e]:r.message||"Failed to fetch quota"}))`, 'quota error state');
    ensure('__9rBatch?__9rBatch.loading[e]=!1:', `${aliases.loadingSetter}(t=>({...t,[e]:!1}))`, `__9rBatch?__9rBatch.loading[e]=!1:${aliases.loadingSetter}(t=>({...t,[e]:!1}))`, 'quota loading completion');

    const oldUsageFetch = 'let r=await fetch(`/api/usage/${e}`);';
    const timedUsageFetch = 'let __9rUsageController=new AbortController,__9rUsageTimeout=setTimeout(()=>__9rUsageController.abort(),3e4),r;try{r=await fetch(`/api/usage/${e}`,{signal:__9rUsageController.signal})}finally{clearTimeout(__9rUsageTimeout)};';
    ensure('__9rUsageTimeout=setTimeout(', oldUsageFetch, timedUsageFetch, 'quota usage timeout');

    const batchAnchor = `},[]),${aliases.afterCallback}=`;
    const batchHelper = `},[]),__9rFetchQuotaBatch=(0,${aliases.react}.useCallback)(async(e)=>{let t=++__9rQuotaGeneration.current;for(let r=0;r<e.length;r+=24){if(t!==__9rQuotaGeneration.current)return;let a=e.slice(r,r+24),i={loading:{},errors:{},quotas:{}};await __9rRunQuotaPool(a,e=>t===__9rQuotaGeneration.current?${aliases.fetchQuota}(e.id,e.provider,i):Promise.resolve());if(t!==__9rQuotaGeneration.current)return;__9rQueueQuotaCache(i.quotas);let l=()=>{${aliases.loadingSetter}(e=>({...e,...i.loading})),${aliases.errorSetter}(e=>({...e,...i.errors})),${aliases.quotaSetter}(e=>({...e,...i.quotas}))};"function"==typeof ${aliases.react}.startTransition?(0,${aliases.react}.startTransition)(l):l();await __9rYield()}},[${aliases.fetchQuota}]),${aliases.afterCallback}=`;
    ensure('__9rFetchQuotaBatch=', batchAnchor, batchHelper, 'quota batch callback');

    ensure(
        'await __9rFetchQuotaBatch(a.filter(',
        `${aliases.loadingSetter}(h(a)),${aliases.errorSetter}(e=>p(e,a)),${aliases.quotaSetter}(e=>p(e,a)),await Promise.all(a.filter(a=>e||"claude"!==a.provider||t%r==0).map(e=>${aliases.fetchQuota}(e.id,e.provider)))`,
        `${aliases.errorSetter}(e=>p(e,a)),${aliases.quotaSetter}(e=>p(e,a)),await __9rFetchQuotaBatch(a.filter(a=>e||"claude"!==a.provider||t%r==0))`,
        'quota full refresh',
    );
    ensure(
        'await __9rFetchQuotaBatch(e)',
        `${aliases.loadingSetter}(h(e)),${aliases.errorSetter}(t=>p(t,e)),${aliases.quotaSetter}(t=>p(t,e)),await Promise.all(e.map(e=>${aliases.fetchQuota}(e.id,e.provider)))`,
        `${aliases.errorSetter}(t=>p(t,e)),${aliases.quotaSetter}(t=>p(t,e)),await __9rFetchQuotaBatch(e)`,
        'quota initial refresh',
    );
    ensure(
        'style:{contentVisibility:"auto",contain:"layout paint style",containIntrinsicSize:"420px"}',
        `${aliases.cardComponent}.default,{padding:"none",className:`,
        `${aliases.cardComponent}.default,{padding:"none",style:{contentVisibility:"auto",contain:"layout paint style",containIntrinsicSize:"420px"},className:`,
        'quota card containment',
    );

    if (!c.includes(`disabled:${aliases.refreshBusy}||d||b`)) {
        const disabledCount = c.split('disabled:d||b').length - 1;
        if (disabledCount !== 2) throw new Error(`quota card refresh guards: expected two anchors, found ${disabledCount}`);
        c = c.split('disabled:d||b').join(`disabled:${aliases.refreshBusy}||d||b`);
    }
    ensure(
        `[${aliases.refreshBusy},${aliases.fetchAccounts},__9rFetchQuotaBatch,${aliases.page}]`,
        `},[${aliases.refreshBusy},${aliases.fetchAccounts},${aliases.fetchQuota},${aliases.page}]);(0,${aliases.react}.useEffect)`,
        `},[${aliases.refreshBusy},${aliases.fetchAccounts},__9rFetchQuotaBatch,${aliases.page}]);(0,${aliases.react}.useEffect)`,
        'quota refresh dependencies',
    );
    const oldInitialEffect = `(0,${aliases.react}.useEffect)(()=>{(async()=>{${aliases.initialLoadingSetter}(!0);let e=await ${aliases.fetchAccounts}(${aliases.page});${aliases.initialLoadingSetter}(!1),${aliases.errorSetter}(t=>p(t,e)),${aliases.quotaSetter}(t=>p(t,e)),await __9rFetchQuotaBatch(e),${aliases.lastRefreshSetter}(new Date)})()},[${aliases.fetchAccounts},${aliases.fetchQuota},${aliases.page}])`;
    const guardedInitialEffect = `(0,${aliases.react}.useEffect)(()=>{(async()=>{${aliases.refreshBusySetter}(!0),${aliases.initialLoadingSetter}(!0);try{let e=await ${aliases.fetchAccounts}(${aliases.page});${aliases.initialLoadingSetter}(!1),${aliases.errorSetter}(t=>p(t,e)),${aliases.quotaSetter}(t=>p(t,e)),await __9rFetchQuotaBatch(e),${aliases.lastRefreshSetter}(new Date)}finally{${aliases.refreshBusySetter}(!1)}})()},[${aliases.fetchAccounts},__9rFetchQuotaBatch,${aliases.page}])`;
    ensure(`${aliases.refreshBusySetter}(!0),${aliases.initialLoadingSetter}(!0);try{`, oldInitialEffect, guardedInitialEffect, 'quota initial refresh guard');

    if (!readyMarkers.every(marker => c.includes(marker)) || badMarkers.some(marker => c.includes(marker))) {
        console.log('  ✗ Large-list performance validation failed');
        return false;
    }
    fs.writeFileSync(file, c, 'utf8');
    console.log('  ✅ Limited quota refresh to 8 requests and 24-account render batches');
    return true;
}

// ============================================================
// PATCH 13: Responsive Quota Card Header
// ============================================================
function patchResponsiveCardHeader() {
    console.log('[PATCH 13] Responsive Card Header (Client + Server)');
    
    // 1. Locate Client File
    const clientDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(clientDir)) { console.log('  ✗ Client dir not found'); return false; }
    const clientPageFile = fs.readdirSync(clientDir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!clientPageFile) { console.log('  ✗ Client file not found'); return false; }
    const clientFile = path.join(clientDir, clientPageFile);
    
    // 2. Locate Server File
    const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page.js');
    if (!fs.existsSync(serverFile)) { console.log('  ✗ Server file not found'); return false; }
    
    const filesToPatch = [
        { path: clientFile, isServer: false },
        { path: serverFile, isServer: true }
    ];
    
    for (const f of filesToPatch) {
        let c = fs.readFileSync(f.path, 'utf8');
        
        if (c.includes('responsiveCardHeader')) {
            console.log(`  → ${f.isServer ? 'Server' : 'Client'} already patched`);
            continue;
        }
        
        const jsx = f.isServer ? 'd' : 'a';
        
        // 1. Change card header layout to stack vertically on small widths and horizontally on xl screens
        const headerLayoutAnchor = `children:(0,${jsx}.jsxs)("div",{className:"flex items-center justify-between gap-2",children:[(0,${jsx}.jsxs)("div",{className:"flex items-center gap-2 min-w-0"`;
        if (!c.includes(headerLayoutAnchor)) {
            console.log(`  ✗ Header layout anchor not found in ${f.isServer ? 'Server' : 'Client'}`);
            return false;
        }
        
        const responsiveHeader = `children:(0,${jsx}.jsxs)("div",{className:"flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between responsiveCardHeader",children:[(0,${jsx}.jsxs)("div",{className:"flex items-center gap-2 min-w-0"`;
        c = c.replace(headerLayoutAnchor, responsiveHeader);
        
        // 2. Make buttons wrap and align correctly when stacked
        const buttonsAnchor = 'className:"flex items-center gap-1 shrink-0"';
        if (!c.includes(buttonsAnchor)) {
            console.log(`  ✗ Buttons anchor not found in ${f.isServer ? 'Server' : 'Client'}`);
            return false;
        }
        c = c.replace(buttonsAnchor, 'className:"flex items-center gap-1.5 shrink-0 flex-wrap justify-start xl:justify-end w-full xl:w-auto"');
        
        fs.writeFileSync(f.path, c, 'utf8');
        console.log(`  ✅ Made ${f.isServer ? 'Server' : 'Client'} quota card headers responsive`);
    }
    return true;
}

// ============================================================
// PATCH 26: Quota Card Email Masking
// ============================================================
function patchQuotaCardEmailMasking() {
    console.log('[PATCH 26] Quota Card Email Masking');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  \u2717 Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  \u2717 File not found'); return false; }

    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');

    if (c.includes('__9rMaskEmail')) {
        console.log('  \u2192 Already patched');
        return true;
    }

    const xPattern = /function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{return \2\.name\?\.trim\(\)\|\|\2\.email\?\.trim\(\)\|\|\2\.displayName\?\.trim\(\)\|\|null\}/;
    const matchX = c.match(xPattern);
    if (!matchX) {
        console.log('  \u2717 Name getter getter x(e) not found');
        return false;
    }

    const dPattern = /function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{return \2\.name\?\.trim\(\)&&\2\.email\?\.trim\(\)&&\2\.name\.trim\(\)!==\2\.email\.trim\(\)\?\2\.email\.trim\(\):\2\.name\?\.trim\(\)&&\2\.displayName\?\.trim\(\)&&\2\.name\.trim\(\)!==\2\.displayName\.trim\(\)\?\2\.displayName\.trim\(\):null\}/;
    const matchD = c.match(dPattern);

    const maskFn = 'var __9rMaskEmail=function(s){if(!s||typeof s!=="string")return s;var at=s.indexOf("@");if(at<0)return s;var u=s.substring(0,at),d=s.substring(at+1);var uM=u.length<=3?u:u.substring(0,3)+"***"+u.substring(u.length-2);var parts=d.split(".");var dN=parts[0]||"",dExt=parts.slice(1).join(".");var dM=dN.length<=2?dN+"***":dN.substring(0,Math.min(2,dN.length))+"***";return uM+"@"+dM+(dExt?"."+dExt:"")};';

    const newX = maskFn + 'function ' + matchX[1] + '(' + matchX[2] + '){return __9rMaskEmail(' + matchX[2] + '.name?.trim()||' + matchX[2] + '.email?.trim()||' + matchX[2] + '.displayName?.trim()||null)}';

    c = c.replace(matchX[0], newX);

    if (matchD) {
        const newD = 'function ' + matchD[1] + '(' + matchD[2] + '){return __9rMaskEmail(' + matchD[2] + '.name?.trim()&&' + matchD[2] + '.email?.trim()&&' + matchD[2] + '.name.trim()!==' + matchD[2] + '.email.trim()?' + matchD[2] + '.email.trim():' + matchD[2] + '.name?.trim()&&' + matchD[2] + '.displayName?.trim()&&' + matchD[2] + '.name.trim()!==' + matchD[2] + '.displayName.trim()?' + matchD[2] + '.displayName.trim():null)}';
        c = c.replace(matchD[0], newD);
    }

    fs.writeFileSync(file, c, 'utf8');
    console.log('  \u2705 Masked card email/name displays on Quota page');
    return true;
}

// ============================================================
// PATCH 14: Quota hydration boundary
// ============================================================
function patchQuotaHydrationBoundary() {
    console.log('[PATCH 14] Quota hydration boundary');

    const clientDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(clientDir)) { console.log('  ✗ Client dir not found'); return false; }
    const pageFiles = fs.readdirSync(clientDir).filter(f => f.startsWith('page-') && f.endsWith('.js'));
    if (pageFiles.length !== 1) {
        console.log(`  ✗ Expected one quota chunk, found ${pageFiles.length}`);
        return false;
    }

    const clientFile = path.join(clientDir, pageFiles[0]);
    const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page.js');
    const manifestFile = path.join(BUILD, 'prerender-manifest.json');
    if (!fs.existsSync(serverFile)) { console.log('  ✗ Server quota page not found'); return false; }
    if (!fs.existsSync(manifestFile)) { console.log('  ✗ Prerender manifest not found'); return false; }

    const hydrationState = '__9rHydrated';
    const hydrationSetter = '__9rSetHydrated';
    const patchBundle = (content, label) => {
        const hasState = content.includes(hydrationState);
        const hasGate = content.includes(`if(!${hydrationState})return null;`);
        if (hasState || hasGate) {
            if (hasState && hasGate) return content;
            throw new Error(`${label} has a partial hydration patch`);
        }

        const componentStart = /function ([A-Za-z_$][\w$]*)\(\)\{let\{copied:[^}]+\}=\(0,[A-Za-z_$][\w$]*\.C\)\(\),\[[^\]]+\]=\(0,([A-Za-z_$][\w$]*)\.useState\)\(/;
        const match = content.match(componentStart);
        if (!match) throw new Error(`${label} component start not found`);

        const functionToken = `function ${match[1]}(){`;
        const functionIndex = match.index;
        const stateIndex = functionIndex + functionToken.length;
        const statePatch = `let[${hydrationState},${hydrationSetter}]=(0,${match[2]}.useState)(!1);` +
            `(0,${match[2]}.useEffect)(()=>${hydrationSetter}(!0),[]);`;
        let updated = `${content.slice(0, stateIndex)}${statePatch}${content.slice(stateIndex)}`;

        const componentBodyStart = stateIndex + statePatch.length;
        const toolbarIndex = updated.lastIndexOf('sidebarToolbar');
        if (toolbarIndex < componentBodyStart) throw new Error(`${label} final toolbar render not found`);
        const returnIndex = toolbarIndex < 0 ? -1 : updated.lastIndexOf(';return ', toolbarIndex);
        if (returnIndex < componentBodyStart) throw new Error(`${label} final render return not found`);
        updated = `${updated.slice(0, returnIndex)};if(!${hydrationState})return null${updated.slice(returnIndex)}`;

        if (!updated.includes(statePatch) || !updated.includes(`if(!${hydrationState})return null;return `)) {
            throw new Error(`${label} hydration patch validation failed`);
        }
        return updated;
    };

    const originals = new Map([
        [clientFile, fs.readFileSync(clientFile, 'utf8')],
        [serverFile, fs.readFileSync(serverFile, 'utf8')],
        [manifestFile, fs.readFileSync(manifestFile, 'utf8')],
    ]);

    try {
        const client = patchBundle(originals.get(clientFile), 'Client quota bundle');
        const server = patchBundle(originals.get(serverFile), 'Server quota bundle');
        const manifest = JSON.parse(originals.get(manifestFile));
        if (!manifest.routes || typeof manifest.routes !== 'object') {
            throw new Error('Prerender manifest routes are missing');
        }
        delete manifest.routes['/dashboard/quota'];

        fs.writeFileSync(clientFile, client, 'utf8');
        fs.writeFileSync(serverFile, server, 'utf8');
        fs.writeFileSync(manifestFile, JSON.stringify(manifest), 'utf8');
        if (!patchQuotaChunkCacheKey()) throw new Error('Quota cache key update failed');
    } catch (error) {
        for (const [file, content] of originals) {
            try { fs.writeFileSync(file, content, 'utf8'); } catch {}
        }
        console.log(`  ✗ Hydration boundary failed: ${error.message}`);
        return false;
    }

    console.log('  ✅ Deferred quota rendering until client hydration and disabled quota prerendering');
    return true;
}

// ============================================================
// PATCH 17: Disable API background services in dashboard role
// ============================================================
function patchDashboardRoleIsolation() {
    console.log('[PATCH 17] Dashboard role isolation');

    const chunksDir = path.join(BUILD, 'server/chunks');
    if (!fs.existsSync(chunksDir)) { console.log('  ✗ Server chunks dir not found'); return false; }
    const candidates = fs.readdirSync(chunksDir)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(chunksDir, file))
        .filter(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('[Bootstrap] init failed:') &&
                content.includes('[ServerInit] Error initializing outbound proxy:') &&
                content.includes('global.__appBootstrapped');
        });
    if (candidates.length !== 1) {
        console.log(`  ✗ Expected one bootstrap chunk, found ${candidates.length}`);
        return false;
    }

    const file = candidates[0];
    let content = fs.readFileSync(file, 'utf8');
    const roleCount = (content.match(/NINE_ROUTER_ROLE/g) || []).length;
    if (roleCount) {
        if (roleCount === 2 &&
            content.includes('"dashboard"!==process.env.NINE_ROUTER_ROLE&&setImmediate') &&
            (content.includes('if("dashboard"===process.env.NINE_ROUTER_ROLE)return void b();') ||
                content.includes('"dashboard"===process.env.NINE_ROUTER_ROLE||"phase-production-build"'))) {
            console.log('  → Dashboard role guards already present');
            return true;
        }
        console.log('  ✗ Partial dashboard role isolation patch found');
        return false;
    }

    const legacyBootstrap = 'c.a(a,async(a,b)=>{try{var d=c(94123),e=a([d]);';
    const legacyBootstrapPatched = 'c.a(a,async(a,b)=>{try{if("dashboard"===process.env.NINE_ROUTER_ROLE)return void b();var d=c(94123),e=a([d]);';
    if (content.includes(legacyBootstrap)) {
        const outboundAnchor = 'setImmediate(()=>{g().catch(console.log)})';
        if (!content.includes(outboundAnchor)) { console.log('  ✗ Dashboard outbound anchor not found'); return false; }
        content = content.replace(legacyBootstrap, legacyBootstrapPatched)
            .replace(outboundAnchor, '"dashboard"!==process.env.NINE_ROUTER_ROLE&&setImmediate(()=>{g().catch(console.log)})');
    } else {
        const bootstrapMatch = content.match(/"phase-production-build"===process\.env\.NEXT_PHASE\|\|"phase-export"===process\.env\.NEXT_PHASE\|\|"phase-static"===process\.env\.NEXT_PHASE\|\|global\.__appBootstrapped\|\|\(global\.__appBootstrapped=!0,[^;]+?console\.error\("\[Bootstrap\] init failed:",[A-Za-z_$][\w$]*\.message\)\)\)/);
        const outboundMatch = content.match(/setImmediate\(\(\)=>\{([A-Za-z_$][\w$]*)\(\)\.catch\(console\.log\)\}\)/);
        if (!bootstrapMatch || !outboundMatch) {
            console.log('  ✗ Dashboard bootstrap anchors not found');
            return false;
        }
        content = content.replace(bootstrapMatch[0], `"dashboard"===process.env.NINE_ROUTER_ROLE||${bootstrapMatch[0]}`)
            .replace(outboundMatch[0], `"dashboard"!==process.env.NINE_ROUTER_ROLE&&${outboundMatch[0]}`);
    }
    if ((content.match(/NINE_ROUTER_ROLE/g) || []).length !== 2) {
        console.log('  ✗ Dashboard role isolation validation failed');
        return false;
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log(`  ✅ Disabled bootstrap services and outbound proxy in ${path.basename(file)}`);
    return true;
}

// ============================================================
// PATCH 16: Quota client chunk cache key
// ============================================================
function patchQuotaChunkCacheKey() {
    console.log('[PATCH 16] Quota client cache key');

    const clientDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(clientDir)) { console.log('  ✗ Client dir not found'); return false; }

    const pageFiles = fs.readdirSync(clientDir).filter(f => f.startsWith('page-') && f.endsWith('.js'));
    if (pageFiles.length !== 1) {
        console.log(`  ✗ Expected one quota chunk, found ${pageFiles.length}`);
        return false;
    }

    const pageName = pageFiles[0];
    const pageFile = path.join(clientDir, pageName);
    const content = fs.readFileSync(pageFile);
    const contentHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const chunkRef = `static/chunks/app/(dashboard)/dashboard/quota/${pageName}`;
    const versionedRef = `${chunkRef}?v=${contentHash}`;
    const escapedRef = chunkRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const chunkRefPattern = new RegExp(`${escapedRef}(?:\\?v=[a-f0-9]{16})?`, 'g');
    const textExtensions = new Set(['.html', '.js', '.json', '.meta', '.rsc', '.txt']);
    const references = [];
    const referenceRoots = [
        path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page_client-reference-manifest.js'),
        path.join(BUILD, 'server/app/dashboard/quota.html'),
        path.join(BUILD, 'server/app/dashboard/quota.rsc'),
        path.join(BUILD, 'server/app/dashboard/quota.segments'),
    ];

    const scan = target => {
        if (!fs.existsSync(target)) return;
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
                const fullPath = path.join(target, entry.name);
                scan(fullPath);
            }
            return;
        }
        if (!textExtensions.has(path.extname(target))) return;
        const fileContent = fs.readFileSync(target, 'utf8');
        chunkRefPattern.lastIndex = 0;
        if (chunkRefPattern.test(fileContent)) references.push({ path: target, content: fileContent });
    };
    for (const referenceRoot of referenceRoots) scan(referenceRoot);

    if (references.length === 0) {
        console.log('  ✗ Quota chunk references not found');
        return false;
    }

    const written = [];
    try {
        for (const reference of references) {
            chunkRefPattern.lastIndex = 0;
            const updatedContent = reference.content.replace(chunkRefPattern, versionedRef);
            fs.writeFileSync(reference.path, updatedContent, 'utf8');
            written.push(reference);
        }
    } catch (error) {
        for (const reference of written) fs.writeFileSync(reference.path, reference.content, 'utf8');
        console.log(`  ✗ Cache key update failed: ${error.message}`);
        return false;
    }

    console.log(`  ✅ Versioned ${pageName} with ${contentHash} in ${references.length} references`);
    return true;
}

// ============================================================
// SAFETY: Restore the default SSR child unless experimental mode is requested
// ============================================================
function restoreServerSsrBypass() {
    console.log('[SAFETY] Restore Quota SSR child');
    const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page.js');
    if (!fs.existsSync(serverFile)) { console.log('  ✗ Server file not found'); return false; }
    let c = fs.readFileSync(serverFile, 'utf8');
    const suspenseAnchor = 'fallback:(0,d.jsx)(f.CardSkeleton,{}),';
    const enabledState = `${suspenseAnchor}children:(0,d.jsx)(g.default,{})})`;
    const bypassState = `${suspenseAnchor}children:null})`;
    if (c.includes(enabledState)) {
        console.log('  → Upstream SSR child is enabled');
        return true;
    }
    if (!c.includes(bypassState)) {
        console.log('  ✗ SSR child state not recognized');
        return false;
    }
    c = c.replace(bypassState, enabledState);
    fs.writeFileSync(serverFile, c, 'utf8');
    console.log('  ✅ Removed the experimental SSR bypass');
    return true;
}

// ============================================================
// PATCH 15: Experimental bypass for Quota Page SSR
// ============================================================
function patchServerSsrBypass() {
    console.log('[PATCH 15] Bypass SSR for Quota Page');
    const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/quota/page.js');
    if (!fs.existsSync(serverFile)) { console.log('  ✗ Server file not found'); return false; }
    let c = fs.readFileSync(serverFile, 'utf8');
    const suspenseAnchor = 'fallback:(0,d.jsx)(f.CardSkeleton,{}),';
    const enabledState = `${suspenseAnchor}children:(0,d.jsx)(g.default,{})})`;
    const bypassState = `${suspenseAnchor}children:null})`;
    if (c.includes(bypassState)) {
        console.log('  → Experimental SSR bypass already present');
        return true;
    }
    if (!c.includes(enabledState)) {
        console.log('  ✗ SSR target not found');
        return false;
    }
    c = c.replace(enabledState, bypassState);
    fs.writeFileSync(serverFile, c, 'utf8');
    console.log('  ✅ Experimental SSR child bypass applied');
    return true;
}

// ============================================================
// RUN
// ============================================================
const PATCH_DEFINITIONS = [
    { id: 0, name: 'SSR Restore', scope: 'dashboard', targets: ['server/app/(dashboard)/dashboard/quota/page.js'], run: restoreServerSsrBypass },
    { id: 1, name: 'Bulk Import', scope: 'api', targets: ['server/app/api/oauth/codex/bulk-import/route.js'], run: patchBulkImport },
    { id: 18, name: 'API UI Redirect', scope: 'api', targets: ['custom-server.js'], run: patchApiDashboardRedirect },
    { id: 24, name: 'K12 Engine', scope: 'api', targets: ['custom-server.js'], run: patchK12RotationEngine },
    { id: 2, name: 'Providers', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/providers/page-*.js'], run: patchProvidersPage },
    { id: 3, name: 'Quota', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'server/app/(dashboard)/dashboard/quota/page.js'], run: patchQuotaPage },
    { id: 19, name: 'Quota Pagination', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'server/app/(dashboard)/dashboard/quota/page.js'], run: patchQuotaPaginationNormalization },
    { id: 4, name: 'AutoPing', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/providers/[id]/page-*.js'], run: patchAutoPingEnable },
    { id: 5, name: 'Quota Bulk', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPageBulk },
    { id: 6, name: 'Detail Bulk', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/providers/[id]/page-*.js'], run: patchDetailPageBulk },
    { id: 7, name: 'Weekly Filter', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPageWeeklyFilter },
    { id: 22, name: 'Session Filter', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPageSessionFilter },
    { id: 8, name: 'Plan Badge', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPlanBadge },
    { id: 9, name: 'Plan Filter', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPlanFilter },
    { id: 10, name: 'Reset Time', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaResetTime },
    { id: 11, name: 'Priority', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchBulkPriorityReassign },
    { id: 21, name: 'Smart Priority', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchSmartPrioritySort },
    { id: 23, name: 'Plan Toggle', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchBulkToggleByPlan },
    { id: 25, name: 'K12 Dashboard', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchK12RotationDashboard },
    { id: 26, name: 'Card Masking', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaCardEmailMasking },
    { id: 12, name: 'Sticky Bar', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'server/app/(dashboard)/dashboard/quota/page.js'], run: patchStickyToolbar },
    { id: 13, name: 'Responsive', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'server/app/(dashboard)/dashboard/quota/page.js'], run: patchResponsiveCardHeader },
    { id: 20, name: 'Quota Performance', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaLargeListPerformance },
    { id: 14, name: 'Hydration', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'server/app/(dashboard)/dashboard/quota/page.js', 'prerender-manifest.json'], run: patchQuotaHydrationBoundary },
    { id: 16, name: 'Cache Key', scope: 'dashboard', targets: ['server/app/dashboard/quota.html', 'server/app/dashboard/quota.rsc', 'server/app/dashboard/quota.segments/**', 'server/app/(dashboard)/dashboard/quota/page_client-reference-manifest.js'], run: patchQuotaChunkCacheKey },
    { id: 17, name: 'Dashboard Role', scope: 'dashboard', targets: ['server/chunks/*.js'], run: patchDashboardRoleIsolation },
    { id: 15, name: 'SSR Bypass', scope: 'dashboard', targets: ['server/app/(dashboard)/dashboard/quota/page.js'], experimental: true, run: patchServerSsrBypass },
];

if (requestedScopeHash) {
    if (!['api', 'dashboard'].includes(requestedScopeHash)) {
        console.error(`Invalid --scope-hash value: ${requestedScopeHash}`);
        process.exitCode = 1;
    } else {
        const payload = PATCH_DEFINITIONS
            .filter(definition => definition.scope === requestedScopeHash && !definition.experimental)
            .map(definition => JSON.stringify({
                id: definition.id,
                name: definition.name,
                scope: definition.scope,
                targets: definition.targets,
            }) + '\n' + definition.run.toString())
            .join('\n---\n');
        console.log(crypto.createHash('sha256').update(payload).digest('hex').toUpperCase());
    }
} else if (listTargets) {
    console.log(JSON.stringify(PATCH_DEFINITIONS.map(({ run, ...definition }) => definition), null, 2));
} else {
    if (!['all', 'api', 'dashboard'].includes(requestedScope)) {
        console.error(`Invalid --scope value: ${requestedScope}`);
        process.exitCode = 1;
    } else {
        const ver = JSON.parse(fs.readFileSync(path.join(BASE, '..', 'package.json'), 'utf8')).version;
        console.log('=== 9router Patch Script ===');
        console.log(`Version: ${ver}`);
        console.log(`App root: ${BASE}`);
        console.log(`Scope: ${requestedScope}${includeExperimental ? ' + experimental' : ''}\n`);

        const results = [];
        for (const definition of PATCH_DEFINITIONS) {
            const inScope = requestedScope === 'all' || definition.scope === requestedScope;
            const enabled = inScope && (!definition.experimental || includeExperimental);
            if (!enabled) {
                results.push({ ...definition, skipped: true, ok: true });
                continue;
            }

            let ok = false;
            try {
                ok = definition.run();
            } catch (error) {
                console.log(`  ✗ Unhandled patch error: ${error.message}`);
            }
            results.push({ ...definition, ok: Boolean(ok), skipped: false });
        }

        console.log('\n=== DONE ===');
        for (const result of results) {
            const status = result.skipped ? 'SKIPPED' : result.ok ? 'OK' : 'FAILED';
            console.log(`Patch ${String(result.id).padEnd(2)} ${result.name.padEnd(14)}: ${status}`);
        }

        const failed = results.filter(result => !result.skipped && !result.ok);
        if (failed.length > 0) process.exitCode = 1;
        console.log('\nPatches are loaded on the next controlled 9router start.');
    }
}
