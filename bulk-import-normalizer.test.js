"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = __dirname;
const patchSource = fs.readFileSync(path.join(root, "apply-patches.js"), "utf8");
const routeFixture = fs.readFileSync(path.join(root, "bulk-import-route.patched.js"), "utf8");
const routeTarget = '!Array.isArray(c)||0===c.length)return e.NextResponse.json({error:"No accounts provided"},{status:400});let d=[],h=0,i=0;';

function loadPatchRunner(initialRoute) {
    let route = initialRoute;
    const start = patchSource.indexOf("function patchBulkImport()");
    const end = patchSource.indexOf("// PATCH 18:", start);
    const context = {
        BUILD: "/build",
        console: { log() {} },
        fs: {
            existsSync(file) {
                return file === path.join("/build", "server/app/api/oauth/codex/bulk-import/route.js");
            },
            readFileSync() {
                return route;
            },
            writeFileSync(_file, content) {
                route = content;
            },
        },
        path,
    };

    vm.runInNewContext(
        `${patchSource.slice(start, end)}\nglobalThis.runBulkImportPatch = patchBulkImport;`,
        context,
        { filename: "apply-patches.js" },
    );
    return {
        run: context.runBulkImportPatch,
        readRoute: () => route,
    };
}

function extractNormalizer(route) {
    const marker = "/*__9router_bulk_import_normalizer_v2__*/";
    const start = route.indexOf(marker);
    const end = route.indexOf(routeTarget, start);
    assert.ok(start >= 0, "the v2 normalizer marker must be injected");
    assert.ok(end > start, "the v2 normalizer must precede the bulk import guard");

    const injected = route.slice(start + marker.length, end).replace(/,$/, "");
    return vm.runInNewContext(`(function(c) { ${injected}; return c; })`, { Date });
}

test("Bulk Add normalizes Codex auth, CPA JSON, and sub2api without discarding OAuth metadata", () => {
    const runner = loadPatchRunner(`prefix${routeTarget}suffix`);
    assert.equal(runner.run(), true);
    const normalize = extractNormalizer(runner.readRoute());

    const [codex, cpa, sub2api] = normalize([
        {
            auth_mode: "chatgpt",
            tokens: {
                access_token: "codex-access",
                account_id: "acct-codex",
                id_token: "codex-id",
                refresh_token: "codex-refresh",
            },
            last_refresh: "2026-07-24T00:00:00.000Z",
        },
        {
            type: "codex",
            email: "cpa@example.com",
            account_id: "acct-cpa",
            access_token: "cpa-access",
            id_token: "cpa-id",
            refresh_token: "cpa-refresh",
            session_token: "cpa-session",
            expired: "2026-07-24 17:00:00 +0800",
            last_refresh: "2026-07-24T00:00:00.000Z",
        },
        {
            name: "sub2api@example.com",
            credentials: {
                access_token: "sub-access",
                chatgpt_account_id: "acct-sub",
                chatgpt_plan_type: "plus",
                email: "sub2api@example.com",
                expires_at: 1893456000,
                id_token: "sub-id",
                refresh_token: "sub-refresh",
                session_token: "sub-session",
            },
        },
    ]);

    assert.equal(codex.accessToken, "codex-access");
    assert.equal(codex.idToken, "codex-id");
    assert.equal(codex.refreshToken, "codex-refresh");
    assert.equal(codex.providerSpecificData.chatgptAccountId, "acct-codex");

    assert.equal(cpa.accessToken, "cpa-access");
    assert.equal(cpa.idToken, "cpa-id");
    assert.equal(cpa.refreshToken, "cpa-refresh");
    assert.equal(cpa.sessionToken, "cpa-session");
    assert.equal(cpa.expiresAt, "2026-07-24T09:00:00.000Z");
    assert.equal(cpa.providerSpecificData.chatgptAccountId, "acct-cpa");

    assert.equal(sub2api.accessToken, "sub-access");
    assert.equal(sub2api.idToken, "sub-id");
    assert.equal(sub2api.refreshToken, "sub-refresh");
    assert.equal(sub2api.sessionToken, "sub-session");
    assert.equal(sub2api.expiresAt, "2030-01-01T00:00:00.000Z");
    assert.deepEqual(JSON.parse(JSON.stringify(sub2api.providerSpecificData)), {
        chatgptAccountId: "acct-sub",
        chatgptPlanType: "plus",
    });
});

test("Bulk Add upgrades the v1 normalizer instead of leaving legacy patched routes unchanged", () => {
    const legacyStart = routeFixture.indexOf("Array.isArray(c)&&(c=c.map(function(item)");
    const legacyEnd = routeFixture.indexOf(routeTarget, legacyStart);
    assert.ok(legacyStart >= 0 && legacyEnd > legacyStart, "the v1 route fixture must contain its injected normalizer");

    const legacyRoute = `prefix${routeFixture.slice(legacyStart, legacyEnd)}${routeTarget}suffix`;
    const runner = loadPatchRunner(legacyRoute);

    assert.equal(runner.run(), true);
    assert.match(runner.readRoute(), /__9router_bulk_import_normalizer_v2__/);
});

test("Bulk Add does not treat a browser session cookie as an OAuth bearer token", () => {
    const runner = loadPatchRunner(`prefix${routeTarget}suffix`);
    assert.equal(runner.run(), true);
    const normalize = extractNormalizer(runner.readRoute());
    const [rawSession] = normalize([{ session_token: "browser-session-cookie" }]);

    assert.equal(rawSession.accessToken, undefined);
    assert.equal(rawSession.session_token, "browser-session-cookie");
});
