"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function resolveDashboardAppRoot() {
    if (process.env.NINE_ROUTER_APP) return process.env.NINE_ROUTER_APP;

    const stageStatePath = path.join(__dirname, "automation/state/dashboard-stage.json");
    if (fs.existsSync(stageStatePath)) {
        const stage = JSON.parse(fs.readFileSync(stageStatePath, "utf8"));
        if (stage.appRoot && fs.existsSync(stage.appRoot)) return stage.appRoot;
    }

    return path.join(process.env.APPDATA || "", "npm/node_modules/9router/app");
}

const appRoot = resolveDashboardAppRoot();

function findQuotaChunk() {
    const quotaDir = path.join(
        appRoot,
        ".next-cli-build/static/chunks/app/(dashboard)/dashboard/quota",
    );
    const chunks = fs.readdirSync(quotaDir).filter(
        (file) => file.startsWith("page-") && file.endsWith(".js"),
    );
    assert.equal(chunks.length, 1, `Expected one quota client chunk in ${quotaDir}`);
    return path.join(quotaDir, chunks[0]);
}

function findProviderDetailChunk() {
    const detailDir = path.join(
        appRoot,
        ".next-cli-build/static/chunks/app/(dashboard)/dashboard/providers/[id]",
    );
    const chunks = fs.readdirSync(detailDir).filter(
        (file) => file.startsWith("page-") && file.endsWith(".js"),
    );
    assert.equal(chunks.length, 1, `Expected one provider detail chunk in ${detailDir}`);
    return path.join(detailDir, chunks[0]);
}

function extractNamedFunction(source, name) {
    let start = source.indexOf(`function ${name}(`);
    if (start < 0) return null;
    if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6;

    const bodyStart = source.indexOf("{", start);
    if (bodyStart < 0) return null;

    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "{") depth += 1;
        if (char === "}" && --depth === 0) return source.slice(start, index + 1);
    }
    return null;
}

test("patched quota component keeps pagination state variables declared", () => {
    const sandbox = { self: { webpackChunk_N_E: [] }, console, _N_E: null };
    vm.runInNewContext(fs.readFileSync(findQuotaChunk(), "utf8"), sandbox);

    const modules = sandbox.self.webpackChunk_N_E[0][1];
    const quotaFactory = Object.values(modules).find((factory) =>
        factory.toString().includes("No Accounts Match Current Filters"),
    );
    assert.ok(quotaFactory, "Quota component module not found in client chunk");

    const exports = {};
    let useStateCalls = 0;
    const react = {
        useState: (value) => {
            useStateCalls += 1;
            return [useStateCalls === 1 && value === false ? true : value, () => {}];
        },
        useMemo: (factory) => factory(),
        useRef: (value) => ({ current: value }),
        useCallback: (callback) => callback,
        useEffect: () => {},
    };

    function webpackRequire(id) {
        if (id === 12115) return react;
        if (id === 11059) return { C: () => ({ copied: null, copy: () => {} }) };
        if (id === 24620) return { KC: () => [] };
        if (id === 88105) return { wb: [] };
        return new Proxy(() => null, { get: () => () => null });
    }
    webpackRequire.d = (target, map) => {
        for (const [key, getter] of Object.entries(map)) {
            Object.defineProperty(target, key, { get: getter });
        }
    };

    quotaFactory({}, exports, webpackRequire);
    assert.doesNotThrow(() => exports.default());
});

test("all quota references use the client content cache key", () => {
    const chunkPath = findQuotaChunk();
    const contentHash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(chunkPath))
        .digest("hex")
        .slice(0, 16);
    const buildRoot = path.join(appRoot, ".next-cli-build");
    const chunkRef = `static/chunks/app/(dashboard)/dashboard/quota/${path.basename(chunkPath)}`;
    const expectedRef = `${chunkRef}?v=${contentHash}`;
    const refPattern = /static\/chunks\/app\/\(dashboard\)\/dashboard\/quota\/page-[^"\\]+\.js(?:\?v=[a-f0-9]{16})?/g;
    const references = [];

    function scan(target) {
        if (!fs.existsSync(target)) return;
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(target)) scan(path.join(target, entry));
            return;
        }
        if (![".html", ".js", ".json", ".rsc"].includes(path.extname(target))) return;
        const matches = fs.readFileSync(target, "utf8").match(refPattern) || [];
        for (const reference of matches) references.push({ fullPath: target, reference });
    }
    for (const target of [
        path.join(buildRoot, "server/app/(dashboard)/dashboard/quota/page_client-reference-manifest.js"),
        path.join(buildRoot, "server/app/dashboard/quota.html"),
        path.join(buildRoot, "server/app/dashboard/quota.rsc"),
        path.join(buildRoot, "server/app/dashboard/quota.segments"),
    ]) scan(target);

    assert.ok(references.length >= 5, "Expected quota references in manifest and prerender artifacts");
    for (const { fullPath, reference } of references) {
        assert.equal(reference, expectedRef, `Stale quota chunk reference in ${fullPath}`);
    }
});

