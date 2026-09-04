const INJECTED_TIER_MARKERS = [
    '/*__9router_model_account_tier_v1__*/',
    '/*__9router_model_account_tier_v2__*/',
    '/*__9router_model_account_tier_v3__*/',
];

function findMatchingBrace(content, openingBraceIndex) {
    let depth = 0;
    let quote = null;

    for (let index = openingBraceIndex; index < content.length; index += 1) {
        const char = content[index];
        const next = content[index + 1];

        if (quote) {
            if ('\\' === char) index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if ('"' === char || "'" === char || '`' === char) {
            quote = char;
            continue;
        }
        if ('/' === char && '/' === next) {
            const lineEnd = content.indexOf('\n', index + 2);
            if (-1 === lineEnd) return -1;
            index = lineEnd;
            continue;
        }
        if ('/' === char && '*' === next) {
            const commentEnd = content.indexOf('*/', index + 2);
            if (-1 === commentEnd) return -1;
            index = commentEnd + 1;
            continue;
        }
        if ('{' === char) depth += 1;
        if ('}' === char && 0 === --depth) return index;
    }

    return -1;
}

function removeInjectedTierFilters(content) {
    const markerPattern = INJECTED_TIER_MARKERS
        .map(marker => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const assignmentPattern = new RegExp(
        `([A-Za-z_$][\\w$]*)=(${markerPattern})function\\((?:[A-Za-z_$][\\w$]*(?:,[A-Za-z_$][\\w$]*)*)?\\)\\{`,
        'g',
    );
    const removals = [];
    let match;

    while ((match = assignmentPattern.exec(content))) {
        const closingBraceIndex = findMatchingBrace(content, assignmentPattern.lastIndex - 1);
        if (-1 === closingBraceIndex) continue;

        const invocation = content.slice(closingBraceIndex + 1).match(
            /^\((?:[A-Za-z_$][\w$]*(?:,[A-Za-z_$][\w$]*)*)?\);/,
        );
        if (!invocation) continue;

        removals.push({ start: match.index, end: closingBraceIndex + 1 + invocation[0].length });
    }

    const markerCount = INJECTED_TIER_MARKERS.reduce(
        (count, marker) => count + content.split(marker).length - 1,
        0,
    );
    if (markerCount !== removals.length) {
        throw new Error('Injected model-account tier marker was found without a removable assignment');
    }
    if (0 === removals.length) return { changed: false, content };

    let updated = content;
    for (const removal of removals.reverse()) {
        updated = updated.slice(0, removal.start) + updated.slice(removal.end);
    }
    return { changed: true, content: updated };
}

module.exports = {
    INJECTED_TIER_MARKERS,
    removeInjectedTierFilters,
};
