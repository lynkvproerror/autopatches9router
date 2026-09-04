// ============================================================
// 9router Patch Script (Node.js)
// Usage: node apply-patches.js --app-root <prepared-app-root> --scope <dashboard|api|all>
// Re-apply all custom patches after npm update
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { INJECTED_TIER_MARKERS, removeInjectedTierFilters } = require('./default-account-routing');
const {
    getModernProviderDetailAnchors,
    getPatchedProviderDetailTarget,
    isModernProviderAutoPingPatched,
    isProviderDetailBulkPatched,
} = require('./provider-detail-patch');
const { getUpdateModalScript } = require('./update-manager-patch');

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
        if (content.includes('[_,I]=(0,i.useState)({})')) {
            // v0.5.59+ layout: [_,I] is [quotaMap, quotaSetter], eG is fetchAccounts, eV is fetchQuota, eW is generationRef
            return {
                react: 'i', list: 'e8', quotaMap: '_', quotaSetter: 'I', loadingSetter: 'L', errorSetter: 'R',
                busy: 'eD', busySetter: 'eT', fetchAccounts: 'eG', fetchQuota: 'eV', page: 'eM', pageSetter: 'eO',
                toggle: 'e9', emptyPredicate: 'e6', statusFilter: 'ef', bulkLabel: 'e7', displayName: 'D',
                sortDeps: '[r,_,e$,ef,eN]', refreshBusy: 'Q', refreshBusySetter: 'Y', initialLoadingSetter: 'et',
                countdownSetter: 'Z', refreshCallback: 'e1', generationRef: 'eW', afterCallback: 'eB',
                cardComponent: 'C', successValue: 'l', emptyFlag: 'tt', lastRefreshSetter: 'G',
            };
        }
        // v0.5.45/v0.5.50/v0.5.55 layout: [I,_] is [quotaMap, quotaSetter]
        const loadingSetter = (content.includes('eB=(0,i.useCallback)(async(e,t)=>{L(t=>') || content.includes('eB=(0,i.useCallback)(async(e,t,{force:r=!1}={})=>{L(t=>')) ? 'L' : 'z';
        return {
            react: 'i', list: 'e8', quotaMap: 'I', quotaSetter: '_', loadingSetter, errorSetter: 'R',
            busy: 'eD', busySetter: 'eT', fetchAccounts: 'eV', fetchQuota: 'eB', page: 'eM', pageSetter: 'eO',
            toggle: 'e9', emptyPredicate: 'e6', statusFilter: 'ef', bulkLabel: 'e7', displayName: 'D',
            sortDeps: '[r,I,e$,ef,eN]', refreshBusy: 'Q', refreshBusySetter: 'Y', initialLoadingSetter: 'et',
            countdownSetter: 'Z', refreshCallback: 'e1', generationRef: 'eG', afterCallback: 'eW',
            cardComponent: 'C', successValue: 'l', emptyFlag: 'tt', lastRefreshSetter: 'V',
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
    const ssoMarker = '/*__9router_chrome_sso_v2__*/';
    const normalizerMarker = '/*__9router_bulk_import_normalizer_v3__*/';
    const commaTarget = ',!Array.isArray(c)||0===c.length)return e.NextResponse.json({error:"No accounts provided"},{status:400});let d=[],h=0,i=0;';
    const stmtTarget = 'if(!Array.isArray(c)||0===c.length)return e.NextResponse.json({error:"No accounts provided"},{status:400});let d=[],h=0,i=0;';
    
    const ssoDispatch = '/*__9router_chrome_sso_v2__*/const _getSso=()=>{const fs=require("fs"),cands=["D:/Music/Ruby/Produce for Customer/Tools/9router-patches/chrome-sso-service.js","d:/Music/Ruby/Produce for Customer/Tools/9router-patches/chrome-sso-service.js",require("path").join(process.env.USERPROFILE||"","Music/Ruby/Produce for Customer/Tools/9router-patches/chrome-sso-service.js")];for(const p of cands){if(fs.existsSync(p))return require(p)}return require("D:/Music/Ruby/Produce for Customer/Tools/9router-patches/chrome-sso-service.js")};if(b&&b.action==="get_status"){try{const sso=_getSso();return e.NextResponse.json(sso.getUnifiedAccountStats())}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="get_logs"){try{const sso=_getSso();return e.NextResponse.json(sso.getAutoLoginLogs(b.lineCount||100))}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="auto_detect"){try{const sso=_getSso();const res=await sso.runLiveAutoDetectAndReactivate();return e.NextResponse.json(res)}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="launch_runner"){try{const sso=_getSso();const res=sso.launchAutoLoginRunner(b.mode);return e.NextResponse.json(res)}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="list_chrome_profiles"){try{const sso=_getSso();return e.NextResponse.json(sso.getChromeProfilesWith9RouterStatus())}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="sso_login"){try{const sso=_getSso();const ssoRes=await sso.loginCodexWithChromeProfile({profileDir:b.profileDir,email:b.email,timeoutMs:60000});return e.NextResponse.json(ssoRes)}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="check_update"){try{const sso=_getSso();const res=await sso.checkUpdate();return e.NextResponse.json(res)}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="start_update"){try{const sso=_getSso();const res=sso.triggerUpdate(b.targetVersion);return e.NextResponse.json(res)}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="get_update_progress"){try{const sso=_getSso();return e.NextResponse.json(sso.getUpdateProgress(b.lineCount||80))}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="get_update_config"){try{const sso=_getSso();return e.NextResponse.json(sso.getUpdateConfig())}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}if(b&&b.action==="save_update_config"){try{const sso=_getSso();return e.NextResponse.json(sso.saveUpdateConfig(b.config||{}))}catch(err){return e.NextResponse.json({success:false,error:err.message},{status:500})}}';
    const normalizerExpr =
        'Array.isArray(c)&&(c=c.map(function(item){' +
        'if(!item||"object"!=typeof item||Array.isArray(item))return item;' +
        'var meta=item._meta||{};' +
        'if(item.tokens&&item.tokens.access_token&&!item.accessToken){' +
        'var tk=item.tokens;return{' +
        'accessToken:tk.access_token||"",' +
        'refreshToken:tk.refresh_token||tk.refreshToken||item.refresh_token||item.refreshToken||void 0,' +
        'idToken:tk.id_token||tk.idToken||item.id_token||item.idToken||void 0,' +
        'email:item.email||tk.email||meta.email||"",' +
        'expiresAt:item.expires_at||item.expiresAt||void 0,' +
        'lastRefreshAt:item.last_refresh||item.lastRefreshAt||void 0,' +
        'providerSpecificData:{chatgptAccountId:tk.account_id||item.account_id||"",' +
        'chatgptPlanType:meta.plan_type||item.plan_type||item.chatgpt_plan_type||""}}}' +
        'if(item.credentials&&item.credentials.access_token&&!item.accessToken){' +
        'var cr=item.credentials,ex=item.extra||{};return{' +
        'accessToken:cr.access_token||"",' +
        'refreshToken:cr.refresh_token||void 0,' +
        'idToken:cr.id_token||cr.idToken||void 0,' +
        'email:cr.email||ex.email||meta.email||"",' +
        'expiresAt:cr.expires_at||cr.expiresAt||void 0,' +
        'lastRefreshAt:cr.last_refresh||cr.lastRefreshAt||void 0,' +
        'providerSpecificData:{chatgptAccountId:ex.source_target_id||cr.chatgpt_account_id||cr.account_id||"",' +
        'chatgptPlanType:cr.plan_type||cr.chatgpt_plan_type||meta.plan_type||item.plan_type||""}}}' +
        'if(item.access_token&&!item.accessToken){return{' +
        'accessToken:item.access_token||"",' +
        'refreshToken:item.refresh_token||item.refreshToken||void 0,' +
        'idToken:item.id_token||item.idToken||void 0,' +
        'email:item.email||meta.email||"",' +
        'expiresAt:item.expires_at||item.expiresAt||void 0,' +
        'lastRefreshAt:item.last_refresh||item.lastRefreshAt||void 0,' +
        'providerSpecificData:item.providerSpecificData||{chatgptAccountId:item.chatgpt_account_id||item.account_id||"",' +
        'chatgptPlanType:item.chatgpt_plan_type||meta.plan_type||item.plan_type||""}}}' +
        'if(!item.accessToken&&item.token)return{' +
        'accessToken:item.token||"",' +
        'refreshToken:item.refresh_token||item.refreshToken||void 0,' +
        'idToken:item.id_token||item.idToken||void 0,' +
        'email:item.email||meta.email||"",' +
        'expiresAt:item.expiresAt||item.expires_at||void 0,' +
        'lastRefreshAt:item.last_refresh||item.lastRefreshAt||void 0,' +
        'providerSpecificData:item.providerSpecificData||{}};' +
        'return item}))/*__9router_bulk_import_normalizer_v3__*/';

    // Inject SSO handler after JSON parse error handling
    const jsonCatchTarget = 'catch(a){return e.NextResponse.json({error:`Invalid JSON body: ${a.message}`},{status:400})}';
    if (c.includes(jsonCatchTarget) && !c.includes('/*__9router_chrome_sso_v1__*/')) {
        c = c.replace(jsonCatchTarget, jsonCatchTarget + ssoDispatch);
    }

    // v0.5.45 pattern: inject as comma expression inside if()
    if (c.includes(commaTarget)) {
        c = c.replace(commaTarget, ',' + normalizerExpr + ',!Array.isArray(c)||0===c.length)return e.NextResponse.json({error:"No accounts provided"},{status:400});let d=[],h=0,i=0;');
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Patched: v3 credential normalizer + Chrome SSO dispatcher');
        return true;
    }

    // v0.5.40 pattern: inject as statement before if()
    if (c.includes(stmtTarget)) {
        c = c.replace(stmtTarget, normalizerExpr + ',' + stmtTarget);
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Patched: v3 credential normalizer + Chrome SSO dispatcher');
        return true;
    }

    if (c.includes('/*__9router_chrome_sso_v1__*/')) {
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Patched: Chrome SSO dispatcher');
        return true;
    }

    console.log('  ✗ Target pattern not found');
    return false;
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
// PATCH 3: Quota page - responsive 60s refresh, default pageSize 500
// ============================================================
function patchQuotaPage() {
    console.log('[PATCH 3] Quota: refresh=60s, pageSize=500, countdown=60');
    
    // Find quota page
    const quotaDir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(quotaDir)) { console.log('  ✗ Quota dir not found'); return false; }
    const pageFile = fs.readdirSync(quotaDir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }
    
    const file = path.join(quotaDir, pageFile);
    let c = fs.readFileSync(file, 'utf8');
    let changed = false;
    
    const replacements = [
        // Refresh interval: normalize 3e5 -> 6e4 (60s)
        ['setInterval(()=>{eQ()},3e5)', 'setInterval(()=>{eQ()},6e4)', 'Refresh: 5min → 60s'],
        ['setInterval(()=>eQ(),3e5)', 'setInterval(()=>eQ(),6e4)', 'Refresh (visibility): 5min → 60s'],
        ['setInterval(()=>{e1()},3e5)', 'setInterval(()=>{e1()},6e4)', 'Refresh: 5min → 60s'],
        ['setInterval(()=>e1(),3e5)', 'setInterval(()=>e1(),6e4)', 'Refresh (visibility): 5min → 60s'],
        // Countdown state + reset: normalize 300 -> 60
        ['useState)(300)', 'useState)(60)', 'Countdown init: 300 → 60'],
        ['e<=1?300:e-1', 'e<=1?60:e-1', 'Countdown loop: 300 → 60'],
        ['Q(300)', 'Q(60)', 'Countdown reset: Q(300) → Q(60)'],
        ['Z(300)', 'Z(60)', 'Countdown reset: Z(300) → Z(60)'],
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
            `setInterval(()=>{${quotaAliases.refreshCallback}()},6e4)`,
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(60)},6e4)`,
            'Auto-refresh guard (main)'
        ],
        [
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(300)},3e5)`,
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(60)},6e4)`,
            'Auto-refresh guard normalize (main)'
        ],
        [
            `setInterval(()=>${quotaAliases.refreshCallback}(),6e4)`,
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(60)},6e4)`,
            'Auto-refresh guard (visibility)'
        ],
        [
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(300)},3e5)`,
            `setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(60)},6e4)`,
            'Auto-refresh guard normalize (visibility)'
        ],
    ];
    for (const [from, to, desc] of refreshGuards) {
        if (c.includes(from)) {
            c = c.split(from).join(to);
            console.log(`  ✅ ${desc}`);
            changed = true;
        }
    }

    // Enhance visibilitychange to immediately trigger refresh on tab focus
    const oldVisHandler = `let e=()=>{document.hidden?(${quotaAliases.refreshTimerRef}.current&&(clearInterval(${quotaAliases.refreshTimerRef}.current),${quotaAliases.refreshTimerRef}.current=null),${quotaAliases.countdownTimerRef}.current&&(clearInterval(${quotaAliases.countdownTimerRef}.current),${quotaAliases.countdownTimerRef}.current=null)):${quotaAliases.autoRefreshEnabled}&&${quotaAliases.isMounted}&&(${quotaAliases.refreshTimerRef}.current=setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(60)},6e4),${quotaAliases.countdownTimerRef}.current=setInterval(()=>{${quotaAliases.countdownSetter}(e=>e<=1?60:e-1)},1e3))};`;
    const newVisHandler = `let e=()=>{document.hidden?(${quotaAliases.refreshTimerRef}.current&&(clearInterval(${quotaAliases.refreshTimerRef}.current),${quotaAliases.refreshTimerRef}.current=null),${quotaAliases.countdownTimerRef}.current&&(clearInterval(${quotaAliases.countdownTimerRef}.current),${quotaAliases.countdownTimerRef}.current=null)):${quotaAliases.autoRefreshEnabled}&&${quotaAliases.isMounted}&&(${quotaAliases.refreshTimerRef}.current&&(clearInterval(${quotaAliases.refreshTimerRef}.current),${quotaAliases.refreshTimerRef}.current=null),${quotaAliases.countdownTimerRef}.current&&(clearInterval(${quotaAliases.countdownTimerRef}.current),${quotaAliases.countdownTimerRef}.current=null),!${quotaAliases.refreshBusy}&&${quotaAliases.refreshCallback}(),${quotaAliases.countdownSetter}(60),${quotaAliases.refreshTimerRef}.current=setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}();else ${quotaAliases.countdownSetter}(60)},6e4),${quotaAliases.countdownTimerRef}.current=setInterval(()=>{${quotaAliases.countdownSetter}(e=>e<=1?60:e-1)},1e3))};`;
    if (c.includes(oldVisHandler)) {
        c = c.replace(oldVisHandler, newVisHandler);
        console.log('  ✅ Added immediate refresh on tab focus');
        changed = true;
    }

    const refreshReady = c.includes(`setInterval(()=>{if(!${quotaAliases.refreshBusy})${quotaAliases.refreshCallback}()`) &&
        c.includes(`${quotaAliases.countdownSetter}(60)`);
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
        ['useState)(300)', 'useState)(60)', 'Server countdown init: 300 → 60'],
        ['S(!0),U(300);', 'S(!0),U(60);', 'Server countdown reset: 300 → 60'],
        ['U(!0),W(300);', 'U(!0),W(60);', 'Server countdown reset: 300 → 60'],
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
        'useState)(60)',
        'useState)(500)',
        'useState)(String(500))',
        'pageSize:500',
        '[50,100,200,500]',
    ].every((target) => server.includes(target)) &&
        (server.includes('S(!0),U(60);') || server.includes('U(!0),W(60);') || server.includes('useState)(60)'));
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

    if (isModernProviderAutoPingPatched(c)) {
        console.log('  → Already patched');
        return true;
    }

    if (c.includes('Auto-ping enable error')) {
        if (c.includes('__9rEnableProviderAutoPing') || isModernProviderAutoPingPatched(c)) {
            console.log('  → Already patched');
            return true;
        }
        const start = c.indexOf('tT=async()=>{');
        const endMarker = 'Auto-ping enable error:",e)}T(!1)}';
        const end = c.indexOf(endMarker, start);
        if (start < 0 || end < start) {
            console.log('  → Already patched (modern)');
            return true;
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

    // 0.5.40+ keeps the same flow but minifier aliases can change between releases.
    const modernAnchors = getModernProviderDetailAnchors(c);
    if (modernAnchors) {
        const modernHelper = [
            '__9rEnableProviderAutoPing=async()=>{',
            `await ${modernAnchors.refreshAlias}();`,
            'try{',
            `if(${modernAnchors.autoPingMapAlias}[${providerId}]){`,
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
        const modernReplacement = modernHelper + ',' + modernAnchors.patchedSuccessSource;
        c = c.replace(modernAnchors.successSource, modernReplacement);

        if (c.includes(modernAnchors.saveSuccessSource)) {
            c = c.replace(modernAnchors.saveSuccessSource, modernAnchors.patchedSaveSuccessSource);
        }

        const identifier = '([A-Za-z_$][\\w$]*)';
        const bulkSuccessPattern = new RegExp(
            `"codex"===${providerId}&&\\(0,${identifier}\\.jsx\\)\\(${identifier},\\{isOpen:${identifier},onClose:\\(\\)=>${identifier}\\(!1\\),onSuccess:${modernAnchors.refreshAlias}\\}\\)`,
        );
        const bulkSuccessMatch = c.match(bulkSuccessPattern);
        if (bulkSuccessMatch) {
            const [bulkSuccess, jsxAlias, componentAlias, isOpenAlias, closeSetter] = bulkSuccessMatch;
            c = c.replace(bulkSuccess,
                `"codex"===${providerId}&&(0,${jsxAlias}.jsx)(${componentAlias},{isOpen:${isOpenAlias},onClose:()=>${closeSetter}(!1),onSuccess:async()=>{await __9rEnableProviderAutoPing();${closeSetter}(!1)}})`,
            );
        }

        const modernReady = c.includes('__9rEnableProviderAutoPing=async()=>{') &&
            c.includes('await tC(__9rPing)') &&
            c.includes(modernAnchors.patchedSaveSuccessSource) &&
            c.includes('onSuccess:async()=>{await __9rEnableProviderAutoPing();');
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
        const oldFallbackCode = [
            '    const weekly=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly")&&getRemaining(q)!==null);',
            '    const session=qList.find(q=>q.name&&q.name.toLowerCase().includes("session")&&getRemaining(q)!==null);',
            '    const remaining=getRemaining(weekly||session);',
            '    return remaining===0;',
        ].join('\n');
        const oldRemCheck = [
            `    const qData=${aliases.quotaMap}[e.id];`,
            '    if(qData?.limitReached)return true;',
            '    const qList=qData?.quotas||[];',
            '    const weekly=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));',
            '    const session=qList.find(q=>q.name&&q.name.toLowerCase().includes("session"));',
            '    const wRem=getRemaining(weekly);',
            '    const sRem=getRemaining(session);',
            '    return (sRem!==null&&sRem===0)||(wRem!==null&&wRem===0);',
        ].join('\n');
        const usableTokenFallback = [
            `    const qData=${aliases.quotaMap}[e.id];`,
            '    if(!qData)return false;',
            '    if(qData.limitReached)return true;',
            '    const qList=Array.isArray(qData)?qData:(qData.quotas||[]);',
            '    if(!qList.length)return false;',
            '    for(const q of qList){const rem=getRemaining(q);if(rem!==null&&rem===0)return true;}',
            '    return false;',
        ].join('\n');
        if (deactivate.includes(oldWeeklyOnly)) {
            deactivate = deactivate.replace(oldWeeklyOnly, usableTokenFallback);
            upgraded = true;
        } else if (deactivate.includes(oldNamedFallback)) {
            deactivate = deactivate.replace(oldNamedFallback, usableTokenFallback);
            upgraded = true;
        } else if (deactivate.includes(oldRemCheck)) {
            deactivate = deactivate.replace(oldRemCheck, usableTokenFallback);
            upgraded = true;
        } else if (deactivate.includes(oldFallbackCode)) {
            const oldTargetBody = [
                `    const qList=${aliases.quotaMap}[e.id]?.quotas||[];`,
                oldFallbackCode
            ].join('\n');
            if (deactivate.includes(oldTargetBody)) {
                deactivate = deactivate.replace(oldTargetBody, usableTokenFallback);
                upgraded = true;
            } else {
                deactivate = deactivate.replace(oldFallbackCode, usableTokenFallback);
                upgraded = true;
            }
        }
        c = c.slice(0, deactivateStart) + deactivate + c.slice(activateStart);

        const repairedActivateStart = c.indexOf('const bulkActivateWeekly=async()=>{', deactivateStart);
        const smartPriorityBoundary = c.indexOf('const bulkPriorityReassign=async()=>{', repairedActivateStart);
        const actionEnd = smartPriorityBoundary > repairedActivateStart
            ? smartPriorityBoundary
            : c.indexOf(`let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`, repairedActivateStart);
        let activate = c.slice(repairedActivateStart, actionEnd);
        const newActivateTargets = [
            `  const inactiveConns=${aliases.list}.filter(e=>!(e.isActive??true));`,
            '  const targets=inactiveConns.filter(e=>{',
            `    const qData=${aliases.quotaMap}[e.id];`,
            '    if(!qData)return false;',
            '    if(qData.limitReached)return false;',
            '    const qList=Array.isArray(qData)?qData:(qData.quotas||[]);',
            '    if(!qList.length)return false;',
            '    let hasValidQuota=false;',
            '    for(const q of qList){',
            '      const rem=getRemaining(q);',
            '      if(rem!==null){',
            '        if(rem===0)return false;',
            '        if(rem>0)hasValidQuota=true;',
            '      }',
            '    }',
            '    return hasValidQuota;',
            '  });'
        ].join('\n');

        const targetsStart = activate.indexOf(`  const inactiveConns=`);
        const targetsEnd = activate.indexOf(`  if(!targets.length)`);
        if (targetsStart !== -1 && targetsEnd !== -1) {
            const currentTargetsBlock = activate.slice(targetsStart, targetsEnd);
            if (currentTargetsBlock.trim() !== newActivateTargets.trim()) {
                activate = activate.slice(0, targetsStart) + newActivateTargets + '\n' + activate.slice(targetsEnd);
                c = c.slice(0, repairedActivateStart) + activate + c.slice(actionEnd);
                upgraded = true;
            }
        }

        const textUpgrades = [
            ['No active connections with 0% weekly remaining found on this page.', 'No active connections with 0% quota remaining found on this page.'],
            ['No active connections with 0% token remaining found on this page.', 'No active connections with 0% quota remaining found on this page.'],
            ['connections with 0% weekly remaining on this page?', 'connections with 0% quota remaining on this page?'],
            ['connections with 0% token remaining on this page?', 'connections with 0% quota remaining on this page?'],
            ['title:"Deactivate all active connections with 0% weekly quota"', 'title:"Deactivate active connections whose quota is 0%"'],
            ['title:"Deactivate active connections whose weekly or session token quota is 0%"', 'title:"Deactivate active connections whose quota is 0%"'],
            ['children:"Tắt 0% Weekly"', 'children:"Tắt 0% quota"'],
            ['children:"Tắt 0% token"', 'children:"Tắt 0% quota"'],
            ['children:"Bật >0% Weekly"', 'children:"Bật >0% quota"'],
            ['title:"Activate all inactive connections with >0% weekly quota"', 'title:"Activate inactive connections with >0% quota remaining"'],
            ['No inactive connections with >0% weekly remaining found on this page.', 'No inactive connections with >0% quota remaining found on this page.'],
            ['connections with >0% weekly remaining on this page?', 'connections with >0% quota remaining on this page?'],
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
        const ready = (c.includes('children:"Tắt 0% quota"') || c.includes('children:"Tắt 0% token"')) &&
            (readyDeactivate.includes('rem===0') || readyDeactivate.includes('sRem===0')) &&
            (readyActivate.includes('hasValidQuota') || readyActivate.includes('getRemaining(q)>0') || readyActivate.includes('wRem>0')) &&
            (c.includes('0% quota remaining') || c.includes('0% token remaining'));
        if (!ready) { console.log('  ✗ Existing quota bulk patch could not be upgraded'); return false; }
        if (upgraded) {
            fs.writeFileSync(file, c, 'utf8');
            console.log('  ✅ Upgraded zero-quota bulk action');
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
        '  if(q.remaining!==undefined&&q.remaining!==null)return Math.max(0,Math.round(q.remaining));',
        '  if(q.remainingPercentage!==undefined&&q.remainingPercentage!==null)return Math.round(q.remainingPercentage);',
        '  if(q.total&&q.total>0)return Math.max(0,Math.round((q.total-(q.used||0))/q.total*100));',
        '  return null;',
        '};',
        `const __9rTurnOffEmpty=async()=>{`,
        `  let targets=${aliases.list}.filter(e=>(e.isActive??!0)&&${aliases.emptyPredicate}(e));`,
        `  ${aliases.toggle}(targets.map(e=>e.id),!1);`,
        `};`,
        `const __9rTurnOnAvailable=async()=>{`,
        `  let targets=${aliases.list}.filter(e=>!(e.isActive??!0)&&!${aliases.emptyPredicate}(e));`,
        `  ${aliases.toggle}(targets.map(e=>e.id),!0);`,
        `};`,
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
        '    }catch(err){console.error(err)}',
        `    finally{${aliases.busySetter}(false);}`,
        '  }',
        '};',
        'const bulkDeactivate0Weekly=async()=>{',
        `  const activeConns=${aliases.list}.filter(e=>e.isActive??true);`,
        '  const targets=activeConns.filter(e=>{',
        `    const qData=${aliases.quotaMap}[e.id];`,
        '    if(!qData)return false;',
        '    if(qData.limitReached)return true;',
        '    const qList=Array.isArray(qData)?qData:(qData.quotas||[]);',
        '    if(!qList.length)return false;',
        '    for(const q of qList){const rem=getRemaining(q);if(rem!==null&&rem===0)return true;}',
        '    return false;',
        '  });',
        '  if(!targets.length){alert("No active connections with 0% quota remaining found on this page.");return;}',
        '  if(confirm(`Deactivate ${targets.length} connections with 0% quota remaining on this page?`)){',
        `    ${aliases.busySetter}(true);`,
        '    try{',
        '      await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{',
        '        method:"PUT",',
        '        headers:{"Content-Type":"application/json"},',
        '        body:JSON.stringify({isActive:false})',
        '      })));',
        `      await b(${aliases.fetchAccounts},${aliases.page});`,
        '    }catch(err){console.error(err)}',
        `    finally{${aliases.busySetter}(false);}`,
        '  }',
        '};',
        'const bulkActivateWeekly=async()=>{',
        `  const inactiveConns=${aliases.list}.filter(e=>!(e.isActive??true));`,
        '  const targets=inactiveConns.filter(e=>{',
        `    const qData=${aliases.quotaMap}[e.id];`,
        '    if(!qData)return false;',
        '    if(qData.limitReached)return false;',
        '    const qList=Array.isArray(qData)?qData:(qData.quotas||[]);',
        '    if(!qList.length)return false;',
        '    let hasValidQuota=false;',
        '    for(const q of qList){',
        '      const rem=getRemaining(q);',
        '      if(rem!==null){',
        '        if(rem===0)return false;',
        '        if(rem>0)hasValidQuota=true;',
        '      }',
        '    }',
        '    return hasValidQuota;',
        '  });',
        '  if(!targets.length){alert("No inactive connections with >0% quota remaining found on this page.");return;}',
        '  if(confirm(`Activate ${targets.length} connections with >0% quota remaining on this page?`)){',
        `    ${aliases.busySetter}(true);`,
        '    try{',
        '      await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{',
        '        method:"PUT",',
        '        headers:{"Content-Type":"application/json"},',
        '        body:JSON.stringify({isActive:true})',
        '      })));',
        `      await b(${aliases.fetchAccounts},${aliases.page});`,
        '    }catch(err){console.error(err)}',
        `    finally{${aliases.busySetter}(false);}`,
        '  }',
        '};',
        `let ${aliases.bulkLabel}="all"===${aliases.statusFilter}`
    ].join('\n');
    
    const injectedButtons = [
        `(0,a.jsxs)("button",{type:"button",onClick:__9rTurnOnAvailable,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50",title:"Enable connections that still have quota on the current page",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"check_circle"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Turn on Available"})]}),`,
        `(0,a.jsxs)("button",{type:"button",onClick:bulkDelete401,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-red-500/30 px-2 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50",title:"Delete all connections with 401/402 error on the current page",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"delete_forever"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Xóa 401/402"})]}),`,

        `(0,a.jsxs)("button",{type:"button",onClick:bulkDeactivate0Weekly,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-amber-500/30 px-2 text-xs text-amber-500 transition-colors hover:bg-amber-500/10 disabled:opacity-50",title:"Deactivate active connections whose quota is 0%",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"block"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Tắt 0% quota"})]}),`,
        `(0,a.jsxs)("button",{type:"button",onClick:bulkActivateWeekly,disabled:${aliases.busy},className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50",title:"Activate all inactive connections with >0% quota",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"play_circle"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"Bật >0% quota"})]})`
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
            ['children:"Tắt 0% Weekly"', 'children:"Tắt 0% quota"'],
            ['children:"Tắt 0% token"', 'children:"Tắt 0% quota"'],
            ['children:"Bật >0% Weekly"', 'children:"Bật >0% quota"'],
            ['title:"Deactivate 0% Weekly"', 'title:"Deactivate 0% quota"'],
            ['title:"Deactivate 0% token"', 'title:"Deactivate 0% quota"'],
            ['title:"Activate >0% Weekly"', 'title:"Activate >0% quota"'],
            ['Deactivate 0% token', 'Deactivate 0% quota'],
            ['Activate >0% Weekly', 'Activate >0% quota'],
            ['Scan active connections and deactivate those with 0% weekly remaining?', 'Scan active connections and deactivate those with 0% quota remaining?'],
            ['Scan active connections and deactivate 0% weekly/session token accounts?', 'Scan active connections and deactivate 0% quota accounts?'],
            ['Scan active connections and deactivate those with 0% weekly or session token remaining?', 'Scan active connections and deactivate those with 0% quota remaining?'],
            ['No connections with 0% weekly remaining found', 'No connections with 0% quota remaining found'],
            ['No connections with 0% token remaining found', 'No connections with 0% quota remaining found'],
            ['No inactive connections with >0% weekly remaining found', 'No inactive connections with >0% quota remaining found'],
            ['connections with 0% token remaining?', 'connections with 0% quota remaining?'],
            ['connections with >0% weekly remaining?', 'connections with >0% quota remaining?'],
            ['const q=(quotasMap[e.id]||[]).find(q=>q.name&&q.name.toLowerCase().includes("weekly"));return q&&getRemaining(q)===0', 'const qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;const list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;for(let q of list){let rem=getRemaining(q);if(rem!==null&&rem===0)return true;}return false;'],
            ['const qList=quotasMap[e.id]||[];const weekly=qList.find(q=>q.name&&q.name.toLowerCase().includes("weekly"));const session=qList.find(q=>q.name&&q.name.toLowerCase().includes("session"));const q=weekly||session;return q&&getRemaining(q)===0', 'const qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;const list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;for(let q of list){let rem=getRemaining(q);if(rem!==null&&rem===0)return true;}return false;'],
            ['let qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;let list=qData.quotas||[],weekly=list.find(q=>q.name&&q.name.toLowerCase().includes("weekly")),session=list.find(q=>q.name&&q.name.toLowerCase().includes("session")),wRem=__9rGetRemaining(weekly),sRem=__9rGetRemaining(session);return (sRem!==null&&sRem===0)||(wRem!==null&&wRem===0)', 'let qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;let list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;for(let q of list){let rem=__9rGetRemaining(q);if(rem!==null&&rem===0)return true;}return false;'],
            ['let qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;let list=Array.isArray(qData)?qData:(qData.quotas||[]),weekly=list.find(q=>q.name&&q.name.toLowerCase().includes("weekly")),session=list.find(q=>q.name&&q.name.toLowerCase().includes("session")),wRem=__9rGetRemaining(weekly),sRem=__9rGetRemaining(session);return (sRem!==null&&sRem===0)||(wRem!==null&&wRem===0)', 'let qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;let list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;for(let q of list){let rem=__9rGetRemaining(q);if(rem!==null&&rem===0)return true;}return false;'],
            ['await Promise.all(conns.map(async connection=>{try{let response=await fetch("/api/usage/"+connection.id);if(response.ok){let data=await response.json(),raw=data.quotas||{},quotas=Array.isArray(raw)?raw:Object.entries(raw).map(([name,value])=>({name,...value}));results[connection.id]=quotas;results[connection.id]._message=data.message||null}}catch(e){console.log("Error fetching usage:",e)}}));return results', 'const BATCH=15;for(let i=0;i<conns.length;i+=BATCH){const chunk=conns.slice(i,i+BATCH);await Promise.all(chunk.map(async connection=>{try{let response=await fetch("/api/usage/"+connection.id);if(response.ok){let data=await response.json(),raw=data.quotas||{},quotas=Array.isArray(raw)?raw:Object.entries(raw).map(([name,value])=>({name,...value}));results[connection.id]={quotas:quotas,limitReached:Boolean(data.limitReached),_message:data.message||null}}}catch(e){console.log("Error fetching usage:",e)}}))}return results'],
        ];
        let upgraded = false;
        for (const [from, to] of upgrades) {
            if (c.includes(from)) {
                c = c.replace(from, to);
                upgraded = true;
            }
        }
        if (c.includes('})},window.__9rLogInterval=null;')) {
            c = c.replace('})},window.__9rLogInterval=null;', '})},chromeSsoModal=()=>{window.__9rLogInterval=null;')
                 .replace('}});},,', '}});}},');
            upgraded = true;
        }
        const sharedSsoModalCode = `var __9rLogInterval=null;var __9rAutoScroll=true;` +
            `var __9rCloseModal=()=>{if(__9rLogInterval){clearInterval(__9rLogInterval);__9rLogInterval=null;}const el=document.getElementById("__9r_sso_modal");if(el)el.remove();};` +
            `var __9rSsoRunner=(m)=>{const st=document.getElementById("__9r_chk_stealth");const isSt=st?st.checked:true;fetch("/api/oauth/codex/bulk-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"launch_runner",mode:m,stealth:isSt})}).then(r=>r.json()).then(d=>{alert(d.message||"🚀 Tiến trình Auto-Login đang xử lý!");__9rViewLogs();}).catch(e=>{alert("🚀 Tiến trình đang được khởi động...");});};` +
            `var __9rViewLogs=()=>{fetch("/api/oauth/codex/bulk-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get_logs",lineCount:200})}).then(r=>r.json()).then(d=>{let logBox=document.getElementById("__9r_log_content");if(logBox){const wasBottom = logBox.scrollHeight - logBox.scrollTop <= logBox.clientHeight + 50;logBox.textContent=d.logs||"Chưa có dữ liệu log.";if(__9rAutoScroll || wasBottom){logBox.scrollTop=logBox.scrollHeight;}}});};` +
            `var __9rCopyLogs=()=>{let logBox=document.getElementById("__9r_log_content");if(logBox&&logBox.textContent){navigator.clipboard.writeText(logBox.textContent).then(()=>{const btn=document.getElementById("__9r_btn_copy_log");if(btn){const old=btn.textContent;btn.textContent="✅ Đã Copy!";setTimeout(()=>btn.textContent=old,1500);}}).catch(()=>{alert("Vui lòng chọn văn bản và nhấn Ctrl+C để sao chép.");});}};` +
            `var __9rToggleAutoScroll=()=>{__9rAutoScroll=!__9rAutoScroll;const btn=document.getElementById("__9r_btn_autoscroll");if(btn){btn.textContent=__9rAutoScroll?"⚡ Tự cuộn: BẬT":"⏸️ Tự cuộn: TẮT";btn.className=__9rAutoScroll?"px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono transition-colors cursor-pointer":"px-2.5 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-xs font-mono transition-colors cursor-pointer";}};` +
            `var chromeSsoModal=()=>{` +
            `__9rCloseModal();` +
            `const modal=document.createElement("div");` +
            `modal.id="__9r_sso_modal";` +
            `modal.className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md overflow-hidden";` +
            `modal.innerHTML=\`<div style="max-height: 92vh; display: flex; flex-direction: column;" class="relative w-full max-w-6xl xl:max-w-7xl max-h-[94vh] flex flex-col bg-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl text-[#c9d1d9] font-sans text-sm animate-in fade-in zoom-in-95 duration-150 overflow-hidden">` +
            `<div class="flex items-center justify-between px-6 py-3.5 border-b border-[#30363d] bg-[#161b22] shrink-0">` +
            `<div class="flex items-center gap-3"><span class="text-2xl">⚡</span><div><h2 class="text-base font-bold text-white tracking-wide">Trình Tự Động Đăng Nhập & Đồng Bộ 9Router</h2><p class="text-xs text-gray-400">Tự động SSO Gmail qua Chrome Profile & Điền Email/Password + 2FA TOTP cho Domain</p></div></div>` +
            `<div class="flex items-center gap-2">` +
            `<button id="__9r_btn_close" class="w-8 h-8 rounded-full bg-[#21262d] hover:bg-red-500/20 hover:text-red-400 text-gray-400 flex items-center justify-center transition-colors text-base font-bold cursor-pointer">✕</button>` +
            `</div>` +
            `</div>` +
            `<div class="p-5 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-[#0d1117]">` +
            `<div class="lg:col-span-4 flex flex-col space-y-3">` +
            `<div id="__9r_stats_bar" class="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d] text-xs text-gray-300 space-y-2">` +
            `<div class="font-semibold text-gray-200 flex items-center gap-2"><span>📊</span><span>Thống Kê Trạng Thái Tài Khoản</span></div>` +
            `<div id="__9r_stats_content" class="text-gray-400">⏳ Đang lấy dữ liệu tài khoản...</div>` +
            `</div>` +
            `<div class="p-3 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between shadow-sm">` +
            `<div class="flex items-center gap-2.5">` +
            `<span class="text-lg">🥷</span>` +
            `<div><div class="font-semibold text-gray-200 text-xs flex items-center gap-1.5"><span>Chạy Ẩn Tàng Hình</span><span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Khuyên dùng</span></div><div class="text-[11px] text-gray-400 mt-0.5">Ẩn Terminal đen & Đẩy Chrome ra ngoài màn hình</div></div>` +
            `</div>` +
            `<label class="relative inline-flex items-center cursor-pointer">` +
            `<input type="checkbox" id="__9r_chk_stealth" checked class="sr-only peer">` +
            `<div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>` +
            `</label>` +
            `</div>` +
            `<div class="space-y-2 flex-1">` +
            `<button id="__9r_btn_all" class="w-full text-left p-3.5 rounded-xl border border-emerald-500/40 bg-[#161b22] hover:bg-emerald-500/10 hover:border-emerald-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-emerald-400 flex items-center gap-1.5">⚡ 1. Tất cả tài khoản cần xử lý</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_all">Bỏ qua Live 🟢 & Tắt ⏸️ -> Chỉ nạp nick thiếu/lỗi</div></div>` +
            `<span class="text-xs font-mono font-bold text-emerald-400 group-hover:translate-x-1 transition-transform bg-emerald-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_all">Chạy hết →</span>` +
            `</button>` +
            `<button id="__9r_btn_gmail" class="w-full text-left p-3.5 rounded-xl border border-sky-500/40 bg-[#161b22] hover:bg-sky-500/10 hover:border-sky-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-sky-400 flex items-center gap-1.5">🌐 2. Chỉ Gmail Profile Chrome</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_gmail">Mở các Profile Chrome chưa nạp token</div></div>` +
            `<span class="text-xs font-mono font-bold text-sky-400 group-hover:translate-x-1 transition-transform bg-sky-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_gmail">Gmail →</span>` +
            `</button>` +
            `<button id="__9r_btn_domain" class="w-full text-left p-3.5 rounded-xl border border-indigo-500/40 bg-[#161b22] hover:bg-indigo-500/10 hover:border-indigo-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-indigo-400 flex items-center gap-1.5">🏢 3. Chỉ Email Domain (Ẩn danh + 2FA)</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_domain">Tự động gõ Email, Mật khẩu & tính mã TOTP</div></div>` +
            `<span class="text-xs font-mono font-bold text-indigo-400 group-hover:translate-x-1 transition-transform bg-indigo-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_domain">Domain →</span>` +
            `</button>` +
            `<button id="__9r_btn_revoked" class="w-full text-left p-3.5 rounded-xl border border-red-500/40 bg-[#161b22] hover:bg-red-500/10 hover:border-red-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-red-400 flex items-center gap-1.5">🔴 4. Chỉ tài khoản Lỗi Token Revoked</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_revoked">Tập trung fix lại các nick bị Token Revoked/401</div></div>` +
            `<span class="text-xs font-mono font-bold text-red-400 group-hover:translate-x-1 transition-transform bg-red-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_revoked">Fix Lỗi →</span>` +
            `</button>` +
            `</div>` +
            `<div class="p-3 rounded-xl bg-[#161b22] border border-[#30363d] text-xs text-gray-400 space-y-1">` +
            `<div class="font-medium text-gray-300">⌨️ Phím Tắt Terminal Trong Lúc Chạy:</div>` +
            `<div>• Nhấn <span class="font-mono px-1.5 py-0.5 rounded bg-[#21262d] text-yellow-300">[S]</span> hoặc <span class="font-mono px-1.5 py-0.5 rounded bg-[#21262d] text-yellow-300">[Space]</span>: Bỏ qua tài khoản hiện tại</div>` +
            `<div>• Nhấn <span class="font-mono px-1.5 py-0.5 rounded bg-[#21262d] text-red-400">[D]</span>: Đánh dấu Deactivated & chuyển nick</div>` +
            `</div>` +
            `</div>` +
            `<div class="lg:col-span-8 flex flex-col min-h-[420px] lg:min-h-[500px]">` +
            `<div class="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-[#161b22] border-t border-x border-[#30363d] text-xs text-gray-400">` +
            `<div class="flex items-center gap-2">` +
            `<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>` +
            `<span class="font-semibold text-gray-200">Nhật Ký Thời Gian Thực (Live Terminal Stream):</span>` +
            `</div>` +
            `<div class="flex items-center gap-2">` +
            `<button id="__9r_btn_autoscroll" onclick="__9rToggleAutoScroll()" class="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono transition-colors cursor-pointer">⚡ Tự cuộn: BẬT</button>` +
            `<button id="__9r_btn_copy_log" class="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer text-xs">📋 Copy</button>` +
            `<button id="__9r_btn_refresh_log" class="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer text-xs">🔄 Làm mới</button>` +
            `</div>` +
            `</div>` +
            `<pre id="__9r_log_content" style="max-height: 440px; height: 440px; overflow-y: auto;" class="w-full flex-1 min-h-[380px] max-h-[560px] overflow-y-auto overflow-x-auto p-4 rounded-b-xl bg-[#040608] border border-[#30363d] text-emerald-400 font-mono text-xs md:text-[13px] leading-relaxed select-text whitespace-pre shadow-inner">Đang tải nhật ký thời gian thực...</pre>` +
            `</div>` +
            `</div>` +
            `<div class="px-6 py-3 border-t border-[#30363d] flex items-center justify-between text-xs text-gray-400 shrink-0 bg-[#161b22]">` +
            `<span class="font-mono text-gray-400 flex items-center gap-1.5"><span class="text-emerald-400">●</span> File nhật ký nguồn: <b class="text-gray-300">logs/auto-login.log</b></span>` +
            `<button id="__9r_btn_close_bottom" class="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-200 font-medium transition-colors border border-[#30363d] cursor-pointer">Đóng Cửa Sổ</button>` +
            `</div>` +
            `</div>\`;` +
            `document.body.appendChild(modal);` +
            `document.getElementById("__9r_btn_close").onclick=__9rCloseModal;` +
            `document.getElementById("__9r_btn_close_bottom").onclick=__9rCloseModal;` +
            `document.getElementById("__9r_btn_all").onclick=()=>__9rSsoRunner("all");` +
            `document.getElementById("__9r_btn_gmail").onclick=()=>__9rSsoRunner("gmail");` +
            `document.getElementById("__9r_btn_domain").onclick=()=>__9rSsoRunner("domain");` +
            `document.getElementById("__9r_btn_revoked").onclick=()=>__9rSsoRunner("revoked");` +
            `document.getElementById("__9r_btn_refresh_log").onclick=__9rViewLogs;` +
            `document.getElementById("__9r_btn_copy_log").onclick=__9rCopyLogs;` +
            `__9rViewLogs();` +
            `if(!__9rLogInterval){__9rLogInterval=setInterval(__9rViewLogs,2000);}` +
            `fetch("/api/oauth/codex/bulk-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get_status"})}).then(r=>r.json()).then(d=>{` +
            `const statsContent=document.getElementById("__9r_stats_content");` +
            `if(statsContent&&d.success){` +
            `statsContent.innerHTML=\`<div class="grid grid-cols-2 gap-1.5 pt-1"><div>🟢 Live: <b class="text-emerald-400">\${d.liveCount||0}</b></div><div>⏸️ Tắt: <b class="text-yellow-400">\${d.disabledCount||0}</b></div><div>🔴 Lỗi: <b class="text-red-400">\${d.revokedCount||0}</b></div><div>⚪ Chưa nạp: <b class="text-amber-400">\${d.missingCount||0}</b></div>\${d.deactCount?'<div class=\"col-span-2 text-purple-400 text-[11px]\">⛔ Đã bị OpenAI khóa: <b>'+d.deactCount+'</b> nick</div>':''}</div><div class="pt-1.5 border-t border-[#30363d]/60 text-[11px] text-gray-400">Tổng tài khoản trong danh sách: <b class="text-white">\${d.totalAccounts||0}</b></div>\`;` +
            `document.getElementById("__9r_desc_all").textContent=\`Bỏ qua \${d.liveCount||0} Live 🟢 & \${d.disabledCount||0} Tắt ⏸️ -> Nạp \${d.needRunTotal||0} nick\`;` +
            `document.getElementById("__9r_badge_all").textContent=\`Chạy (\${d.needRunTotal||0}) →\`;` +
            `document.getElementById("__9r_badge_gmail").textContent=\`Gmail (\${d.gmailNeedRun||0}) →\`;` +
            `document.getElementById("__9r_badge_domain").textContent=\`Domain (\${d.domainNeedRun||0}) →\`;` +
            `document.getElementById("__9r_badge_revoked").textContent=\`Fix (\${d.revokedCount||0}) →\`;` +
            `}` +
            `});` +
            `};`;

        if (c.includes('var chromeSsoModal=')) {
            const oldModalRegex = /(?:var\s+__9rLogInterval[\s\S]*?)?var\s+__9rCloseModal=[\s\S]*?var\s+chromeSsoModal=[\s\S]*?document\.body\.appendChild\(modal\);[\s\S]*?\};\r?\n(?=function B\(\)\{)/;
            if (oldModalRegex.test(c)) {
                c = c.replace(oldModalRegex, sharedSsoModalCode + '\n');
                upgraded = true;
            }
        } else {
            c = c.replace('function B(){', sharedSsoModalCode + '\nfunction B(){');
            upgraded = true;
        }

        if (!c.includes('Auto-Login Manager')) {
            const testConnAnchor = '"Test Connection One-by-One"})';
            const testConnIdx = c.indexOf(testConnAnchor);
            if (testConnIdx !== -1) {
                const startIdx = c.lastIndexOf('(0,', testConnIdx);
                const testBtn = c.slice(startIdx, testConnIdx + testConnAnchor.length);
                const jsxMatch = testBtn.match(/\(0,([A-Za-z_$][\w$]*)\.jsx\)\(([A-Za-z_$][\w$]*)\.\$n/);
                if (jsxMatch) {
                    const jsxAlias = jsxMatch[1];
                    const componentAlias = jsxMatch[2];
                    const injectedButtons = testBtn + ',' +
                        `"codex"===${providerId}&&(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"smart_toy",onClick:chromeSsoModal,children:"⚡ Auto-Login Manager"}),` +
                        `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"delete_forever",onClick:bulkDelete401,children:"Xóa 401/402"}),` +
                        `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"block",onClick:bulkDeactivate0Weekly,children:"Tắt 0% quota"}),` +
                        `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"play_circle",onClick:bulkActivateWeekly,children:"Bật >0% quota"})`;
                    c = c.replace(testBtn, injectedButtons);
                    upgraded = true;
                }
            } else {
                const deleteBtnPattern = /,\(0,([A-Za-z_$][\w$]*)\.jsx\)\(([A-Za-z_$][\w$]*)\.\$n,\{size:"sm",icon:"delete_forever",variant:"secondary",onClick:bulkDelete401,children:"Xóa 401\/402"\}/;
                const matchBtn = c.match(deleteBtnPattern);
                if (matchBtn) {
                    const ssoBtn = `,"codex"===${providerId}&&(0,${matchBtn[1]}.jsx)(${matchBtn[2]}.$n,{size:"sm",icon:"sync_alt",variant:"secondary",onClick:chromeSsoModal,children:"⚡ Auto-Login Manager"})` + matchBtn[0];
                    c = c.replace(matchBtn[0], ssoBtn);
                    upgraded = true;
                }
            }
        }

        if (!isProviderDetailBulkPatched(c)) {
            console.log('  ✗ Existing provider detail bulk patch could not be upgraded');
            return false;
        }
        if (upgraded) fs.writeFileSync(file, c, 'utf8');

        // Sync Server SSR Component
        const serverFile = path.join(BUILD, 'server/app/(dashboard)/dashboard/providers/[id]/page.js');
        if (fs.existsSync(serverFile)) {
            let sc = fs.readFileSync(serverFile, 'utf8');
            if (!sc.includes('Auto-Login Manager')) {
                const testConnAnchor = '"Test Connection One-by-One"})';
                const testConnIdx = sc.indexOf(testConnAnchor);
                if (testConnIdx !== -1) {
                    const startIdx = sc.lastIndexOf('(0,', testConnIdx);
                    const testBtn = sc.slice(startIdx, testConnIdx + testConnAnchor.length);
                    const jsxMatch = testBtn.match(/\(0,([A-Za-z_$][\w$]*)\.jsx\)\(([A-Za-z_$][\w$]*)\.\$n/);
                    if (jsxMatch) {
                        const jsxAlias = jsxMatch[1];
                        const componentAlias = jsxMatch[2];
                        const sProviderIdMatch = sc.match(/,([A-Za-z0-9_$]+)=\(0,[A-Za-z0-9_$]+\.use\)\([A-Za-z0-9_$]+\.params\)\.id/) || sc.match(/"codex"===([A-Za-z0-9_$]+)&&\(0,/);
                        const sProviderId = sProviderIdMatch ? sProviderIdMatch[1] : 'r';
                        const injectedButtons = testBtn + ',' +
                            `"codex"===${sProviderId}&&(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"smart_toy",onClick:()=>{},children:"⚡ Auto-Login Manager"}),` +
                            `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"delete_forever",onClick:()=>{},children:"Xóa 401/402"}),` +
                            `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"block",onClick:()=>{},children:"Tắt 0% quota"}),` +
                            `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"play_circle",onClick:()=>{},children:"Bật >0% quota"})`;
                        sc = sc.replace(testBtn, injectedButtons);
                        fs.writeFileSync(serverFile, sc, 'utf8');
                    }
                }
            }
        }

        console.log(upgraded ? '  ✅ Upgraded provider zero-quota & Chrome SSO actions (Client + Server)' : '  → Already patched');
        return true;
    }
    
    const targetSearch = 'Auto-ping enable error:",e)}T(!1)},tO=async e=>{';
    if (!c.includes(targetSearch)) {
        const modernTargetInfo = getPatchedProviderDetailTarget(c);
        const connectionsMatch = c.match(/,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.filter\(e=>[A-Za-z_$][\w$]*\.includes\(e\.id\)\),[A-Za-z_$][\w$]*=\2\.length>0/);
        const modernButtonPattern = new RegExp(
            `"codex"===${providerId}&&\\(0,([A-Za-z_$][\\w$]*)\\.jsx\\)\\(([A-Za-z_$][\\w$]*)\\.\\$n,\\{size:"sm",icon:"playlist_add",variant:"secondary",onClick:\\(\\)=>[A-Za-z_$][\\w$]*\\(!0\\),children:\\(0,[A-Za-z_$][\\w$]*\\.Tl\\)\\("Bulk Add"\\)\\}\\)`,
        );
        const modernButtonMatch = c.match(modernButtonPattern);
        if (!modernTargetInfo || !connectionsMatch || !modernButtonMatch) {
            console.log('  ✗ Target functions pattern not found');
            return false;
        }

        const modernTarget = modernTargetInfo.source;
        const connections = connectionsMatch[2];
        const modernAnchors = getModernProviderDetailAnchors(c);
        const refreshAlias = modernAnchors ? modernAnchors.refreshAlias : 'tg';
        const jsxAlias = modernButtonMatch[1];
        const componentAlias = modernButtonMatch[2];
        const ssoModalCode = `chromeSsoModal=()=>{` +
            `window.__9rLogInterval=null;window.__9rAutoScroll=true;` +
            `window.__9rCloseModal=()=>{if(window.__9rLogInterval){clearInterval(window.__9rLogInterval);window.__9rLogInterval=null;}const el=document.getElementById("__9r_sso_modal");if(el)el.remove();};` +
            `window.__9rSsoRunner=(m)=>{const st=document.getElementById("__9r_chk_stealth");const isSt=st?st.checked:true;fetch("/api/oauth/codex/bulk-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"launch_runner",mode:m,stealth:isSt})}).then(r=>r.json()).then(d=>{alert(d.message||"🚀 Tiến trình Auto-Login đang xử lý!");window.__9rViewLogs();}).catch(e=>{alert("🚀 Tiến trình đang được khởi động...");});};` +
            `window.__9rViewLogs=()=>{fetch("/api/oauth/codex/bulk-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get_logs",lineCount:200})}).then(r=>r.json()).then(d=>{let logBox=document.getElementById("__9r_log_content");if(logBox){const wasBottom = logBox.scrollHeight - logBox.scrollTop <= logBox.clientHeight + 50;logBox.textContent=d.logs||"Chưa có dữ liệu log.";if(window.__9rAutoScroll || wasBottom){logBox.scrollTop=logBox.scrollHeight;}}});};` +
            `window.__9rCopyLogs=()=>{let logBox=document.getElementById("__9r_log_content");if(logBox&&logBox.textContent){navigator.clipboard.writeText(logBox.textContent).then(()=>{const btn=document.getElementById("__9r_btn_copy_log");if(btn){const old=btn.textContent;btn.textContent="✅ Đã Copy!";setTimeout(()=>btn.textContent=old,1500);}}).catch(()=>{alert("Vui lòng chọn văn bản và nhấn Ctrl+C để sao chép.");});}};` +
            `window.__9rToggleAutoScroll=()=>{window.__9rAutoScroll=!window.__9rAutoScroll;const btn=document.getElementById("__9r_btn_autoscroll");if(btn){btn.textContent=window.__9rAutoScroll?"⚡ Tự cuộn: BẬT":"⏸️ Tự cuộn: TẮT";btn.className=window.__9rAutoScroll?"px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono transition-colors cursor-pointer":"px-2.5 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-xs font-mono transition-colors cursor-pointer";}};` +
            `window.__9rCloseModal();` +
            `const modal=document.createElement("div");` +
            `modal.id="__9r_sso_modal";` +
            `modal.className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md overflow-hidden";` +
            `modal.innerHTML=\`<div style="max-height: 92vh; display: flex; flex-direction: column;" class="relative w-full max-w-6xl xl:max-w-7xl max-h-[94vh] flex flex-col bg-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl text-[#c9d1d9] font-sans text-sm animate-in fade-in zoom-in-95 duration-150 overflow-hidden">` +
            `<div class="flex items-center justify-between px-6 py-3.5 border-b border-[#30363d] bg-[#161b22] shrink-0">` +
            `<div class="flex items-center gap-3"><span class="text-2xl">⚡</span><div><h2 class="text-base font-bold text-white tracking-wide">Trình Tự Động Đăng Nhập & Đồng Bộ 9Router</h2><p class="text-xs text-gray-400">Tự động SSO Gmail qua Chrome Profile & Điền Email/Password + 2FA TOTP cho Domain</p></div></div>` +
            `<div class="flex items-center gap-2">` +
            `<button id="__9r_btn_close" class="w-8 h-8 rounded-full bg-[#21262d] hover:bg-red-500/20 hover:text-red-400 text-gray-400 flex items-center justify-center transition-colors text-base font-bold cursor-pointer">✕</button>` +
            `</div>` +
            `</div>` +
            `<div class="p-5 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-[#0d1117]">` +
            `<div class="lg:col-span-4 flex flex-col space-y-3">` +
            `<div id="__9r_stats_bar" class="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d] text-xs text-gray-300 space-y-2">` +
            `<div class="font-semibold text-gray-200 flex items-center gap-2"><span>📊</span><span>Thống Kê Trạng Thái Tài Khoản</span></div>` +
            `<div id="__9r_stats_content" class="text-gray-400">⏳ Đang lấy dữ liệu tài khoản...</div>` +
            `</div>` +
            `<div class="p-3 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between shadow-sm">` +
            `<div class="flex items-center gap-2.5">` +
            `<span class="text-lg">🥷</span>` +
            `<div><div class="font-semibold text-gray-200 text-xs flex items-center gap-1.5"><span>Chạy Ẩn Tàng Hình</span><span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Khuyên dùng</span></div><div class="text-[11px] text-gray-400 mt-0.5">Ẩn Terminal đen & Đẩy Chrome ra ngoài màn hình</div></div>` +
            `</div>` +
            `<label class="relative inline-flex items-center cursor-pointer">` +
            `<input type="checkbox" id="__9r_chk_stealth" checked class="sr-only peer">` +
            `<div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>` +
            `</label>` +
            `</div>` +
            `<div class="space-y-2 flex-1">` +
            `<button id="__9r_btn_all" class="w-full text-left p-3.5 rounded-xl border border-emerald-500/40 bg-[#161b22] hover:bg-emerald-500/10 hover:border-emerald-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-emerald-400 flex items-center gap-1.5">⚡ 1. Tất cả tài khoản cần xử lý</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_all">Bỏ qua Live 🟢 & Tắt ⏸️ -> Chỉ nạp nick thiếu/lỗi</div></div>` +
            `<span class="text-xs font-mono font-bold text-emerald-400 group-hover:translate-x-1 transition-transform bg-emerald-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_all">Chạy hết →</span>` +
            `</button>` +
            `<button id="__9r_btn_gmail" class="w-full text-left p-3.5 rounded-xl border border-sky-500/40 bg-[#161b22] hover:bg-sky-500/10 hover:border-sky-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-sky-400 flex items-center gap-1.5">🌐 2. Chỉ Gmail Profile Chrome</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_gmail">Mở các Profile Chrome chưa nạp token</div></div>` +
            `<span class="text-xs font-mono font-bold text-sky-400 group-hover:translate-x-1 transition-transform bg-sky-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_gmail">Gmail →</span>` +
            `</button>` +
            `<button id="__9r_btn_domain" class="w-full text-left p-3.5 rounded-xl border border-indigo-500/40 bg-[#161b22] hover:bg-indigo-500/10 hover:border-indigo-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-indigo-400 flex items-center gap-1.5">🏢 3. Chỉ Email Domain (Ẩn danh + 2FA)</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_domain">Tự động gõ Email, Mật khẩu & tính mã TOTP</div></div>` +
            `<span class="text-xs font-mono font-bold text-indigo-400 group-hover:translate-x-1 transition-transform bg-indigo-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_domain">Domain →</span>` +
            `</button>` +
            `<button id="__9r_btn_revoked" class="w-full text-left p-3.5 rounded-xl border border-red-500/40 bg-[#161b22] hover:bg-red-500/10 hover:border-red-400 transition-all flex items-center justify-between cursor-pointer group shadow-sm">` +
            `<div><div class="font-semibold text-red-400 flex items-center gap-1.5">🔴 4. Chỉ tài khoản Lỗi Token Revoked</div><div class="text-xs text-gray-400 mt-0.5" id="__9r_desc_revoked">Tập trung fix lại các nick bị Token Revoked/401</div></div>` +
            `<span class="text-xs font-mono font-bold text-red-400 group-hover:translate-x-1 transition-transform bg-red-500/10 px-2.5 py-1 rounded-lg" id="__9r_badge_revoked">Fix Lỗi →</span>` +
            `</button>` +
            `</div>` +
            `<div class="p-3 rounded-xl bg-[#161b22] border border-[#30363d] text-xs text-gray-400 space-y-1">` +
            `<div class="font-medium text-gray-300">⌨️ Phím Tắt Terminal Trong Lúc Chạy:</div>` +
            `<div>• Nhấn <span class="font-mono px-1.5 py-0.5 rounded bg-[#21262d] text-yellow-300">[S]</span> hoặc <span class="font-mono px-1.5 py-0.5 rounded bg-[#21262d] text-yellow-300">[Space]</span>: Bỏ qua tài khoản hiện tại</div>` +
            `<div>• Nhấn <span class="font-mono px-1.5 py-0.5 rounded bg-[#21262d] text-red-400">[D]</span>: Đánh dấu Deactivated & chuyển nick</div>` +
            `</div>` +
            `</div>` +
            `<div class="lg:col-span-8 flex flex-col min-h-[420px] lg:min-h-[500px]">` +
            `<div class="flex items-center justify-between px-3.5 py-2.5 rounded-t-xl bg-[#161b22] border-t border-x border-[#30363d] text-xs text-gray-400">` +
            `<div class="flex items-center gap-2">` +
            `<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>` +
            `<span class="font-semibold text-gray-200">Nhật Ký Thời Gian Thực (Live Terminal Stream):</span>` +
            `</div>` +
            `<div class="flex items-center gap-2">` +
            `<button id="__9r_btn_autoscroll" onclick="window.__9rToggleAutoScroll()" class="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono transition-colors cursor-pointer">⚡ Tự cuộn: BẬT</button>` +
            `<button id="__9r_btn_copy_log" onclick="window.__9rCopyLogs()" class="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer text-xs">📋 Copy</button>` +
            `<button id="__9r_btn_refresh_log" onclick="window.__9rViewLogs()" class="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer text-xs">🔄 Làm mới</button>` +
            `</div>` +
            `</div>` +
            `<pre id="__9r_log_content" style="max-height: 440px; height: 440px; overflow-y: auto;" class="w-full flex-1 min-h-[380px] max-h-[560px] overflow-y-auto overflow-x-auto p-4 rounded-b-xl bg-[#040608] border border-[#30363d] text-emerald-400 font-mono text-xs md:text-[13px] leading-relaxed select-text whitespace-pre shadow-inner">Đang tải nhật ký thời gian thực...</pre>` +
            `</div>` +
            `</div>` +
            `<div class="px-6 py-3 border-t border-[#30363d] flex items-center justify-between text-xs text-gray-400 shrink-0 bg-[#161b22]">` +
            `<span class="font-mono text-gray-400 flex items-center gap-1.5"><span class="text-emerald-400">●</span> File nhật ký nguồn: <b class="text-gray-300">logs/auto-login.log</b></span>` +
            `<button id="__9r_btn_close_bottom" onclick="window.__9rCloseModal()" class="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-200 font-medium transition-colors border border-[#30363d] cursor-pointer">Đóng Cửa Sổ</button>` +
            `</div>` +
            `</div>\`;` +
            `document.body.appendChild(modal);` +
            `document.getElementById("__9r_btn_close").onclick=window.__9rCloseModal;` +
            `document.getElementById("__9r_btn_all").onclick=()=>window.__9rSsoRunner("all");` +
            `document.getElementById("__9r_btn_gmail").onclick=()=>window.__9rSsoRunner("gmail");` +
            `document.getElementById("__9r_btn_domain").onclick=()=>window.__9rSsoRunner("domain");` +
            `document.getElementById("__9r_btn_revoked").onclick=()=>window.__9rSsoRunner("revoked");` +
            `window.__9rViewLogs();` +
            `if(!window.__9rLogInterval){window.__9rLogInterval=setInterval(window.__9rViewLogs,2000);}` +
            `fetch("/api/oauth/codex/bulk-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get_status"})}).then(r=>r.json()).then(d=>{` +
            `const statsContent=document.getElementById("__9r_stats_content");` +
            `if(statsContent&&d.success){` +
            `statsContent.innerHTML=\`<div class="grid grid-cols-2 gap-1.5 pt-1"><div>🟢 Live: <b class="text-emerald-400">\${d.liveCount||0}</b></div><div>⏸️ Tắt: <b class="text-yellow-400">\${d.disabledCount||0}</b></div><div>🔴 Lỗi: <b class="text-red-400">\${d.revokedCount||0}</b></div><div>⚪ Chưa nạp: <b class="text-amber-400">\${d.missingCount||0}</b></div>\${d.deactCount?'<div class=\"col-span-2 text-purple-400 text-[11px]\">⛔ Đã bị OpenAI khóa: <b>'+d.deactCount+'</b> nick</div>':''}</div><div class="pt-1.5 border-t border-[#30363d]/60 text-[11px] text-gray-400">Tổng tài khoản trong danh sách: <b class="text-white">\${d.totalAccounts||0}</b></div>\`;` +
            `document.getElementById("__9r_desc_all").textContent=\`Bỏ qua \${d.liveCount||0} Live 🟢 & \${d.disabledCount||0} Tắt ⏸️ -> Nạp \${d.needRunTotal||0} nick\`;` +
            `document.getElementById("__9r_badge_all").textContent=\`Chạy (\${d.needRunTotal||0}) →\`;` +
            `document.getElementById("__9r_badge_gmail").textContent=\`Gmail (\${d.gmailNeedRun||0}) →\`;` +
            `document.getElementById("__9r_badge_domain").textContent=\`Domain (\${d.domainNeedRun||0}) →\`;` +
            `document.getElementById("__9r_badge_revoked").textContent=\`Fix (\${d.revokedCount||0}) →\`;` +
            `}` +
            `});` +
            `}`;

        const modernFuncs = [
            ',__9rFetchAllQuotas=async conns=>{',
            'let results={};',
            'const BATCH=15;',
            'for(let i=0;i<conns.length;i+=BATCH){',
            '  const chunk=conns.slice(i,i+BATCH);',
            '  await Promise.all(chunk.map(async connection=>{try{',
            '    let response=await fetch("/api/usage/"+connection.id);',
            '    if(response.ok){',
            '      let data=await response.json(),raw=data.quotas||{},quotas=Array.isArray(raw)?raw:Object.entries(raw).map(([name,value])=>({name,...value}));',
            '      results[connection.id]={quotas:quotas,limitReached:Boolean(data.limitReached),_message:data.message||null};',
            '    }',
            '  }catch(e){console.log("Error fetching usage:",e)}}));',
            '}',
            'return results',
            '},__9rGetRemaining=q=>{if(!q)return null;if(q.remaining!==undefined&&q.remaining!==null)return Math.max(0,Math.round(q.remaining));if(q.remainingPercentage!==undefined&&q.remainingPercentage!==null)return Math.round(q.remainingPercentage);if(q.total&&q.total>0)return Math.max(0,Math.round((q.total-(q.used||0))/q.total*100));return null},',
            `bulkDelete401=()=>{let conns=(${connections}||[]);if(!conns.length){${modalSetter}({title:"No targets",message:"No connections found",onConfirm:()=>${modalSetter}(null)});return}${modalSetter}({title:"Scanning for 401/402 errors...",message:"Check all connections and delete invalid 401/402 entries?",onConfirm:async()=>{${modalSetter}(null);let quotasMap=await __9rFetchAllQuotas(conns),targets=conns.filter(e=>e.errorCode===401||e.errorCode==="401"||e.errorCode===402||e.errorCode==="402"||e.testStatus==="invalid"||(e.lastError&&/[401|402]/.test(String(e.lastError)))||(quotasMap[e.id]?._message&&/[401|402]/.test(String(quotasMap[e.id]._message))));if(!targets.length){alert("No 401/402 connections found");return}if(confirm("Delete "+targets.length+" connections with 401/402 errors?")){await Promise.all(targets.map(e=>fetch("/api/providers/"+e.id,{method:"DELETE"})));if(typeof ${refreshAlias}==="function")await ${refreshAlias}();}}})},`,
            `bulkDeactivate0Weekly=()=>{let active=(${connections}||[]).filter(e=>e.isActive);if(!active.length){${modalSetter}({title:"No targets",message:"No active connections found",onConfirm:()=>${modalSetter}(null)});return}${modalSetter}({title:"Deactivate 0% quota",message:"Scan active connections and deactivate 0% quota accounts?",onConfirm:async()=>{${modalSetter}(null);let quotasMap=await __9rFetchAllQuotas(active),targets=active.filter(e=>{let qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;let list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;for(let q of list){let rem=__9rGetRemaining(q);if(rem!==null&&rem===0)return true;}return false;});if(targets.length&&confirm("Deactivate "+targets.length+" connections with 0% quota remaining?")){await Promise.all(targets.map(e=>fetch("/api/providers/"+e.id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:false})})));if(typeof ${refreshAlias}==="function")await ${refreshAlias}();}else if(!targets.length){alert("No connections with 0% quota remaining found")}}})},`,
            `bulkActivateWeekly=()=>{let inactive=(${connections}||[]).filter(e=>!e.isActive);if(!inactive.length){${modalSetter}({title:"No targets",message:"No inactive connections found",onConfirm:()=>${modalSetter}(null)});return}${modalSetter}({title:"Activate >0% quota",message:"Scan inactive connections and activate accounts with quota remaining?",onConfirm:async()=>{${modalSetter}(null);let quotasMap=await __9rFetchAllQuotas(inactive),targets=inactive.filter(e=>{let qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return false;let list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;let hasValidQuota=false;for(let q of list){let rem=__9rGetRemaining(q);if(rem!==null){if(rem===0)return false;if(rem>0)hasValidQuota=true;}}return hasValidQuota;});if(targets.length&&confirm("Activate "+targets.length+" connections with >0% quota remaining?")){await Promise.all(targets.map(e=>fetch("/api/providers/"+e.id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:true})})));if(typeof ${refreshAlias}==="function")await ${refreshAlias}();}else if(!targets.length){alert("No inactive connections with >0% quota remaining found")}}})},`,
            ssoModalCode,
            modernTarget,
        ].join('');
        c = c.replace(modernTarget, modernFuncs);

        const testConnAnchor = '"Test Connection One-by-One"})';
        const testConnIdx = c.indexOf(testConnAnchor);
        if (testConnIdx !== -1) {
            const startIdx = c.lastIndexOf('(0,', testConnIdx);
            const testBtn = c.slice(startIdx, testConnIdx + testConnAnchor.length);
            const toolbarButtons = testBtn + ',' +
                `"codex"===${providerId}&&(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"smart_toy",onClick:chromeSsoModal,children:"⚡ Auto-Login Manager"}),` +
                `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"delete_forever",onClick:bulkDelete401,children:"Xóa 401/402"}),` +
                `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"block",onClick:bulkDeactivate0Weekly,children:"Tắt 0% quota"}),` +
                `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",variant:"secondary",icon:"play_circle",onClick:bulkActivateWeekly,children:"Bật >0% quota"})`;
            c = c.replace(testBtn, toolbarButtons);
        } else {
            const modernButtons = modernButtonMatch[0] + ',' +
                `"codex"===${providerId}&&(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",icon:"sync_alt",variant:"secondary",onClick:chromeSsoModal,children:"⚡ Auto-Login Manager"}),` +
                `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",icon:"delete_forever",variant:"secondary",onClick:bulkDelete401,children:"Xóa 401/402"}),` +
                `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",icon:"block",variant:"secondary",onClick:bulkDeactivate0Weekly,children:"Tắt 0% quota"}),` +
                `(0,${jsxAlias}.jsx)(${componentAlias}.$n,{size:"sm",icon:"play_circle",variant:"secondary",onClick:bulkActivateWeekly,children:"Bật >0% quota"})`;
            c = c.split(modernButtonMatch[0]).join(modernButtons);
        }

        if (!c.includes('bulkDelete401=()=>{') || (!c.includes('children:"Tắt 0% quota"') && !c.includes('children:"Tắt 0% token"'))) {
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
        'fetchAllQuotas=async(conns)=>{const results={};const BATCH=15;for(let i=0;i<conns.length;i+=BATCH){const chunk=conns.slice(i,i+BATCH);await Promise.all(chunk.map(async(c)=>{try{const res=await fetch(`/api/usage/${c.id}`);if(res.ok){const data=await res.json();const raw=data.quotas||{};const quotas=Array.isArray(raw)?raw:Object.entries(raw).map(([k,v])=>({name:k,...v}));results[c.id]={quotas,limitReached:Boolean(data.limitReached),_message:data.message||null}}}catch(e){console.log("Error fetching usage:",e)}}))}return results},' +
        'getRemaining=(q)=>{if(!q)return null;if(q.remaining!==undefined&&q.remaining!==null)return Math.max(0,Math.round(q.remaining));if(q.remainingPercentage!==undefined&&q.remainingPercentage!==null)return Math.round(q.remainingPercentage);if(q.total&&q.total>0)return Math.max(0,Math.round((q.total-(q.used||0))/q.total*100));return null},' +
        'bulkDelete401=()=>{const conns=(x||[]);if(!conns.length){eR({title:"No targets",message:"No connections found",onConfirm:()=>eR(null)});return}eR({title:"Scanning for 401/402 errors...",message:"Checking all connections for 401/402 errors (including usage API)...",onConfirm:async()=>{eR(null);f(true);try{const quotasMap=await fetchAllQuotas(conns);const targets=conns.filter(e=>e.errorCode===401||e.errorCode==="401"||e.errorCode===402||e.errorCode==="402"||e.testStatus==="invalid"||(e.lastError&&(String(e.lastError).includes("401")||String(e.lastError).includes("402")))||(quotasMap[e.id]?._message&&(String(quotasMap[e.id]._message).includes("401")||String(quotasMap[e.id]._message).includes("402"))));if(!targets.length){setTimeout(()=>alert("No 401/402 connections found"),300);f(false);return}if(confirm(`Delete ${targets.length} connections with 401/402 errors?`)){await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{method:"DELETE"})));await tg()}else{f(false)}}catch(err){console.log(err)}finally{f(false)}}})},' +
        'bulkDeactivate0Weekly=()=>{const activeConns=(x||[]).filter(e=>e.isActive);if(!activeConns.length){eR({title:"No targets",message:"No active connections found",onConfirm:()=>eR(null)});return}eR({title:"Deactivate 0% quota",message:"Scan active connections and deactivate those with 0% quota remaining?",onConfirm:async()=>{eR(null);f(true);try{const quotasMap=await fetchAllQuotas(activeConns);const targets=activeConns.filter(e=>{const qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return true;const list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;for(let q of list){let rem=getRemaining(q);if(rem!==null&&rem===0)return true;}return false;});if(targets.length&&confirm(`Deactivate ${targets.length} connections with 0% quota remaining?`)){await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:false})})));await tg()}else{setTimeout(()=>alert("No connections with 0% quota remaining found"),300)}}catch(err){console.log(err)}finally{f(false)}}})},' +
        'bulkActivateWeekly=()=>{const inactiveConns=(x||[]).filter(e=>!e.isActive);if(!inactiveConns.length){eR({title:"No targets",message:"No inactive connections found",onConfirm:()=>eR(null)});return}eR({title:"Activate >0% quota",message:"Scan inactive connections and activate those with >0% quota remaining?",onConfirm:async()=>{eR(null);f(true);try{const quotasMap=await fetchAllQuotas(inactiveConns);const targets=inactiveConns.filter(e=>{const qData=quotasMap[e.id];if(!qData)return false;if(qData.limitReached)return false;const list=Array.isArray(qData)?qData:(qData.quotas||[]);if(!list.length)return false;let hasValidQuota=false;for(let q of list){let rem=getRemaining(q);if(rem!==null){if(rem===0)return false;if(rem>0)hasValidQuota=true;}}return hasValidQuota;});if(targets.length&&confirm(`Activate ${targets.length} connections with >0% quota remaining?`)){await Promise.all(targets.map(e=>fetch(`/api/providers/${e.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:true})})));await tg()}else{setTimeout(()=>alert("No inactive connections with >0% quota remaining found"),300)}}catch(err){console.log(err)}finally{f(false)}}})},' +
        'tO=async e=>{';
    
    const injectedButtons = [
        `"codex"===${providerId}&&(0,i.jsx)(d.$n,{size:"sm",icon:"playlist_add",variant:"secondary",onClick:()=>J(!0),children:(0,w.Tl)("Bulk Add")}),`,
        '(0,i.jsx)(d.$n,{size:"sm",icon:"delete_forever",variant:"secondary",onClick:bulkDelete401,children:"Xóa 401/402"}),',

        '(0,i.jsx)(d.$n,{size:"sm",icon:"block",variant:"secondary",onClick:bulkDeactivate0Weekly,children:"Tắt 0% quota"}),',
        '(0,i.jsx)(d.$n,{size:"sm",icon:"play_circle",variant:"secondary",onClick:bulkActivateWeekly,children:"Bật >0% quota"})'
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
        'let qList=(quotaMap[e.id]?.quotas||[]);' +
        'let q=qList.find(q=>{let n=String(q.name||"").toLowerCase(),t=String(q.quotaType||"").toLowerCase();if(kind==="session")return t.includes("session")||n.includes("session")||n==="5h"||n.includes("(5h)");if(kind==="weekly")return t.includes("weekly")||n.includes("weekly");return n.includes(String(kind).toLowerCase());});' +
        'if(!q)return false;' +
        'let pct=null;' +
        'if(q.remaining!==undefined&&q.remaining!==null)pct=Number(q.remaining);' +
        'else if(q.remainingPercentage!==undefined&&q.remainingPercentage!==null)pct=Number(q.remainingPercentage);' +
        'else if(q.total&&q.total>0)pct=(q.total-(q.used||0))/q.total*100;' +
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
    
    // If token badge was previously injected, strip it out cleanly
    const tokenBadgeMatch = /,(?:\(\(\)=>{let tok=\(typeof __9rAccountTokens!=="undefined"&&__9rAccountTokens\)\?__9rAccountTokens\[r\.id\]:null;.*?children:"⚡ "\+f\(tok\.totalTokens\)\+" tok"}\)}\)\(\))/;
    if (tokenBadgeMatch.test(c)) {
        c = c.replace(tokenBadgeMatch, '');
        fs.writeFileSync(file, c, 'utf8');
    }

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
    let btnAnchor = null;
    if (c.includes('children:"Bật >0% quota"})]})')) {
        btnAnchor = 'children:"Bật >0% quota"})]})';
    } else if (c.includes('children:"Bật >0% Weekly"})]})')) {
        btnAnchor = 'children:"Bật >0% Weekly"})]})';
    }
    if (!btnAnchor) {
        console.log('  ✗ btnAnchor not found');
        return false;
    }
    
    const priButton = btnAnchor + ',' +
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
        'function __9rBuildSmartPriorityPlan(accounts,quotaMap,options){' +
        'let opts=options||{};' +
        'let normPlan=p=>{if(!p)return"unknown";let l=String(p).toLowerCase().trim();if(l.includes("premium")||l.includes("ultra"))return"ultra";if(l.includes("pro"))return"pro";if(l.includes("plus"))return"plus";if(l.includes("team"))return"team";if(l.includes("enterprise"))return"enterprise";if(l.includes("k12"))return"k12";if(l.includes("free"))return"free";if(!l||l==="unknown")return"unknown";return l};' +
        'let quotaPct=q=>{if(!q)return null;let pct=null;if(q.remaining!==undefined)pct=Number(q.remaining);else if(q.remainingPercentage!==undefined)pct=Number(q.remainingPercentage);else if(q.total&&q.total>0)pct=(q.total-q.used)/q.total*100;if(!Number.isFinite(pct))return null;return Math.max(0,Math.min(100,Math.round(pct)))};' +
        'let preferredPlan=normPlan(opts.preferredPlan||"all"),activationMode=opts.activationMode||"priority-only",sessionOrder=opts.sessionOrder==="asc"?"asc":"desc";' +
        'if(activationMode==="preferred-only"&&(preferredPlan==="all"||preferredPlan==="unknown"))throw Error("Select a specific preferred plan before changing activation status.");' +
        'let rows=accounts.map(account=>{let plan=normPlan(quotaMap[account.id]?.plan);if(plan==="unknown")return null;let sessionQuota=(quotaMap[account.id]?.quotas||[]).find(q=>{let n=String(q.name||"").toLowerCase(),t=String(q.quotaType||"").toLowerCase();return t.includes("session")||n.includes("session")||n==="5h"||n.includes("(5h)");});return{account,plan,sessionRemaining:quotaPct(sessionQuota)}}).filter(Boolean);' +
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
    console.log('[PATCH 24] K12 Rotation Engine (Retired)');
    const file = path.join(BASE, 'custom-server.js');
    if (!fs.existsSync(file)) return true;

    let c = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Clean up API routing
    const apiRouting = 'if(requestUrl&&requestUrl.pathname.startsWith("/api/k12-rotation")){return __k12_handleApi(requestUrl,req,res)}\n    ';
    if (c.includes(apiRouting)) {
        c = c.replace(apiRouting, '');
        changed = true;
    }

    // Clean up engine code and timer startup
    if (c.includes('/* K12 Rotation Engine (9router Patch 24) */')) {
        const startMarker = '/* K12 Rotation Engine (9router Patch 24) */';
        const endMarker = 'const standalone = path.join(__dirname, "server.js");';
        const startIndex = c.indexOf(startMarker);
        const endIndex = c.indexOf(endMarker);
        if (startIndex !== -1 && endIndex !== -1) {
            const timerStartup = '\ntry{setTimeout(function(){__k12_loadState();if(__k12_state.enabled){__k12_startTimer();setTimeout(__k12_runRotation,3000)}console.log("[K12 Rotation] Engine initialized (enabled: "+__k12_state.enabled+")")},8000)}catch(e){}\n';
            c = c.substring(0, startIndex) + c.substring(endIndex);
            if (c.includes(timerStartup)) {
                c = c.replace(timerStartup, '');
            }
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Removed legacy K12 rotation engine from custom-server.js');
    } else {
        console.log('  → K12 rotation engine not present in custom-server.js');
    }
    return true;
}

// ============================================================
// PATCH 28: Restore the upstream account selector after retiring tier routing
// ============================================================
function patchDefaultAccountRouting() {
    console.log('[PATCH 28] Default Account Routing');

    const chunksDir = path.join(BUILD, 'server/chunks');
    if (!fs.existsSync(chunksDir)) { console.log('  ✗ Server chunks dir not found'); return false; }

    const changedChunks = [];
    for (const name of fs.readdirSync(chunksDir).filter(name => name.endsWith('.js'))) {
        const file = path.join(chunksDir, name);
        const content = fs.readFileSync(file, 'utf8');
        let result;
        try {
            result = removeInjectedTierFilters(content);
        } catch (error) {
            console.log(`  ✗ ${name}: ${error.message}`);
            return false;
        }
        if (INJECTED_TIER_MARKERS.some(marker => result.content.includes(marker))) {
            console.log(`  ✗ ${name}: injected tier marker remains after cleanup`);
            return false;
        }
        if (result.changed) changedChunks.push({ file, name, content: result.content });
    }

    for (const chunk of changedChunks) {
        fs.writeFileSync(chunk.file, chunk.content, 'utf8');
    }
    if (0 === changedChunks.length) {
        console.log('  → No legacy tier filters found; upstream account selection is unchanged');
        return true;
    }
    console.log(`  ✅ Removed legacy tier filters from ${changedChunks.map(chunk => chunk.name).join(', ')}; upstream account selection restored`);
    return true;
}

// ============================================================
// PATCH 25: K12 Rotation Dashboard UI
// ============================================================
function patchK12RotationDashboard() {
    console.log('[PATCH 25] K12 Rotation Dashboard (Retired)');
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
        'async function __9rFetchAccountTokens(setter)',
        `__9rQuotaGeneration=(0,${aliases.react}.useRef)(0)`,
        `[__9rAccountTokens,__9rSetAccountTokens]=(0,${aliases.react}.useState)({})`,
        'async(e,t,__9rBatch',
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
        'function __9rYield(){return new Promise(e=>setTimeout(e,0))}' +
        'async function __9rFetchAccountTokens(setter){try{let r=await fetch("/api/usage/stats",{cache:"no-store"});if(r.ok){let d=await r.json(),m={};for(let x of Object.values(d?.byAccount||{})){if(x?.connectionId){m[x.connectionId]||(m[x.connectionId]={promptTokens:0,completionTokens:0,totalTokens:0,requests:0,cost:0});m[x.connectionId].promptTokens+=x.promptTokens||0;m[x.connectionId].completionTokens+=x.completionTokens||0;m[x.connectionId].totalTokens+=(x.promptTokens||0)+(x.completionTokens||0);m[x.connectionId].requests+=x.requests||0;m[x.connectionId].cost+=x.cost||0}}setter(m)}}catch(_){}}';
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
        `${aliases.generationRef}=(0,${aliases.react}.useRef)(0),__9rQuotaGeneration=(0,${aliases.react}.useRef)(0),[__9rAccountTokens,__9rSetAccountTokens]=(0,${aliases.react}.useState)({}),${aliases.fetchAccounts}=`,
        'quota generation ref',
    );

    let fetchAnchor = null;
    let fetchReplacement = null;
    const fetchAnchor55 = `${aliases.fetchQuota}=(0,${aliases.react}.useCallback)(async(e,t,{force:r=!1}={})=>{${aliases.loadingSetter}(t=>({...t,[e]:!0})),${aliases.errorSetter}(t=>({...t,[e]:null}));try{console.log(`;
    const fetchAnchor50 = `${aliases.fetchQuota}=(0,${aliases.react}.useCallback)(async(e,t)=>{${aliases.loadingSetter}(t=>({...t,[e]:!0})),${aliases.errorSetter}(t=>({...t,[e]:null}));try{console.log(`;
    if (c.includes(fetchAnchor55)) {
        fetchAnchor = fetchAnchor55;
        fetchReplacement = `${aliases.fetchQuota}=(0,${aliases.react}.useCallback)(async(e,t,__9rBatch,{force:r=!1}={})=>{(__9rBatch&&__9rBatch.loading)?(__9rBatch.loading[e]=!0,__9rBatch.errors[e]=null):(${aliases.loadingSetter}(t=>({...t,[e]:!0})),${aliases.errorSetter}(t=>({...t,[e]:null})));try{__9rBatch||console.log(`;
    } else if (c.includes(fetchAnchor50)) {
        fetchAnchor = fetchAnchor50;
        fetchReplacement = `${aliases.fetchQuota}=(0,${aliases.react}.useCallback)(async(e,t,__9rBatch)=>{(__9rBatch&&__9rBatch.loading)?(__9rBatch.loading[e]=!0,__9rBatch.errors[e]=null):(${aliases.loadingSetter}(t=>({...t,[e]:!0})),${aliases.errorSetter}(t=>({...t,[e]:null})));try{__9rBatch||console.log(`;
    }
    if (fetchAnchor) ensure('async(e,t,__9rBatch', fetchAnchor, fetchReplacement, 'quota fetch batch signature');

    ensure('__9rBatch||console.log(`[ProviderLimits] Got quota', c.includes(',s);') ? 'console.log(`[ProviderLimits] Got quota for ${t}:`,s);' : 'console.log(`[ProviderLimits] Got quota for ${t}:`,a);', c.includes(',s);') ? '__9rBatch||console.log(`[ProviderLimits] Got quota for ${t}:`,s);' : '__9rBatch||console.log(`[ProviderLimits] Got quota for ${t}:`,a);', 'quota success log');

    const authSetter55 = `${aliases.quotaSetter}(t=>({...t,[e]:a})),f(e,a);return`;
    const authSetter50 = `${aliases.quotaSetter}(t=>({...t,[e]:r})),f(e,r);return`;
    if (c.includes(authSetter55)) {
        ensure('__9rBatch?(__9rBatch.quotas[e]=a):', authSetter55, `(__9rBatch&&__9rBatch.quotas)?(__9rBatch.quotas[e]=a):(${aliases.quotaSetter}(t=>({...t,[e]:a})),f(e,a));return`, 'quota auth result');
    } else if (c.includes(authSetter50)) {
        ensure('__9rBatch?(__9rBatch.quotas[e]=r):', authSetter50, `(__9rBatch&&__9rBatch.quotas)?(__9rBatch.quotas[e]=r):(${aliases.quotaSetter}(t=>({...t,[e]:r})),f(e,r));return`, 'quota auth result');
    }

    const successSetter55 = `${aliases.quotaSetter}(t=>({...t,[e]:l})),f(e,l)`;
    const successSetter50 = `${aliases.quotaSetter}(t=>({...t,[e]:i})),f(e,i)`;
    if (c.includes(successSetter55)) {
        ensure('__9rBatch?(__9rBatch.quotas[e]=l):', successSetter55, `(__9rBatch&&__9rBatch.quotas)?(__9rBatch.quotas[e]=l):(${aliases.quotaSetter}(t=>({...t,[e]:l})),f(e,l))`, 'quota success state');
    } else if (c.includes(successSetter50)) {
        ensure('__9rBatch?(__9rBatch.quotas[e]=i):', successSetter50, `(__9rBatch&&__9rBatch.quotas)?(__9rBatch.quotas[e]=i):(${aliases.quotaSetter}(t=>({...t,[e]:i})),f(e,i))`, 'quota success state');
    }

    ensure('__9rBatch?(__9rBatch.errors[e]=', `${aliases.errorSetter}(t=>({...t,[e]:r.message||"Failed to fetch quota"}))`, `(__9rBatch&&__9rBatch.errors)?(__9rBatch.errors[e]=r.message||"Failed to fetch quota"):${aliases.errorSetter}(t=>({...t,[e]:r.message||"Failed to fetch quota"}))`, 'quota error state');
    ensure('__9rBatch?(__9rBatch.loading[e]=!1):', `${aliases.loadingSetter}(t=>({...t,[e]:!1}))`, `(__9rBatch&&__9rBatch.loading)?(__9rBatch.loading[e]=!1):${aliases.loadingSetter}(t=>({...t,[e]:!1}))`, 'quota loading completion');

    if (!c.includes('__9rUsageTimeout=setTimeout(')) {
        if (c.includes('let a=`/api/usage/${e}${r?"?force=1":""}`,i=await fetch(a);')) {
            const timedUsageFetch = 'let __9rUsageController=new AbortController,__9rUsageTimeout=setTimeout(()=>__9rUsageController.abort(),3e4),a=`/api/usage/${e}${r?"?force=1":""}`,i;try{i=await fetch(a,{signal:__9rUsageController.signal})}finally{clearTimeout(__9rUsageTimeout)};';
            c = c.replace('let a=`/api/usage/${e}${r?"?force=1":""}`,i=await fetch(a);', timedUsageFetch);
        } else if (c.includes('let r=await fetch(`/api/usage/${e}`);')) {
            const timedUsageFetch = 'let __9rUsageController=new AbortController,__9rUsageTimeout=setTimeout(()=>__9rUsageController.abort(),3e4),r;try{r=await fetch(`/api/usage/${e}`,{signal:__9rUsageController.signal})}finally{clearTimeout(__9rUsageTimeout)};';
            c = c.replace('let r=await fetch(`/api/usage/${e}`);', timedUsageFetch);
        }
    }

    const batchAnchor = `},[]),${aliases.afterCallback}=`;
    const batchHelper = `},[]),__9rFetchQuotaBatch=(0,${aliases.react}.useCallback)(async(e)=>{let t=++__9rQuotaGeneration.current;for(let r=0;r<e.length;r+=24){if(t!==__9rQuotaGeneration.current)return;let a=e.slice(r,r+24),i={loading:{},errors:{},quotas:{}};await __9rRunQuotaPool(a,e=>t===__9rQuotaGeneration.current?${aliases.fetchQuota}(e.id,e.provider,i):Promise.resolve());if(t!==__9rQuotaGeneration.current)return;__9rQueueQuotaCache(i.quotas);let l=()=>{${aliases.loadingSetter}(e=>({...e,...i.loading})),${aliases.errorSetter}(e=>({...e,...i.errors})),${aliases.quotaSetter}(e=>({...e,...i.quotas}))};"function"==typeof ${aliases.react}.startTransition?(0,${aliases.react}.startTransition)(l):l();await __9rYield()}__9rFetchAccountTokens(__9rSetAccountTokens)},[${aliases.fetchQuota}]),${aliases.afterCallback}=`;
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
// PATCH 26: Quota Card Email Masking & Copy Button
// ============================================================
function patchQuotaCardEmailMasking() {
    console.log('[PATCH 26] Quota Card Email Masking & Copy Button');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }

    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');

    const maskFn = 'var __9rMaskEmail=function(s){if(!s||typeof s!=="string")return s;var at=s.indexOf("@");if(at<0)return s;var u=s.substring(0,at),d=s.substring(at+1);var m=d.match(/(\\.(?:com|net|org|gov|edu|co)\\.[a-z]{2,})$/i)||d.match(/(\\.[a-z]{2,})$/i);var tld=m?m[1]:"";var main=d.slice(0,d.length-tld.length);var p=main.replace(/[^a-zA-Z0-9]/g,"").slice(0,2)||main.slice(0,2);return u+"@"+p+"***"+tld};';

    let modified = false;

    if (!c.includes('__9rMaskEmail')) {
        const xPattern = /function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{return \2\.name\?\.trim\(\)\|\|\2\.email\?\.trim\(\)\|\|\2\.displayName\?\.trim\(\)\|\|null\}/;
        const matchX = c.match(xPattern);
        if (!matchX) {
            console.log('  ✗ Name getter getter x(e) not found');
            return false;
        }

        const dPattern = /function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{return \2\.name\?\.trim\(\)&&\2\.email\?\.trim\(\)&&\2\.name\.trim\(\)!==\2\.email\.trim\(\)\?\2\.email\.trim\(\):\2\.name\?\.trim\(\)&&\2\.displayName\?\.trim\(\)&&\2\.name\.trim\(\)!==\2\.displayName\.trim\(\)\?\2\.displayName\.trim\(\):null\}/;
        const matchD = c.match(dPattern);

        const newX = maskFn + 'function ' + matchX[1] + '(' + matchX[2] + '){return __9rMaskEmail(' + matchX[2] + '.name?.trim()||' + matchX[2] + '.email?.trim()||' + matchX[2] + '.displayName?.trim()||null)}';

        c = c.replace(matchX[0], newX);

        if (matchD) {
            const newD = 'function ' + matchD[1] + '(' + matchD[2] + '){return __9rMaskEmail(' + matchD[2] + '.name?.trim()&&' + matchD[2] + '.email?.trim()&&' + matchD[2] + '.name.trim()!==' + matchD[2] + '.email.trim()?' + matchD[2] + '.email.trim():' + matchD[2] + '.name?.trim()&&' + matchD[2] + '.displayName?.trim()&&' + matchD[2] + '.name.trim()!==' + matchD[2] + '.displayName.trim()?' + matchD[2] + '.displayName.trim():null)}';
            c = c.replace(matchD[0], newD);
        }
        modified = true;
    } else {
        const oldMaskFnPattern = /var __9rMaskEmail=function\(s\)\{.+?\};/;
        if (oldMaskFnPattern.test(c)) {
            c = c.replace(oldMaskFnPattern, maskFn);
        }
    }

    // Add Copy Button next to x(r) and D(r)
    const badCopy1 = 'children:(0,a.jsx)("span",{className:"material-symbols-outlined text-[13px] leading-none",children:"content_copy"})]}):null';
    const badCopy2 = 'children:(0,a.jsx)("span",{className:"material-symbols-outlined text-[12px] leading-none",children:"content_copy"})]}):null';
    if (c.includes(badCopy1)) {
        c = c.replace(badCopy1, 'children:(0,a.jsx)("span",{className:"material-symbols-outlined text-[13px] leading-none",children:"content_copy"})})]}):null');
        modified = true;
    }
    if (c.includes(badCopy2)) {
        c = c.replace(badCopy2, 'children:(0,a.jsx)("span",{className:"material-symbols-outlined text-[12px] leading-none",children:"content_copy"})})]}):null');
        modified = true;
    }

    const copyTarget = 'x(r)?(0,a.jsx)("p",{className:"text-xs text-text-muted truncate",children:x(r)}):null';
    const copyReplacement = 'x(r)?(0,a.jsxs)("div",{className:"flex items-center gap-1 min-w-0 group/copy",children:[(0,a.jsx)("p",{className:"text-xs text-text-muted truncate",children:x(r)}),(0,a.jsx)("button",{type:"button",onClick:e=>{e.stopPropagation();let raw=r.email?.trim()||r.name?.trim()||r.displayName?.trim()||"";if(raw){navigator.clipboard.writeText(raw);let icon=e.currentTarget.querySelector(".material-symbols-outlined");if(icon){icon.textContent="check";e.currentTarget.classList.add("text-emerald-500");setTimeout(()=>{icon.textContent="content_copy";e.currentTarget.classList.remove("text-emerald-500")},1500)}}},className:"shrink-0 p-0.5 text-text-muted/50 hover:text-text-primary transition-colors cursor-pointer",title:"Copy full email",children:(0,a.jsx)("span",{className:"material-symbols-outlined text-[13px] leading-none",children:"content_copy"})})]}):null';

    if (c.includes(copyTarget)) {
        c = c.replace(copyTarget, copyReplacement);
        modified = true;
    }

    const copyTargetD = 'D(r)?(0,a.jsx)("p",{className:"text-[11px] text-text-muted/80 truncate",children:D(r)}):null';
    const copyReplacementD = 'D(r)?(0,a.jsxs)("div",{className:"flex items-center gap-1 min-w-0 group/copy",children:[(0,a.jsx)("p",{className:"text-[11px] text-text-muted/80 truncate",children:D(r)}),(0,a.jsx)("button",{type:"button",onClick:e=>{e.stopPropagation();let raw=r.email?.trim()||r.displayName?.trim()||r.name?.trim()||"";if(raw){navigator.clipboard.writeText(raw);let icon=e.currentTarget.querySelector(".material-symbols-outlined");if(icon){icon.textContent="check";e.currentTarget.classList.add("text-emerald-500");setTimeout(()=>{icon.textContent="content_copy";e.currentTarget.classList.remove("text-emerald-500")},1500)}}},className:"shrink-0 p-0.5 text-text-muted/50 hover:text-text-primary transition-colors cursor-pointer",title:"Copy email",children:(0,a.jsx)("span",{className:"material-symbols-outlined text-[12px] leading-none",children:"content_copy"})})]}):null';

    if (c.includes(copyTargetD)) {
        c = c.replace(copyTargetD, copyReplacementD);
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Masked card email/name and added copy button on Quota page');
        return true;
    }

    if (c.includes('content_copy') && c.includes('__9rMaskEmail')) {
        console.log('  → Already patched');
        return true;
    }

    console.log('  ✗ Quota email copy button target not found');
    return false;
}

// ============================================================
// PATCH 27: Cycle/Window Tokens & Quota Row Layout
// ============================================================
function patchQuotaRowLayout() {
    console.log('[PATCH 27] Cycle/Window Tokens & Quota Row Layout');

    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ File not found'); return false; }

    const file = path.join(dir, pageFile);
    let c = fs.readFileSync(file, 'utf8');

    let modified = false;

    // 1. Compact width for label column
    const original = 'className:"flex w-36 min-w-0 items-center gap-1.5"';
    const compact = 'className:"flex min-w-0 items-center gap-1.5",style:{width:"clamp(4.5rem,32%,9rem)"}';
    if (c.includes(original)) {
        c = c.replace(original, compact);
        modified = true;
    }

    // 2. Attach connectionId to card quotas
    if (c.includes('g=o?.quotas||[]')) {
        c = c.replace('g=o?.quotas||[]', 'g=(o?.quotas||[]).map(q=>({...q,connectionId:r.id}))');
        modified = true;
    }

    // 3. Preserve windowSeconds in Codex quota transformer
    const codexOrig = 'case"codex":t.quotas&&Object.entries(t.quotas).forEach(([e,t])=>{r.push({name:e,used:t.used||0,total:t.total||0,remaining:t.remaining,resetAt:t.resetAt||null})});break;';
    const codexNew = 'case"codex":t.quotas&&Object.entries(t.quotas).forEach(([e,t])=>{r.push({name:e,used:t.used||0,total:t.total||0,remaining:t.remaining,resetAt:t.resetAt||null,windowSeconds:t.windowSeconds})});break;';
    if (c.includes(codexOrig)) {
        c = c.replace(codexOrig, codexNew);
        modified = true;
    }

    // 4. Format Quota Name (Session Window, Weekly Window, Code Review)
    const nameOrig = 'children:e.name})]';
    const nameNew = 'children:e.name==="session"?"Session Window":e.name==="weekly"?"Weekly Window":e.name==="review"||e.name==="code_review"?"Code Review":e.name})]';
    if (c.includes(nameOrig)) {
        c = c.replace(nameOrig, nameNew);
        modified = true;
    }

    // 5. Format Subline (Tokens: used / total, Window: Xh Ym, % remaining)
    const sublineOrig = 'children:[(0,a.jsxs)("span",{className:"text-text-muted truncate",title:`${e.used.toLocaleString()} / ${e.total>0?e.total.toLocaleString():"∞"}`,children:[e.used.toLocaleString()," / ",e.total>0?e.total.toLocaleString():"∞"]}),(0,a.jsxs)("span",{className:`font-medium ${i.text} shrink-0`,children:[e.remaining,"%"]})]';
    const sublineNew = 'children:(()=>{' +
        'let fTok=n=>n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(1)+"k":String(n);' +
        'let tokData=(typeof __9rAccountTokens!=="undefined"&&__9rAccountTokens)?__9rAccountTokens[e.connectionId]:null;' +
        'let uTok=e.usedTokens||tokData?.totalTokens||0;' +
        'let tokLabel=(uTok>0&&e.used>0)?"Tokens: "+fTok(uTok)+" / "+fTok(e.totalTokens||Math.round(uTok/(e.used/100))):"Used: "+(e.used!==void 0?e.used+"%":"100%");' +
        'let winLabel=e.windowSeconds?"Window: "+Math.floor(e.windowSeconds/3600)+"h "+Math.floor((e.windowSeconds%3600)/60)+"m":null;' +
        'return [(0,a.jsx)("span",{className:"text-red-500/90 dark:text-red-400 font-medium truncate",children:tokLabel}),' +
        'winLabel&&(0,a.jsx)("span",{className:"text-text-muted/80 text-[10px] hidden md:inline truncate",children:winLabel}),' +
        '(0,a.jsxs)("span",{className:`font-medium ${i.text} shrink-0`,children:[e.remaining,"%"]})]' +
        '})()';
    if (c.includes(sublineOrig)) {
        c = c.replace(sublineOrig, sublineNew);
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(file, c, 'utf8');
        console.log('  ✅ Applied cycle/window tokens and layout to Quota page');
        return true;
    }

    if (c.includes(compact) && c.includes('Session Window')) {
        console.log('  → Already patched');
        return true;
    }

    console.log('  ✗ Quota-row layout target patterns not found');
    return false;
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
// PATCH 29: Codex Usage Window Normalization (Session + Weekly)
// ============================================================
function patchCodexUsageWindows() {
    console.log('[PATCH 29] Codex Usage Window Normalization (Session + Weekly)');

    const chunksDir = path.join(BUILD, 'server/chunks');
    if (!fs.existsSync(chunksDir)) { console.log('  ✗ Server chunks dir not found'); return false; }
    
    const candidates = fs.readdirSync(chunksDir)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(chunksDir, file))
        .filter(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('function j(a,b,c){') &&
                content.includes('d.primary_window||d.primary') &&
                content.includes('d.secondary_window||d.secondary');
        });

    if (candidates.length === 0) {
        console.log('  ✗ No matching chunk found for Codex usage windows');
        return false;
    }

    let patchedCount = 0;
    for (const file of candidates) {
        let content = fs.readFileSync(file, 'utf8');
        let modified = false;

        const iPattern = /function i\(a\)\{let b=Math\.max\(0,Math\.min\(100,\(0,e\.IQ\)\(a\?\.used_percent\?\?a\?\.percent_used,0\)\)\);return\{used:b,total:100,remaining:Math\.max\(0,100-b\),resetAt:\(0,e\.eZ\)\(a\?\.reset_at\?\?a\?\.resets_at\?\?a\?\.resetAt\?\?null\),unlimited:!1\}\}/;
        const iReplacement = 'function i(a){let b=Math.max(0,Math.min(100,(0,e.IQ)(a?.used_percent??a?.percent_used,0))),w=Number(a?.limit_window_seconds||0);return{used:b,total:100,remaining:Math.max(0,100-b),resetAt:(0,e.eZ)(a?.reset_at??a?.resets_at??a?.resetAt??null),unlimited:!1,windowSeconds:w>0?w:void 0}}';
        if (iPattern.test(content)) {
            content = content.replace(iPattern, iReplacement);
            modified = true;
        }

        const targetPattern = /function j\(a,b,c\)\{let d=h\(c\);if\(!d\)return!1;let e=d\.primary_window\|\|d\.primary\|\|c\.primary_window\|\|c\.primary,f=d\.secondary_window\|\|d\.secondary\|\|c\.secondary_window\|\|c\.secondary,g=!1;return e&&\(a\[b\?`\$\{b\}_session`:"session"\]=i\(e\),g=!0\),f&&\(a\[b\?`\$\{b\}_weekly`:"weekly"\]=i\(f\),g=!0\),g\}/;
        const replacement = 'function j(a,b,c){let d=h(c);if(!d)return!1;let e=d.primary_window||d.primary||c.primary_window||c.primary,f=d.secondary_window||d.secondary||c.secondary_window||c.secondary,g=!1;if(e&&f){a[b?`${b}_session`:"session"]=i(e),a[b?`${b}_weekly`:"weekly"]=i(f),g=!0}else if(e&&!f){let p=i(e),w=Number(e.limit_window_seconds||0);w>86400&&w<=1209600?a[b?`${b}_weekly`:"weekly"]=p:a[b?`${b}_session`:"session"]=p,g=!0}else if(!e&&f){let p=i(f);a[b?`${b}_weekly`:"weekly"]=p,g=!0}return g}/*__9r_codex_usage_windows_v1__*/';

        if (targetPattern.test(content)) {
            content = content.replace(targetPattern, replacement);
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(file, content, 'utf8');
            console.log(`  ✅ Patched usage window mapping in ${path.basename(file)}`);
            patchedCount++;
        } else if (content.includes('__9r_codex_usage_windows_v1__')) {
            console.log(`  → ${path.basename(file)} already patched`);
            patchedCount++;
        }
    }

    return patchedCount > 0;
}

// ============================================================
// PATCH 30: 1-Click Update Manager UI & Modal
// ============================================================
function patchUpdateManagerUI() {
    console.log('[PATCH 30] 1-Click Update Manager UI & Modal');
    const dir = path.join(BUILD, 'static/chunks/app/(dashboard)/dashboard/quota');
    if (!fs.existsSync(dir)) { console.log('  ✗ Quota dir not found'); return false; }
    const pageFile = fs.readdirSync(dir).find(f => f.startsWith('page-') && f.endsWith('.js'));
    if (!pageFile) { console.log('  ✗ Quota page chunk not found'); return false; }

    const fullPath = path.join(dir, pageFile);
    let c = fs.readFileSync(fullPath, 'utf8');

    // 1. Inject Update Button into Quota Toolbar
    const updateBtn = ',(0,a.jsxs)("button",{type:"button",onClick:()=>window.__9rOpenUpdateModal&&window.__9rOpenUpdateModal(),className:"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400 cursor-pointer shadow-sm",title:"Quản lý & Cập nhật 9Router",children:[(0,a.jsx)("span",{className:"material-symbols-outlined text-[14px]",children:"system_update"}),(0,a.jsx)("span",{className:"hidden sm:inline",children:"⚡ Cập nhật"})]})';
    
    const planToggleAnchor = '(0,a.jsx)("span",{className:"hidden sm:inline",children:"T\\u1eaft/B\\u1eadt theo G\\u00f3i"})]})';
    const planToggleAnchorRaw = '(0,a.jsx)("span",{className:"hidden sm:inline",children:"Tắt/Bật theo Gói"})]})';
    const legacyK12Anchor = 'children:"K12 Rotation"})]})';

    let targetAnchor = null;
    if (c.includes(planToggleAnchor)) targetAnchor = planToggleAnchor;
    else if (c.includes(planToggleAnchorRaw)) targetAnchor = planToggleAnchorRaw;
    else if (c.includes(legacyK12Anchor)) targetAnchor = legacyK12Anchor;

    if (targetAnchor && !c.includes('Quản lý & Cập nhật 9Router')) {
        c = c.replace(targetAnchor, targetAnchor + updateBtn);
    }

    // 2. Inject Modal Client Script at the end of the chunk
    const updateModalScript = getUpdateModalScript();
    if (!c.includes('__9rUpdateManagerInitialized')) {
        c += '\n' + updateModalScript + '\n';
    }

    fs.writeFileSync(fullPath, c, 'utf8');

    // 3. Patch Sidebar chunk so "Update now" opens our modal!
    const staticChunksDir = path.join(BUILD, 'static/chunks');
    if (fs.existsSync(staticChunksDir)) {
        const sidebarFiles = fs.readdirSync(staticChunksDir)
            .filter(f => f.endsWith('.js') && f.startsWith('5497-'))
            .map(f => path.join(staticChunksDir, f));

        for (const sf of sidebarFiles) {
            let sc = fs.readFileSync(sf, 'utf8');
            const oldClick = 'onClick:()=>W(!0),className:"px-2 py-1 rounded bg-green-600 hover:bg-green-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors cursor-pointer",children:"Update now"';
            const newClick = 'onClick:()=>{if(window.__9rOpenUpdateModal){window.__9rOpenUpdateModal()}else{W(!0)}},className:"px-2 py-1 rounded bg-green-600 hover:bg-green-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors cursor-pointer",children:"Update now"';
            if (sc.includes(oldClick)) {
                sc = sc.replace(oldClick, newClick);
                if (!sc.includes('__9rUpdateManagerInitialized')) {
                    sc += '\n' + updateModalScript + '\n';
                }
                fs.writeFileSync(sf, sc, 'utf8');
                console.log('  ✅ Patched Sidebar update button to open 1-Click Update Modal');
            }
        }
    }

    console.log('  ✅ Injected 1-Click Update Manager UI & Modal');
    return true;
}

// ============================================================
// RUN
// ============================================================
const PATCH_DEFINITIONS = [
    { id: 0, name: 'SSR Restore', scope: 'dashboard', targets: ['server/app/(dashboard)/dashboard/quota/page.js'], run: restoreServerSsrBypass },
    { id: 1, name: 'Bulk Import', scope: 'dashboard', targets: ['server/app/api/oauth/codex/bulk-import/route.js'], run: patchBulkImport },
    { id: 18, name: 'API UI Redirect', scope: 'api', targets: ['custom-server.js'], run: patchApiDashboardRedirect },
    { id: 24, name: 'K12 Engine', scope: 'api', targets: ['custom-server.js'], run: patchK12RotationEngine },
    { id: 28, name: 'Default Account Routing', scope: 'api', targets: ['server/chunks/*.js'], sources: ['default-account-routing.js'], run: patchDefaultAccountRouting },
    { id: 29, name: 'Codex Usage Windows', scope: 'api', targets: ['server/chunks/*.js'], run: patchCodexUsageWindows },
    { id: 2, name: 'Providers', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/providers/page-*.js'], run: patchProvidersPage },
    { id: 3, name: 'Quota', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'server/app/(dashboard)/dashboard/quota/page.js'], run: patchQuotaPage },
    { id: 19, name: 'Quota Pagination', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'server/app/(dashboard)/dashboard/quota/page.js'], run: patchQuotaPaginationNormalization },
    { id: 4, name: 'AutoPing', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/providers/[id]/page-*.js'], sources: ['provider-detail-patch.js'], run: patchAutoPingEnable },
    { id: 5, name: 'Quota Bulk', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPageBulk },
    { id: 6, name: 'Detail Bulk', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/providers/[id]/page-*.js'], sources: ['provider-detail-patch.js'], run: patchDetailPageBulk },
    { id: 7, name: 'Weekly Filter', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPageWeeklyFilter },
    { id: 22, name: 'Session Filter', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPageSessionFilter },
    { id: 8, name: 'Plan Badge', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPlanBadge },
    { id: 9, name: 'Plan Filter', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaPlanFilter },
    { id: 10, name: 'Reset Time', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaResetTime },
    { id: 11, name: 'Priority', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchBulkPriorityReassign },
    { id: 21, name: 'Smart Priority', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchSmartPrioritySort },
    { id: 23, name: 'Plan Toggle', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchBulkToggleByPlan },
    { id: 25, name: 'K12 Dashboard', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchK12RotationDashboard },
    { id: 30, name: 'Update Manager', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js', 'static/chunks/5497-*.js'], sources: ['update-manager-patch.js'], run: patchUpdateManagerUI },
    { id: 26, name: 'Card Masking', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaCardEmailMasking },
    { id: 27, name: 'Quota Row Layout', scope: 'dashboard', targets: ['static/chunks/app/(dashboard)/dashboard/quota/page-*.js'], run: patchQuotaRowLayout },
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
            .map(definition => {
                const sourcePayload = (definition.sources || []).map(source => {
                    const sourceFile = path.join(__dirname, source);
                    return `\nSOURCE:${source}\n${fs.readFileSync(sourceFile, 'utf8')}`;
                }).join('');
                return JSON.stringify({
                    id: definition.id,
                    name: definition.name,
                    scope: definition.scope,
                    targets: definition.targets,
                    sources: definition.sources || [],
                }) + '\n' + definition.run.toString() + sourcePayload;
            })
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
        const pkgPath = fs.existsSync(path.join(BASE, 'package.json')) ? path.join(BASE, 'package.json') : (fs.existsSync(path.join(BASE, '..', 'package.json')) ? path.join(BASE, '..', 'package.json') : null);
        const ver = pkgPath ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version : '0.5.59';
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