test("quota server bundle keeps the upstream SSR child enabled", () => {
    const serverPage = path.join(
        appRoot,
        ".next-cli-build/server/app/(dashboard)/dashboard/quota/page.js",
    );
    const content = fs.readFileSync(serverPage, "utf8");

    assert.doesNotMatch(content, /children:null/);
    assert.match(content, /children:\(0,d\.jsx\)\(g\.default,\{\}\)/);
});

test("quota client and server default to 500 accounts per page", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const serverPage = path.join(
        appRoot,
        ".next-cli-build/server/app/(dashboard)/dashboard/quota/page.js",
    );
    const server = fs.readFileSync(serverPage, "utf8");

    for (const [label, bundle] of [["client", client], ["server", server]]) {
        assert.doesNotMatch(bundle, /useState\)\((?:20|100)\)/, `${label} still uses the old page size`);
        assert.doesNotMatch(bundle, /useState\)\(String\((?:20|100)\)\)/, `${label} still uses the old custom page size`);
        assert.doesNotMatch(bundle, /pageSize:(?:20|100)/, `${label} still uses the old pagination size`);
        assert.match(bundle, /useState\)\(300\)/, `${label} countdown is not five minutes`);
        assert.match(bundle, /useState\)\(500\)/, `${label} page size is not 500`);
        assert.match(bundle, /useState\)\(String\(500\)\)/, `${label} custom page size is not 500`);
        assert.match(bundle, /pageSize:500/, `${label} pagination state is not 500`);
        assert.match(bundle, /\[50,100,200,500\]/, `${label} page-size options are missing`);
    }

    assert.doesNotMatch(client, /setInterval\(\(\)=>\{?[\w$]+\(\)\}?,6e4\)/, "quota refresh still runs every minute");
    assert.ok(
        (client.match(/setInterval\(\(\)=>\{?[\w$]+\(\)\}?,3e5\)/g) || []).length >= 2,
        "quota refresh intervals are not both five minutes",
    );
    assert.doesNotMatch(client, /(?:Q|Z)\(60\)/, "client refresh countdown still resets to 60 seconds");
    assert.match(client, /(?:Q|Z)\(300\)/, "client refresh countdown does not reset to five minutes");
    assert.doesNotMatch(server, /(?:S\(!0\),U|U\(!0\),W)\(60\)/, "server refresh countdown still resets to 60 seconds");
    assert.match(server, /(?:S\(!0\),U|U\(!0\),W)\(300\)/, "server refresh countdown does not reset to five minutes");
});

