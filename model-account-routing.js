const PATCH_MARKER = '/*__9router_model_account_tier_v2__*/';

// ── Plan classification ──────────────────────────────────────────
// Sol-capable: plans that can access the flagship Sol model
const SOL_CAPABLE_PLANS = new Set([
    'plus',
    'pro',
    'business',
    'team',
    'enterprise',
    'premium',
    'ultra',
]);

// Terra-preferred: lower-tier plans routed to Terra/Luna first
// to preserve Sol-capable quota for analysis/verify tasks
const TERRA_PREFERRED_PLANS = new Set([
    'free',
    'go',
    'k12',
    'edu',
]);

// ── Helpers ──────────────────────────────────────────────────────
function normalizeAccountPlan(connection) {
    const providerData = connection?.providerSpecificData || {};
    const plan = providerData.chatgptPlanType ??
        providerData.planType ??
        connection?.chatgptPlanType ??
        connection?.chatgpt_plan_type ??
        connection?.plan_type ??
        connection?.plan ??
        '';
    return String(plan).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

// ── Model tier detection ─────────────────────────────────────────
// Flexible detection: substring matching + reasoning effort suffix
function getModelTier(model) {
    const m = String(model || '').toLowerCase();
    // Sol variants: gpt-5.6-sol, codex-sol, sol, sol-ultra, sol-max
    if (m.includes('sol'))  return 'sol';
    // Terra/Luna/Mini variants
    if (m.includes('terra') || m.includes('luna') || m.includes('mini')) return 'terra';
    // Reasoning effort suffix (e.g. gpt-5.6:xhigh → sol-tier, gpt-5.6:low → terra-tier)
    if (m.endsWith(':xhigh') || m.endsWith(':high')) return 'sol';
    if (m.endsWith(':low') || m.endsWith(':medium')) return 'terra';
    // Default: terra (regular work goes to low-tier accounts)
    return 'terra';
}

// Back-compat wrapper used by existing tests
function getModelAccountPolicy(provider, model) {
    if (String(provider || '').toLowerCase() !== 'codex') return 'unrestricted';
    const tier = getModelTier(model);
    if (tier === 'sol') return 'sol';
    return 'terra';
}

// ── Connection filter ────────────────────────────────────────────
function filterConnectionsForModel(connections, provider, model) {
    const candidates = Array.isArray(connections) ? connections : [];
    if (String(provider || '').toLowerCase() !== 'codex') return candidates;

    const tier = getModelTier(model);

    if (tier === 'sol') {
        // Sol: only Plus/Pro/Business/Enterprise (NOT K12/Free/Go)
        const result = candidates.filter(c => SOL_CAPABLE_PLANS.has(normalizeAccountPlan(c)));
        if (result.length > 0) return result;
        // Fallback: if no Sol-capable accounts, return all and let OpenAI decide
        return candidates;
    }

    // Terra/Luna: prefer Free/Go/K12 (save Plus+ quota for Sol tasks)
    const preferred = candidates.filter(c => TERRA_PREFERRED_PLANS.has(normalizeAccountPlan(c)));
    if (preferred.length > 0) return preferred;
    // Fallback: if no low-tier accounts, Plus+ can also run Terra
    return candidates;
}

// ── Injected filter builder (minified for route.js) ──────────────
function buildInjectedFilter(connectionsAlias, providerAlias, modelAlias) {
    const solPlans = JSON.stringify([...SOL_CAPABLE_PLANS]);
    const terraPlans = JSON.stringify([...TERRA_PREFERRED_PLANS]);
    return `${connectionsAlias}=${PATCH_MARKER}function(a,b,c){` +
        'if("codex"!==String(b||"").toLowerCase())return a;' +
        'let d=String(c||"").toLowerCase(),' +
        'e=a=>String(a?.providerSpecificData?.chatgptPlanType??a?.providerSpecificData?.planType??a?.chatgptPlanType??a?.chatgpt_plan_type??a?.plan_type??a?.plan??"").trim().toLowerCase().replace(/[\\s_-]+/g,""),' +
        't=d.includes("sol")?"sol":d.includes("terra")||d.includes("luna")||d.includes("mini")?"terra":d.endsWith(":xhigh")||d.endsWith(":high")?"sol":"terra";' +
        `if("sol"===t){let f=new Set(${solPlans}),g=a.filter(a=>f.has(e(a)));return g.length>0?g:a}` +
        `{let f=new Set(${terraPlans}),g=a.filter(a=>f.has(e(a)));return g.length>0?g:a}` +
        `}(${connectionsAlias},${providerAlias},${modelAlias});`;
}

// ── Patch applicator ─────────────────────────────────────────────
function patchCredentialSelectorContent(content) {
    const V1_MARKER = '/*__9router_model_account_tier_v1__*/';
    if (content.includes(PATCH_MARKER)) {
        return { matched: true, changed: false, content };
    }

    // Remove v1 marker if upgrading
    if (content.includes(V1_MARKER)) {
        content = content.replace(V1_MARKER, '');
        // Also remove the old injected filter function
        content = content.replace(/function\(a,b,c\)\{if\("codex"!==String\(b\|\|""\)\.toLowerCase\(\)\)return a;let d=String\(c\|\|""\)\.toLowerCase\(\),e=a=>String\(a\?\.providerSpecificData\?\.chatgptPlanType\?\?[^}]+\}\([^)]+\);/, '');
    }

    const connectionPattern = /let ([A-Za-z_$][\w$]*)=await \(0,([A-Za-z_$][\w$]*)\.getProviderConnections\)\(\{provider:([A-Za-z_$][\w$]*),isActive:!0\}\);/g;
    const connectionMatches = [...content.matchAll(connectionPattern)];
    if (connectionMatches.length === 0) {
        return { matched: false, changed: false, content };
    }
    if (connectionMatches.length !== 1) {
        throw new Error(`Expected one credential selector anchor, found ${connectionMatches.length}`);
    }

    const connectionMatch = connectionMatches[0];
    const anchorIndex = connectionMatch.index;
    const prefix = content.slice(0, anchorIndex);
    const selectorPattern = /async function [A-Za-z_$][\w$]*\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)=null,([A-Za-z_$][\w$]*)=null,([A-Za-z_$][\w$]*)=\{\}\)\{/g;
    const selectorMatches = [...prefix.matchAll(selectorPattern)];
    if (selectorMatches.length === 0) {
        throw new Error('Credential selector function signature not found');
    }

    const selectorMatch = selectorMatches[selectorMatches.length - 1];
    const connectionsAlias = connectionMatch[1];
    const providerAlias = connectionMatch[3];
    const modelAlias = selectorMatch[3];
    const anchor = connectionMatch[0];
    const injected = anchor + buildInjectedFilter(connectionsAlias, providerAlias, modelAlias);

    return {
        matched: true,
        changed: true,
        content: content.slice(0, anchorIndex) + injected + content.slice(anchorIndex + anchor.length),
    };
}

module.exports = {
    PATCH_MARKER,
    SOL_CAPABLE_PLANS,
    TERRA_PREFERRED_PLANS,
    filterConnectionsForModel,
    getModelAccountPolicy,
    getModelTier,
    normalizeAccountPlan,
    patchCredentialSelectorContent,
};
