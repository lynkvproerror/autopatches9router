const assert = require('node:assert/strict');
const test = require('node:test');

const {
    getModernProviderDetailAnchors,
    getPatchedProviderDetailTarget,
    isModernProviderAutoPingPatched,
    isProviderDetailBulkPatched,
} = require('./provider-detail-patch');

const fixture = ({ mapAlias, closeSetter, saveCloseSetter }) => [
    `let ${mapAlias}={claude:"claudeAutoPing",codex:"codexAutoPing"};`,
    `,tI=()=>{tj(),${closeSetter}(!1)},tD=async e=>{`,
    `if(t.ok){await tj(),${saveCloseSetter}(!1);return}`,
].join('');

test('detects the 0.5.45 provider-detail aliases', () => {
    const anchors = getModernProviderDetailAnchors(fixture({
        mapAlias: 'M',
        closeSetter: 'O',
        saveCloseSetter: 'z',
    }));

    assert.deepEqual(anchors, {
        autoPingMapAlias: 'M',
        successAlias: 'tI',
        refreshAlias: 'tj',
        closeSetter: 'O',
        saveAlias: 'tD',
        successSource: 'tI=()=>{tj(),O(!1)}',
        patchedSuccessSource: 'tI=async()=>{await __9rEnableProviderAutoPing();O(!1)}',
        saveSuccessSource: 'if(t.ok){await tj(),z(!1);return}',
        patchedSaveSuccessSource: 'if(t.ok){await __9rEnableProviderAutoPing(),z(!1);return}',
    });
});

test('detects the renamed 0.5.50 provider-detail aliases', () => {
    const anchors = getModernProviderDetailAnchors(fixture({
        mapAlias: 'F',
        closeSetter: 'T',
        saveCloseSetter: 'U',
    }));

    assert.equal(anchors.autoPingMapAlias, 'F');
    assert.equal(anchors.successSource, 'tI=()=>{tj(),T(!1)}');
    assert.equal(anchors.patchedSuccessSource, 'tI=async()=>{await __9rEnableProviderAutoPing();T(!1)}');
    assert.equal(anchors.saveSuccessSource, 'if(t.ok){await tj(),U(!1);return}');
    assert.equal(anchors.patchedSaveSuccessSource, 'if(t.ok){await __9rEnableProviderAutoPing(),U(!1);return}');
});

test('finds the provider bulk-action insertion point after AutoPing patching', () => {
    assert.deepEqual(
        getPatchedProviderDetailTarget(',tI=async()=>{await __9rEnableProviderAutoPing();T(!1)},tD=async e=>{'),
        {
            source: ',tI=async()=>{await __9rEnableProviderAutoPing();T(!1)},tD=async e=>{',
            successAlias: 'tI',
            closeSetter: 'T',
            saveAlias: 'tD',
        },
    );
});

test('rejects unsupported provider-detail layouts', () => {
    assert.equal(getModernProviderDetailAnchors('exports.modules={}'), null);
    assert.equal(getPatchedProviderDetailTarget('exports.modules={}'), null);
});

test('recognizes an idempotently patched 0.5.50 AutoPing flow', () => {
    const content = [
        '__9rEnableProviderAutoPing=async()=>{await tj();await tC(__9rPing)},',
        'tI=async()=>{await __9rEnableProviderAutoPing();T(!1)},tD=async e=>{',
        'if(t.ok){await __9rEnableProviderAutoPing(),U(!1);return}',
        'onSuccess:async()=>{await __9rEnableProviderAutoPing();W(!1)}',
    ].join('');

    assert.equal(isModernProviderAutoPingPatched(content), true);
    assert.equal(isModernProviderAutoPingPatched(content.replace('await tC(__9rPing)', '')), false);
});

test('recognizes legacy and modern provider-detail bulk patches', () => {
    const common = 'bulkDelete401=()=>{}children:"Tắt 0% token"';
    assert.equal(isProviderDetailBulkPatched(`${common}const session=qList.find(q=>q)`), true);
    assert.equal(isProviderDetailBulkPatched(`${common}session=list.find(q=>q)`), true);
    assert.equal(isProviderDetailBulkPatched(common), false);
});