test("provider AutoPing keeps the route provider id separate from fetch response locals", () => {
    const detail = fs.readFileSync(findProviderDetailChunk(), "utf8");
    if (detail.includes("__9rEnableProviderAutoPing=async()=>{")) {
        const start = detail.indexOf("__9rEnableProviderAutoPing=async()=>{");
        const endMarker = "},tI=async()=>{await __9rEnableProviderAutoPing();";
        const end = detail.indexOf(endMarker, start);
        assert.ok(end > start, "modern patched AutoPing callback is incomplete");
        const callback = detail.slice(start, end + 1);
        const provider = callback.match(/if\(M\[([A-Za-z_$][\w$]*)\]\)/);
        assert.ok(provider, "modern AutoPing callback does not bind the route provider");
        assert.match(callback, new RegExp(`e\\.provider===${provider[1]}`));
        assert.doesNotMatch(
            callback,
            new RegExp(`let ${provider[1]}=`),
            "route provider id must not be shadowed by a response local",
        );
        assert.match(detail, /onSuccess:async\(\)=>\{await __9rEnableProviderAutoPing\(\)/);
        return;
    }

    const start = detail.indexOf("tT=async()=>{");
    const endMarker = 'Auto-ping enable error:",e)}T(!1)}';
    const end = detail.indexOf(endMarker, start);

    assert.ok(start >= 0 && end > start, "patched AutoPing success callback is missing");
    const callback = detail.slice(start, end + endMarker.length);
    assert.match(callback, /const __9rProviderId=[\w$]+;/);
    assert.match(callback, /M\[__9rProviderId\]/);
    assert.match(callback, /e\.provider===__9rProviderId/);
    assert.doesNotMatch(callback, /let __9rProviderId=/, "provider id must not be shadowed by a response local");
});

test("provider detail keeps custom bulk actions after upstream layout changes", () => {
    const detail = fs.readFileSync(findProviderDetailChunk(), "utf8");
    assert.match(detail, /bulkDelete401=/);
    assert.match(detail, /bulkDeactivate0Weekly=/);
    assert.match(detail, /bulkActivateWeekly=/);
    assert.match(detail, /children:"Tắt 0% token"/);
    assert.match(detail, /children:"Bật >0% Weekly"/);
});

test("quota refresh limits concurrency and batches 500-account state updates", async () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const poolMatch = client.match(
        /async function __9rRunQuotaPool\(e,t,r=8\)\{[\s\S]*?\}(?=function __9rYield)/,
    );

    assert.ok(poolMatch, "bounded quota worker pool is missing");
    const sandbox = {};
    vm.runInNewContext(`${poolMatch[0]};this.pool=__9rRunQuotaPool`, sandbox);

    let active = 0;
    let peak = 0;
    let completed = 0;
    await sandbox.pool(Array.from({ length: 500 }), async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        completed += 1;
    });

    assert.equal(completed, 500);
    assert.ok(peak <= 8, `quota refresh concurrency reached ${peak}`);
    assert.match(client, /__9rFetchQuotaBatch=.*?for\(let [a-zA-Z_$][\w$]*=0;[a-zA-Z_$][\w$]*<e\.length;[a-zA-Z_$][\w$]*\+=24\)/);
    assert.match(client, /await __9rFetchQuotaBatch\(a\.filter\(/);
    assert.match(client, /await __9rFetchQuotaBatch\(e\)/);
    assert.doesNotMatch(client, /await Promise\.all\([^)]*\.map\(e=>eK\(e\.id,e\.provider\)\)\)/);
});

