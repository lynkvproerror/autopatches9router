const IDENTIFIER = '[A-Za-z_$][\\w$]*';

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getModernProviderDetailAnchors(content) {
    const mapMatch = content.match(new RegExp(
        `let (${IDENTIFIER})=\\{claude:"claudeAutoPing",codex:"codexAutoPing"\\};`,
    ));
    const successMatch = content.match(new RegExp(
        `(${IDENTIFIER})=\\(\\)=>\\{(${IDENTIFIER})\\(\\),(${IDENTIFIER})\\(!1\\)\\},(${IDENTIFIER})=async e=>\\{`,
    ));
    if (!mapMatch || !successMatch) return null;

    const [, successAlias, refreshAlias, closeSetter, saveAlias] = successMatch;
    const saveSuccessMatch = content.match(new RegExp(
        `if\\((${IDENTIFIER})\\.ok\\)\\{await ${escapeRegExp(refreshAlias)}\\(\\),(${IDENTIFIER})\\(!1\\);return\\}`,
    ));
    if (!saveSuccessMatch) return null;

    const responseAlias = saveSuccessMatch[1];
    const saveCloseSetter = saveSuccessMatch[2];
    return {
        autoPingMapAlias: mapMatch[1],
        successAlias,
        refreshAlias,
        closeSetter,
        saveAlias,
        successSource: `${successAlias}=()=>{${refreshAlias}(),${closeSetter}(!1)}`,
        patchedSuccessSource: `${successAlias}=async()=>{await __9rEnableProviderAutoPing();${closeSetter}(!1)}`,
        saveSuccessSource: saveSuccessMatch[0],
        patchedSaveSuccessSource: `if(${responseAlias}.ok){await __9rEnableProviderAutoPing(),${saveCloseSetter}(!1);return}`,
    };
}

function getPatchedProviderDetailTarget(content) {
    const match = content.match(new RegExp(
        `,(${IDENTIFIER})=async\\(\\)=>\\{await __9rEnableProviderAutoPing\\(\\);(${IDENTIFIER})\\(!1\\)\\},(${IDENTIFIER})=async e=>\\{`,
    ));
    if (!match) return null;
    return {
        source: match[0],
        successAlias: match[1],
        closeSetter: match[2],
        saveAlias: match[3],
    };
}

function isModernProviderAutoPingPatched(content) {
    if (!content.includes('__9rEnableProviderAutoPing=async()=>{') ||
        !content.includes('__9rPing') ||
        !getPatchedProviderDetailTarget(content)) {
        return false;
    }
    const saveReady = new RegExp(
        `if\\((${IDENTIFIER})\\.ok\\)\\{await __9rEnableProviderAutoPing\\(\\),(${IDENTIFIER})\\(!1\\);return\\}`,
    ).test(content);
    const bulkReady = /onSuccess:async\(\)=>\{await __9rEnableProviderAutoPing\(\);[A-Za-z_$][\w$]*\(!1\)\}/.test(content);
    return saveReady && bulkReady;
}

function isProviderDetailBulkPatched(content) {
    return content.includes('bulkDelete401') &&
        (content.includes('children:"Tắt 0% quota"') || content.includes('children:"Tắt 0% token"')) &&
        (content.includes('const session=qList.find(') || content.includes('session=list.find(') || content.includes('sRem===0') || content.includes('rem===0') || content.includes('rem!==null&&rem===0') || content.includes('__9rGetRemaining'));
}

module.exports = {
    getModernProviderDetailAnchors,
    getPatchedProviderDetailTarget,
    isModernProviderAutoPingPatched,
    isProviderDetailBulkPatched,
};
