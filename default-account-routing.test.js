const assert = require('node:assert/strict');
const test = require('node:test');

const {
    INJECTED_TIER_MARKERS,
    removeInjectedTierFilters,
} = require('./default-account-routing');

const fixture = marker => [
    '"use strict";',
    'let j=await (0,d.getProviderConnections)({provider:g,isActive:!0});',
    `j=${marker}function(a,b,c){if("codex"!==String(b||"").toLowerCase())return a;return a.filter(a=>c)}(j,g,c);`,
    'return j[0];',
].join('');

for (const marker of INJECTED_TIER_MARKERS) {
    test(`removes the recognized ${marker.match(/v\d/)[0]} injected assignment`, () => {
        const result = removeInjectedTierFilters(fixture(marker));
        assert.equal(result.changed, true);
        assert.doesNotMatch(result.content, /__9router_model_account_tier_v\d__/);
        assert.equal(result.content, '"use strict";let j=await (0,d.getProviderConnections)({provider:g,isActive:!0});return j[0];');
    });
}

test('removes every recognized injected assignment in one chunk', () => {
    const result = removeInjectedTierFilters(fixture(INJECTED_TIER_MARKERS[0]) + fixture(INJECTED_TIER_MARKERS[2]));
    assert.equal(result.changed, true);
    assert.doesNotMatch(result.content, /__9router_model_account_tier_v\d__/);
});

test('leaves an upstream selector untouched when no injected marker exists', () => {
    const content = 'let j=await (0,d.getProviderConnections)({provider:g,isActive:!0});return j[0];';
    assert.deepEqual(removeInjectedTierFilters(content), { changed: false, content });
});

test('fails when an injected marker does not delimit a complete assignment', () => {
    assert.throws(
        () => removeInjectedTierFilters(`j=${INJECTED_TIER_MARKERS[2]}function(a,b,c){return a;}`),
        /marker was found without a removable assignment/,
    );
});