test("quota refresh times out stalled requests and blocks duplicate card refreshes", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");

    assert.match(client, /__9rUsageTimeout=setTimeout\(\(\)=>__9rUsageController\.abort\(\),3e4\)/);
    assert.match(client, /fetch\(\`\/api\/usage\/\$\{e\}\`,\{signal:__9rUsageController\.signal\}\)/);
    assert.match(client, /(?:W\(!0\),Z|Y\(!0\),et)\(!0\);try\{/);
    assert.equal((client.match(/disabled:(?:V|Q)\|\|d\|\|b/g) || []).length, 2);
    assert.doesNotMatch(client, /disabled:d\|\|b/);
});

test("quota refresh debounces cache writes and skips off-screen card rendering", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");

    assert.match(client, /__9rQuotaCacheTimer/);
    assert.match(client, /setTimeout\(\(\)=>\{try\{window\.localStorage\.setItem\([A-Za-z_$][\w$]*,JSON\.stringify\(__9rQuotaCache\)\)/);
    assert.doesNotMatch(client, /function f\(e,t\)\{try\{let r=g\(\)/);
    assert.match(client, /style:\{contentVisibility:"auto",contain:"layout paint style",containIntrinsicSize:"420px"\}/);
});

test("zero-token bulk action prefers usable weekly quota and falls back to session quota", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const deactivateStart = client.indexOf("const bulkDeactivate0Weekly=async()=>{");
    const activateStart = client.indexOf("const bulkActivateWeekly=async()=>{", deactivateStart);
    const actionsEnd = client.indexOf("const bulkPriorityReassign=async()=>{", activateStart);

    assert.ok(deactivateStart >= 0 && activateStart > deactivateStart && actionsEnd > activateStart);
    const deactivate = client.slice(deactivateStart, activateStart);
    const activate = client.slice(activateStart, actionsEnd);
    const getRemaining = client.match(
        /const getRemaining=\(q\)=>\{\s*if\(!q\)return null;[\s\S]*?return null;\s*\};/,
    );
    const selector = deactivate.match(
        /const weekly=qList\.find\([\s\S]*?return remaining===0;/,
    );

    assert.ok(getRemaining, "safe remaining helper is missing");
    assert.ok(selector, "usable weekly-to-session selector is missing");
    assert.doesNotMatch(activate, /includes\("session"\)/, "weekly activation must not use session quota");

    const sandbox = {};
    vm.runInNewContext(
        `${getRemaining[0]};this.shouldDeactivate=(qList)=>{${selector[0]}}`,
        sandbox,
    );
    assert.equal(sandbox.shouldDeactivate([
        { name: "Weekly Limit", remaining: 0 },
        { name: "Session Token", remaining: 80 },
    ]), true);
    assert.equal(sandbox.shouldDeactivate([
        { name: "Weekly Limit", total: 0, used: 0 },
        { name: "Session Token", remaining: 0 },
    ]), true);
    assert.equal(sandbox.shouldDeactivate([
        { name: "Weekly Limit", remaining: 30 },
        { name: "Session Token", remaining: 0 },
    ]), false);
    assert.equal(sandbox.shouldDeactivate([
        { name: "Session Token", remaining: 10 },
    ]), false);
    assert.equal(sandbox.shouldDeactivate([
        { name: "Daily Limit", remaining: 0 },
    ]), false);

    assert.match(client, /children:"Tắt 0% token"/);
    assert.match(client, /0% token remaining/);
    assert.doesNotMatch(client, /children:"Tắt 0% Weekly"/);
});

test("quota applies an independent All Session % threshold before the plan filter", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const filterSource = extractNamedFunction(client, "__9rFilterByQuotaRemaining");

    assert.ok(filterSource, "session/weekly quota filter helper is missing");
    const sandbox = {};
    vm.runInNewContext(`${filterSource};this.filterQuota=__9rFilterByQuotaRemaining`, sandbox);

    const accounts = [
        { id: "k-high" },
        { id: "k-low" },
        { id: "plus-derived" },
        { id: "missing-session" },
    ];
    const quotaMap = {
        "k-high": { plan: "k12", quotas: [
            { name: "Weekly Limit", remaining: 80 },
            { name: "Session Token", remaining: 60 },
        ] },
        "k-low": { plan: "k12", quotas: [
            { name: "Weekly Limit", remaining: 80 },
            { name: "Session Token", remainingPercentage: 20 },
        ] },
        "plus-derived": { plan: "plus", quotas: [
            { name: "Weekly Limit", remaining: 20 },
            { name: "Session Token", total: 100, used: 70 },
        ] },
        "missing-session": { plan: "k12", quotas: [
            { name: "Weekly Limit", remaining: 90 },
        ] },
    };

    assert.deepEqual(
        Array.from(sandbox.filterQuota(accounts, quotaMap, "session", "all"), (item) => item.id),
        accounts.map((item) => item.id),
        "All Session % must not exclude accounts with missing session data",
    );
    assert.deepEqual(
        Array.from(sandbox.filterQuota(accounts, quotaMap, "session", "25"), (item) => item.id),
        ["k-high", "plus-derived"],
        "session threshold must support remaining, remainingPercentage, and total/used values",
    );
    const weeklyFiltered = sandbox.filterQuota(accounts, quotaMap, "weekly", "50");
    assert.deepEqual(
        Array.from(sandbox.filterQuota(weeklyFiltered, quotaMap, "session", "25"), (item) => item.id),
        ["k-high"],
        "weekly and session thresholds must compose independently",
    );

    assert.match(client, /"aria-label":"Filter by session remaining percentage"/);
    for (const [value, label] of [
        ["all", "All Session %"],
        ["0", "> 0% Session"],
        ["10", "> 10% Session"],
        ["25", "> 25% Session"],
        ["50", "> 50% Session"],
        ["75", "> 75% Session"],
    ]) {
        assert.match(
            client,
            new RegExp(`value:"${value}",children:"${label.replace(/[>]/g, "\\>")}"`),
            `missing session threshold option ${label}`,
        );
    }
    assert.match(
        client,
        /sessionFilteredEZ=.*__9rFilterByQuotaRemaining\(filteredEZ,[A-Za-z_$][\w$]*,"session",[A-Za-z_$][\w$]*\)/,
        "session filter must consume the weekly-filtered list",
    );
    assert.match(
        client,
        /planFilteredEZ=.*sessionFilteredEZ\.filter\(/,
        "plan filter must consume the session-filtered list",
    );
    assert.match(
        client,
        /sessionFilteredEZ\.forEach\(/,
        "available plan choices must be derived after the session filter",
    );
});

test("Smart Priority activates the preferred plan and assigns deterministic session ordering", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const builderSource = extractNamedFunction(client, "__9rBuildSmartPriorityPlan");

    assert.ok(builderSource, "Smart Priority planning helper is missing");
    const sandbox = {};
    vm.runInNewContext(`${builderSource};this.buildPlan=__9rBuildSmartPriorityPlan`, sandbox);

    const accounts = [
        { id: "k-missing-b", isActive: true, priority: 9 },
        { id: "plus-high", isActive: true, priority: 8 },
        { id: "k-low", isActive: false, priority: 7 },
        { id: "k-missing-a", isActive: true, priority: 6 },
        { id: "k-high", isActive: false, priority: 5 },
        { id: "unknown-plan", isActive: true, priority: 4 },
    ];
    const quotaMap = {
        "k-high": { plan: "K12", quotas: [{ name: "Session Token", remaining: 80 }] },
        "k-low": { plan: "k12", quotas: [{ name: "Session Token", remainingPercentage: 20 }] },
        "k-missing-a": { plan: "K12", quotas: [{ name: "Weekly Limit", remaining: 70 }] },
        "k-missing-b": { plan: "k12", quotas: [] },
        "plus-high": { plan: "Plus", quotas: [{ name: "Session Token", total: 100, used: 5 }] },
        "unknown-plan": { plan: "unknown", quotas: [{ name: "Session Token", remaining: 99 }] },
    };
    const simplify = (result) => JSON.parse(JSON.stringify(result)).map((item) => ({
        id: item.id,
        priority: item.priority,
        isActive: item.isActive,
        sessionRemaining: item.sessionRemaining,
    }));

    assert.deepEqual(simplify(sandbox.buildPlan(accounts, quotaMap, {
        preferredPlan: "k12",
        activationMode: "preferred-only",
        sessionOrder: "desc",
    })), [
        { id: "k-high", priority: 5, isActive: true, sessionRemaining: 80 },
        { id: "k-low", priority: 6, isActive: true, sessionRemaining: 20 },
        { id: "k-missing-a", priority: 7, isActive: true, sessionRemaining: null },
        { id: "k-missing-b", priority: 8, isActive: true, sessionRemaining: null },
        { id: "plus-high", priority: 9, isActive: false, sessionRemaining: 95 },
    ]);
    assert.deepEqual(
        simplify(sandbox.buildPlan(accounts, quotaMap, {
            preferredPlan: "k12",
            activationMode: "preferred-only",
            sessionOrder: "asc",
        })).map((item) => item.id),
        ["k-low", "k-high", "k-missing-a", "k-missing-b", "plus-high"],
        "ascending mode must keep missing session values last with a deterministic id tie-break",
    );
    const reversedPreference = simplify(sandbox.buildPlan(accounts, quotaMap, {
        preferredPlan: "plus",
        activationMode: "preferred-only",
        sessionOrder: "desc",
    }));
    assert.equal(reversedPreference[0].id, "plus-high");
    assert.equal(reversedPreference[0].isActive, true);
    assert.ok(reversedPreference.slice(1).every((item) => item.isActive === false));
    assert.deepEqual(reversedPreference.map((item) => item.priority), [5, 6, 7, 8, 9]);
    assert.throws(
        () => sandbox.buildPlan([
            { id: "a", priority: 1 },
            { id: "b", priority: 1 },
        ], {
            a: { plan: "k12", quotas: [] },
            b: { plan: "plus", quotas: [] },
        }, {
            preferredPlan: "k12",
            activationMode: "priority-only",
            sessionOrder: "desc",
        }),
        /unique integer priority slots/,
        "Smart Priority must block ambiguous priority slots before mutation",
    );

    assert.match(client, /children:"Smart Priority"/);
    assert.match(client, /"aria-label":"Preferred plan for smart priority"/);
    assert.match(client, /children:"Activate selected plan and deactivate others"/);
    assert.match(client, /children:"Highest Session % first"/);
    assert.match(client, /children:"Lowest Session % first"/);
    assert.match(
        client,
        /smartPlan=__9rBuildSmartPriorityPlan\(smartPopulation\.accounts,smartPopulation\.quotaMap,\{/,
        "Smart Priority must plan across the complete population after quota filtering",
    );
    assert.match(
        client,
        /await __9rRunQuotaPool\(smartPlan,async [A-Za-z_$][\w$]*=>\{[\s\S]*?JSON\.stringify\(\{isActive:[A-Za-z_$][\w$]*\.isActive,priority:[A-Za-z_$][\w$]*\.priority\}\)[\s\S]*?\},8\)/,
        "Smart Priority updates must use explicit priorities with at most eight concurrent requests",
    );
    assert.doesNotMatch(client, /Promise\.all\(smartPlan\.map\(/);
});

test("Smart Priority loads every status and page before planning", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");

    assert.match(
        client,
        /function __9rLoadSmartPriorityPopulation\(/,
        "Smart Priority needs a dedicated full-population loader",
    );
    assert.match(
        client,
        /accountStatus:"all"/,
        "Smart Priority must load active and inactive accounts regardless of the dashboard status filter",
    );
    assert.match(
        client,
        /(?:for|while)\([^)]*totalPages/,
        "Smart Priority must traverse every providers page instead of mutating only the current page",
    );
    assert.match(
        client,
        /smartPopulation=await __9rLoadSmartPriorityPopulation\([\s\S]*?smartPlan=__9rBuildSmartPriorityPlan\(smartPopulation\.accounts,smartPopulation\.quotaMap,/,
        "Smart Priority must plan with the accounts and quotas loaded from the complete population",
    );
    assert.doesNotMatch(
        client,
        /smartPlan=__9rBuildSmartPriorityPlan\(sessionFilteredEZ,/,
        "Smart Priority must not inherit the current status/provider/page-limited dashboard list",
    );
});

test("Smart Priority full-population loader executes every page with bounded quota work", async () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const poolSource = extractNamedFunction(client, "__9rRunQuotaPool");
    const filterSource = extractNamedFunction(client, "__9rFilterByQuotaRemaining");
    const loaderSource = extractNamedFunction(client, "__9rLoadSmartPriorityPopulation");

    assert.ok(poolSource && filterSource && loaderSource, "Smart Priority loader dependencies are missing");
    const requestedPages = [];
    const sandbox = {
        URLSearchParams,
        fetch: async (url) => {
            const parsed = new URL(url, "http://dashboard.local");
            assert.equal(parsed.searchParams.get("accountStatus"), "all");
            assert.equal(parsed.searchParams.get("provider"), "codex");
            const page = Number(parsed.searchParams.get("page"));
            requestedPages.push(page);
            return {
                ok: true,
                json: async () => ({
                    connections: page === 1
                        ? [{ id: "k12-a", provider: "codex", priority: 1 }]
                        : [{ id: "plus-b", provider: "codex", priority: 2 }],
                    pagination: { page, pageSize: 500, total: 501, totalPages: 2 },
                }),
            };
        },
    };
    vm.runInNewContext(
        `${poolSource};${filterSource};${loaderSource};this.load=__9rLoadSmartPriorityPopulation`,
        sandbox,
    );
    let quotaConcurrency = 0;
    let peakQuotaConcurrency = 0;
    const population = await sandbox.load("codex", "all", "all", async (id, _provider, batch) => {
        quotaConcurrency += 1;
        peakQuotaConcurrency = Math.max(peakQuotaConcurrency, quotaConcurrency);
        await Promise.resolve();
        batch.errors[id] = null;
        batch.quotas[id] = {
            plan: id.startsWith("k12") ? "k12" : "plus",
            quotas: [{ name: "Session Token", remaining: 50 }],
        };
        quotaConcurrency -= 1;
    });

    assert.deepEqual(requestedPages, [1, 2]);
    assert.deepEqual(Array.from(population.accounts, (account) => account.id), ["k12-a", "plus-b"]);
    assert.equal(Object.keys(population.quotaMap).length, 2);
    assert.equal(population.quotaFailures, 0, "successful null error slots must not be counted as failures");
    assert.ok(peakQuotaConcurrency <= 8, `quota concurrency reached ${peakQuotaConcurrency}`);

    requestedPages.length = 0;
    const populationWithFailure = await sandbox.load("codex", "all", "all", async (id, _provider, batch) => {
        batch.errors[id] = id === "plus-b" ? "quota failed" : null;
        batch.quotas[id] = {
            plan: id.startsWith("k12") ? "k12" : "plus",
            quotas: [{ name: "Session Token", remaining: 50 }],
        };
    });
    assert.deepEqual(requestedPages, [1, 2]);
    assert.equal(populationWithFailure.quotaFailures, 1);
});

test("Smart Priority participates in the shared quota mutation lock", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const busyState = client.match(
        /\[([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\]=\(0,[A-Za-z_$][\w$]*\.useState\)\(!1\),\[ewMin,sewMin\]/,
    );

    assert.ok(busyState, "shared quota mutation busy state is missing");
    const [, busyValue, busySetter] = busyState;
    const start = client.indexOf("const bulkSmartPrioritySort=async()=>{");
    const tail = start >= 0 ? client.slice(start) : "";
    const endMatch = tail.match(/\};let [A-Za-z_$][\w$]*="all"===/);
    const end = endMatch ? start + endMatch.index + 1 : -1;
    assert.ok(start >= 0 && end > start, "Smart Priority mutation function is missing");
    const smartMutation = client.slice(start, end);

    assert.match(
        smartMutation,
        new RegExp(`${busySetter}\\((?:true|!0)\\)`),
        "Smart Priority must lock every other quota mutation before its PUT pool starts",
    );
    assert.match(
        smartMutation,
        new RegExp(`finally\\{[\\s\\S]*?${busySetter}\\((?:false|!1)\\)`),
        "Smart Priority must always release the shared mutation lock",
    );
    assert.match(
        client,
        new RegExp(`children:\"Smart Priority\"[\\s\\S]{0,800}disabled:${busyValue}|disabled:${busyValue}[\\s\\S]{0,800}children:\"Smart Priority\"`),
        "the Smart Priority trigger must observe the shared mutation lock",
    );
});

test("Smart Priority rejects a preferred plan absent from the loaded population", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const builderSource = extractNamedFunction(client, "__9rBuildSmartPriorityPlan");

    assert.ok(builderSource, "Smart Priority planning helper is missing");
    const sandbox = {};
    vm.runInNewContext(`${builderSource};this.buildPlan=__9rBuildSmartPriorityPlan`, sandbox);

    assert.throws(
        () => sandbox.buildPlan([
            { id: "plus-a", isActive: true, priority: 1 },
            { id: "plus-b", isActive: true, priority: 2 },
        ], {
            "plus-a": { plan: "plus", quotas: [{ name: "Session Token", remaining: 80 }] },
            "plus-b": { plan: "plus", quotas: [{ name: "Session Token", remaining: 40 }] },
        }, {
            preferredPlan: "k12",
            activationMode: "preferred-only",
            sessionOrder: "desc",
        }),
        /preferred plan.*(?:absent|available|match|population)/i,
        "a stale preferred-plan selection must not deactivate every remaining account",
    );
});

