const assert = require('node:assert/strict');
const test = require('node:test');

const {
    filterConnectionsForModel,
    getModelAccountPolicy,
    getModelTier,
    normalizeAccountPlan,
    patchCredentialSelectorContent,
} = require('./model-account-routing');

const connection = (id, plan, extra = {}) => ({
    id,
    providerSpecificData: plan === undefined ? {} : { chatgptPlanType: plan },
    ...extra,
});

const FIXTURE_CONNECTIONS = [
    connection('free', 'Free'),
    connection('go', 'Go'),
    connection('k12', 'K-12'),
    connection('plus', 'Plus'),
    connection('pro', 'Pro'),
    connection('team', 'Team'),
    connection('business', 'Business'),
    connection('enterprise', 'Enterprise'),
    connection('edu', 'Edu'),
    connection('premium', 'Premium'),
    connection('ultra', 'Ultra'),
    connection('unknown', undefined),
];

// ── Plan normalization ───────────────────────────────────────────
test('normalizes plan names without exposing unrelated connection fields', () => {
    assert.equal(normalizeAccountPlan(connection('a', ' K-12 ')), 'k12');
    assert.equal(normalizeAccountPlan(connection('b', 'PLUS')), 'plus');
    assert.equal(normalizeAccountPlan(connection('c', 'Go')), 'go');
    assert.equal(normalizeAccountPlan({ providerSpecificData: { planType: 'Team_Plan' } }), 'teamplan');
    assert.equal(normalizeAccountPlan({ chatgptPlanType: 'Enterprise Plan' }), 'enterpriseplan');
    assert.equal(normalizeAccountPlan({}), '');
});

// ── Model tier detection ─────────────────────────────────────────
test('detects sol tier from various model name formats', () => {
    assert.equal(getModelTier('gpt-5.6-sol'), 'sol');
    assert.equal(getModelTier('codex-sol'), 'sol');
    assert.equal(getModelTier('sol'), 'sol');
    assert.equal(getModelTier('gpt-5.6-sol-ultra'), 'sol');
    assert.equal(getModelTier('gpt-5.6-sol-max'), 'sol');
    assert.equal(getModelTier('codex/gpt-5.6-sol'), 'sol');
});

test('detects terra tier from various model name formats', () => {
    assert.equal(getModelTier('gpt-5.6-terra'), 'terra');
    assert.equal(getModelTier('codex-terra'), 'terra');
    assert.equal(getModelTier('gpt-5.6-luna'), 'terra');
    assert.equal(getModelTier('codex-mini'), 'terra');
    assert.equal(getModelTier('codex-mini-latest'), 'terra');
    assert.equal(getModelTier('gpt-5.1-codex-mini'), 'terra');
});

test('detects tier from reasoning effort suffix', () => {
    assert.equal(getModelTier('gpt-5.6:xhigh'), 'sol');
    assert.equal(getModelTier('gpt-5.6:high'), 'sol');
    assert.equal(getModelTier('gpt-5.6:low'), 'terra');
    assert.equal(getModelTier('gpt-5.6:medium'), 'terra');
});

test('defaults to terra for unrecognized models', () => {
    assert.equal(getModelTier('gpt-5.5'), 'terra');
    assert.equal(getModelTier('gpt-5.6'), 'terra');
    assert.equal(getModelTier(''), 'terra');
    assert.equal(getModelTier(null), 'terra');
});

// ── Policy classification ────────────────────────────────────────
test('classifies Codex Sol and Terra models correctly', () => {
    assert.equal(getModelAccountPolicy('codex', 'gpt-5.6-sol'), 'sol');
    assert.equal(getModelAccountPolicy('codex', 'codex-sol'), 'sol');
    assert.equal(getModelAccountPolicy('CODEX', 'codex/gpt-5.6-terra'), 'terra');
    assert.equal(getModelAccountPolicy('codex', 'codex-mini'), 'terra');
    assert.equal(getModelAccountPolicy('codex', 'gpt-5.5'), 'terra');
    assert.equal(getModelAccountPolicy('openai', 'gpt-5.6-sol'), 'unrestricted');
});

// ── Sol filtering: Plus/Pro/Business/Enterprise (NOT K12/Free/Go) ─
test('sol keeps only Plus-or-higher Codex accounts, excludes K12/Free/Go', () => {
    const result = filterConnectionsForModel(FIXTURE_CONNECTIONS, 'codex', 'gpt-5.6-sol');
    const ids = result.map(item => item.id);
    assert.ok(ids.includes('plus'), 'Plus should be included');
    assert.ok(ids.includes('pro'), 'Pro should be included');
    assert.ok(ids.includes('business'), 'Business should be included');
    assert.ok(ids.includes('enterprise'), 'Enterprise should be included');
    assert.ok(!ids.includes('k12'), 'K12 should NOT be included for Sol');
    assert.ok(!ids.includes('free'), 'Free should NOT be included for Sol');
    assert.ok(!ids.includes('go'), 'Go should NOT be included for Sol');
    assert.deepEqual(ids, ['plus', 'pro', 'team', 'business', 'enterprise', 'premium', 'ultra']);
});