test("quota card keeps its plan badge but removes the reset-time counter badge", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");

    assert.match(client, /let planBadge=[A-Za-z_$][\w$]*\?\.plan\|\|null/);
    assert.match(client, /let label=labels\[key\]\|\|planBadge/);
    assert.equal(client.includes("earliestReset"), false, "reset-time header calculation remains");
    assert.equal(client.includes("Resetting..."), false, "reset-time header label remains");
    assert.equal(client.includes("⏱"), false, "reset-time header icon remains");
});

test("quota sidebar has runtime sticky dimensions independent of generated CSS", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const server = fs.readFileSync(path.join(
        appRoot,
        ".next-cli-build/server/app/(dashboard)/dashboard/quota/page.js",
    ), "utf8");
    const stickyStyle = /style:\{position:"sticky",top:"4rem",alignSelf:"flex-start",width:"14rem",maxHeight:"calc\(100vh - 5rem\)",overflowY:"auto",zIndex:30,background:"var\(--surface-1,#111\)"\}/;

    assert.match(client, stickyStyle, "client sidebar still depends on missing Tailwind utilities");
    assert.match(server, stickyStyle, "server sidebar still depends on missing Tailwind utilities");
});

test("quota pagination derives total pages from total and page size", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const server = fs.readFileSync(path.join(
        appRoot,
        ".next-cli-build/server/app/(dashboard)/dashboard/quota/page.js",
    ), "utf8");

    for (const [label, content] of [["client", client], ["server", server]]) {
        assert.match(
            content,
            /function __9rNormalizePagination\(e,t\)\{let r=e\|\|\{page:1,pageSize:t,total:0,totalPages:1\};return\{\.\.\.r,totalPages:Math\.max\(1,Math\.ceil\(\(r\.total\|\|0\)\/\(r\.pageSize\|\|t\|\|1\)\)\)\}\}/,
            `${label} pagination normalizer missing`,
        );
        assert.match(
            content,
            /__9rNormalizePagination\([\w$]+\.pagination,[\w$]+\)/,
            `${label} API pagination is not normalized`,
        );
    }
});

test("pagination patch validates client and server before committing writes", () => {
    const patcher = fs.readFileSync(path.join(__dirname, "apply-patches.js"), "utf8");
    const start = patcher.indexOf("function patchQuotaPaginationNormalization");
    const end = patcher.indexOf("// PATCH 4:", start);
    const implementation = patcher.slice(start, end);

    assert.match(implementation, /const transformedBundles\s*=\s*\[\]/);
    const commitLoop = implementation.indexOf("for (const result of transformedBundles)");
    const firstWrite = implementation.indexOf("fs.writeFileSync");
    assert.ok(commitLoop > 0, "pagination patch has no transactional commit loop");
    assert.ok(firstWrite > commitLoop, "pagination bundle was written before every transform passed");
});

test("quota client and server bundles defer rendering until hydration", () => {
    const client = fs.readFileSync(findQuotaChunk(), "utf8");
    const serverPage = path.join(
        appRoot,
        ".next-cli-build/server/app/(dashboard)/dashboard/quota/page.js",
    );
    const server = fs.readFileSync(serverPage, "utf8");

    for (const [label, content] of [["client", client], ["server", server]]) {
        assert.match(content, /let\[__9rHydrated,__9rSetHydrated\]=\(0,[\w$]+\.useState\)\(!1\)/, `${label} hydration state missing`);
        assert.match(content, /useEffect\)\(\(\)=>__9rSetHydrated\(!0\),\[\]\)/, `${label} hydration effect missing`);
        assert.match(content, /if\(!__9rHydrated\)return null;return /, `${label} hydration gate missing`);
        assert.equal((content.match(/__9rSetHydrated\(!0\)/g) || []).length, 1, `${label} hydration effect duplicated`);
        assert.equal((content.match(/if\(!__9rHydrated\)return null/g) || []).length, 1, `${label} hydration gate duplicated`);
    }
});