// ── Terra filtering: Free/Go/K12 (preserve Plus for Sol) ─────────
test('terra prefers Free/Go/K12 accounts, saves Plus for Sol', () => {
    const result = filterConnectionsForModel(FIXTURE_CONNECTIONS, 'codex', 'gpt-5.6-terra');
    const ids = result.map(item => item.id);
    assert.ok(ids.includes('free'), 'Free should be included');
    assert.ok(ids.includes('go'), 'Go should be included');
    assert.ok(ids.includes('k12'), 'K12 should be included for Terra');
    assert.ok(ids.includes('edu'), 'Edu should be included for Terra');
    assert.ok(!ids.includes('plus'), 'Plus should NOT be preferred for Terra');
    assert.ok(!ids.includes('pro'), 'Pro should NOT be preferred for Terra');
    assert.deepEqual(ids, ['free', 'go', 'k12', 'edu']);
});

// ── Fallback behavior ────────────────────────────────────────────
test('sol falls back to all accounts when no Sol-capable exist', () => {
    const lowTierOnly = [connection('free', 'Free'), connection('k12', 'K-12'), connection('go', 'Go')];
    const result = filterConnectionsForModel(lowTierOnly, 'codex', 'gpt-5.6-sol');
    // Should return ALL accounts as fallback (not empty!)
    assert.equal(result.length, 3, 'Should fallback to all accounts');
});

test('terra falls back to all accounts when no low-tier exist', () => {
    const highTierOnly = [connection('plus', 'Plus'), connection('pro', 'Pro')];
    const result = filterConnectionsForModel(highTierOnly, 'codex', 'gpt-5.6-terra');
    // Should return all accounts (Plus can run Terra too)
    assert.equal(result.length, 2, 'Should fallback to Plus+ accounts');
});

test('rejects unknown plans from preferred tier but allows via fallback', () => {
    const unknownOnly = [connection('unknown')];
    // Sol: unknown not in SOL_CAPABLE → empty → fallback to all
    assert.equal(filterConnectionsForModel(unknownOnly, 'codex', 'gpt-5.6-sol').length, 1);
    // Terra: unknown not in TERRA_PREFERRED → empty → fallback to all
    assert.equal(filterConnectionsForModel(unknownOnly, 'codex', 'gpt-5.6-terra').length, 1);
});

// ── Non-Codex passthrough ────────────────────────────────────────
test('non-Codex providers are never filtered', () => {
    assert.deepEqual(
        filterConnectionsForModel(FIXTURE_CONNECTIONS, 'openai', 'gpt-5.6-sol').map(item => item.id),
        FIXTURE_CONNECTIONS.map(item => item.id),
    );
});

// ── Flexible model names in filter ───────────────────────────────
test('codex-mini and codex-mini-latest route to terra tier', () => {
    const result = filterConnectionsForModel(FIXTURE_CONNECTIONS, 'codex', 'codex-mini-latest');
    const ids = result.map(item => item.id);
    assert.ok(ids.includes('free'));
    assert.ok(ids.includes('k12'));
    assert.ok(!ids.includes('plus'));
});

test('sol-ultra routes to sol tier', () => {
    const result = filterConnectionsForModel(FIXTURE_CONNECTIONS, 'codex', 'gpt-5.6-sol-ultra');
    const ids = result.map(item => item.id);
    assert.ok(ids.includes('plus'));
    assert.ok(!ids.includes('k12'));
});

// ── Patch injection ──────────────────────────────────────────────
const SELECTOR_FIXTURE = [
    '"use strict";',
    'exports.modules={80238:(a,b,c)=>{',
    'let j=Promise.resolve();',
    'async function k(a,b=null,c=null,g={}){',
    'let l,m=b instanceof Set?b:b?new Set([b]):new Set,n=g?.preferredConnectionId||null,o=j;',
    'let j=await (0,d.getProviderConnections)({provider:g,isActive:!0});',
    'if(i.debug("AUTH",`${a} | total connections: ${j.length}, model: ${c||"any"}`),0===j.length)return null;',
    'return j[0]',
    '}};',
].join('');

test('patches the credential selector once with a v2 tier filter', () => {
    const first = patchCredentialSelectorContent(SELECTOR_FIXTURE);
    assert.equal(first.matched, true);
    assert.equal(first.changed, true);
    assert.equal(first.content.match(/__9router_model_account_tier_v2__/g)?.length, 1);
    assert.match(first.content, /sol/);
    assert.match(first.content, /terra/);
    assert.match(first.content, /mini/);

    const second = patchCredentialSelectorContent(first.content);
    assert.equal(second.matched, true);
    assert.equal(second.changed, false);
    assert.equal(second.content, first.content);
});

test('upgrades v1 patch to v2 when v1 marker found', () => {
    // Simulate a v1-patched content
    const v1Content = SELECTOR_FIXTURE.replace(
        'let j=await (0,d.getProviderConnections)({provider:g,isActive:!0});',
        'let j=await (0,d.getProviderConnections)({provider:g,isActive:!0});j=/*__9router_model_account_tier_v1__*/function(a,b,c){if("codex"!==String(b||"").toLowerCase())return a;return a}(j,g,c);'
    );
    const result = patchCredentialSelectorContent(v1Content);
    assert.equal(result.matched, true);
    assert.equal(result.changed, true);
    assert.match(result.content, /__9router_model_account_tier_v2__/);
    assert.doesNotMatch(result.content, /__9router_model_account_tier_v1__/);
});

test('does not claim unsupported chunks as routing targets', () => {
    assert.deepEqual(patchCredentialSelectorContent('exports.modules={}'), {
        matched: false,
        changed: false,
        content: 'exports.modules={}',
    });
});