test("quota route is excluded from the prerender manifest", () => {
    const manifestPath = path.join(appRoot, ".next-cli-build/prerender-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    assert.ok(manifest.routes && typeof manifest.routes === "object");
    assert.equal(manifest.routes["/dashboard/quota"], undefined);
});

test("dashboard stage skips API bootstrap services and outbound proxy initialization", () => {
    const chunksDir = path.join(appRoot, ".next-cli-build/server/chunks");
    const candidates = fs.readdirSync(chunksDir)
        .filter((file) => file.endsWith(".js"))
        .map((file) => path.join(chunksDir, file))
        .filter((file) => {
            const content = fs.readFileSync(file, "utf8");
            return content.includes("[Bootstrap] init failed:") &&
                content.includes("[ServerInit] Error initializing outbound proxy:") &&
                content.includes("global.__appBootstrapped");
        });

    assert.equal(candidates.length, 1, "Expected one server bootstrap chunk");
    const content = fs.readFileSync(candidates[0], "utf8");
    assert.equal((content.match(/NINE_ROUTER_ROLE/g) || []).length, 2);
    assert.match(content, /if\("dashboard"===process\.env\.NINE_ROUTER_ROLE\)return void b\(\);|"dashboard"===process\.env\.NINE_ROUTER_ROLE\|\|"phase-production-build"/);
    assert.equal((content.match(/"dashboard"!==process\.env\.NINE_ROUTER_ROLE&&setImmediate/g) || []).length, 1);
    if (content.includes('c(94123)')) {
        assert.ok(
            content.indexOf('if("dashboard"===process.env.NINE_ROUTER_ROLE)return void b();') < content.indexOf("c(94123)"),
            "bootstrap guard must run before initializeApp is required",
        );
    }
    assert.doesNotMatch(content, /c\.a\(a,async\(a,b\)=>\{try\{var d=c\(94123\)/);
    assert.doesNotMatch(content, /(?:^|[;,{])setImmediate\(\(\)=>\{[A-Za-z_$][\w$]*\(\)\.catch\(console\.log\)\}\)/);
});
