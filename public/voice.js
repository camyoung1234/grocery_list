/**
 * Voice command parsing and resilient fuzzy item matching for Grocery List.
 * Pure ES module (no DOM dependencies) so it can be unit-tested in Node as well as imported in app.js.
 */

const ONES = {
    zero: 0, oh: 0, o: 0, none: 0, nothing: 0, nil: 0,
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
};

const TENS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

const TRAILING_HOMOPHONES = {
    won: 1,
    to: 2,
    too: 2,
    for: 4,
    ate: 8
};

/**
 * Parse a sequence of tokens representing a non-negative integer (e.g. ["twenty", "three"] -> 23, ["12"] -> 12).
 * Returns null if the tokens do not form a valid number.
 */
export function parseNumberTokens(tokens, allowHomophones = false) {
    if (!tokens || tokens.length === 0) return null;
    const joined = tokens.join(' ').trim().toLowerCase();

    if (/^\d+$/.test(joined)) {
        return parseInt(joined, 10);
    }

    if (joined === 'a couple' || joined === 'couple') return 2;
    if (joined === 'a few' || joined === 'few') return 3;
    if (joined === 'half a dozen' || joined === 'half dozen') return 6;
    if (joined === 'a dozen' || joined === 'dozen') return 12;

    if (tokens.length === 1) {
        const w = tokens[0].toLowerCase();
        if (w in ONES) return ONES[w];
        if (w in TENS) return TENS[w];
        if (allowHomophones && w in TRAILING_HOMOPHONES) return TRAILING_HOMOPHONES[w];
        return null;
    }

    if (tokens.length === 2) {
        const [a, b] = tokens.map(t => t.toLowerCase());
        if (a in TENS && b in ONES && ONES[b] >= 1 && ONES[b] <= 9) {
            return TENS[a] + ONES[b];
        }
        if (a === 'a' && b === 'dozen') return 12;
        if (a === 'a' && b === 'couple') return 2;
        if (a === 'a' && b === 'few') return 3;
        if (a === 'half' && b === 'dozen') return 6;
    }

    if (tokens.length === 3) {
        const [a, b, c] = tokens.map(t => t.toLowerCase());
        if (a === 'half' && b === 'a' && c === 'dozen') return 6;
    }

    return null;
}

/**
 * Normalize text for comparison: lowercase, strip punctuation, convert number words to digits.
 */
export function normalizeText(str) {
    if (!str) return '';
    const cleaned = str
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return '';

    const tokens = cleaned.split(' ');
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        // Handle compound tens + ones inside item names (e.g. "twenty one")
        if (tok in TENS && i + 1 < tokens.length && tokens[i + 1] in ONES && ONES[tokens[i + 1]] >= 1 && ONES[tokens[i + 1]] <= 9) {
            out.push(String(TENS[tok] + ONES[tokens[i + 1]]));
            i++;
        } else if (tok in ONES) {
            out.push(String(ONES[tok]));
        } else if (tok in TENS) {
            out.push(String(TENS[tok]));
        } else {
            out.push(tok);
        }
    }
    return out.join(' ');
}

export function normalizeCompact(str) {
    return normalizeText(str).replace(/\s+/g, '');
}

function singularize(word) {
    if (word.length <= 3) return word;
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es') && !word.endsWith('ses') && !word.endsWith('ches') && !word.endsWith('shes')) {
        return word.slice(0, -1);
    }
    if (word.endsWith('oes') || word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes')) {
        return word.slice(0, -2);
    }
    if (word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    return word;
}

function bigramDice(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bigramsA = new Map();
    for (let i = 0; i < a.length - 1; i++) {
        const bg = a.slice(i, i + 2);
        bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
    }
    let intersection = 0;
    for (let i = 0; i < b.length - 1; i++) {
        const bg = b.slice(i, i + 2);
        const count = bigramsA.get(bg) || 0;
        if (count > 0) {
            intersection++;
            bigramsA.set(bg, count - 1);
        }
    }
    return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function levenshteinRatio(a, b) {
    if (a === b) return 1;
    const m = a.length;
    const n = b.length;
    if (m === 0 || n === 0) return 0;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return 1 - dp[m][n] / Math.max(m, n);
}

/**
 * Parse a raw speech transcript into a structured command.
 * @param {string} rawText
 * @param {'smart'|'walk'} voiceSubMode
 */
export function parseVoiceCommand(rawText, voiceSubMode = 'smart') {
    const trimmed = (rawText || '').trim();
    if (!trimmed) return { type: 'empty' };

    const lower = trimmed.toLowerCase().replace(/[.!?,]+$/g, '').trim();

    // Navigation / control commands
    if (/^(next|skip|pass|next item)$/.test(lower)) {
        return { type: 'nav', action: 'next' };
    }
    if (/^(back|previous|prev|go back|previous item)$/.test(lower)) {
        return { type: 'nav', action: 'prev' };
    }
    if (/^(done|stop|exit|close|stop listening|finish)$/.test(lower)) {
        return { type: 'nav', action: 'stop' };
    }

    const rawTokens = lower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

    // In Walk List mode, a standalone number updates the current item & advances
    if (voiceSubMode === 'walk') {
        const standaloneNum = parseNumberTokens(rawTokens, true);
        if (standaloneNum !== null) {
            return { type: 'walk-qty', count: standaloneNum };
        }
    }

    // Strip common leading filler phrases
    let phrase = lower
        .replace(/^(i\s+have|we\s+have|have|set|update|got|there\s+is|there\s+are|count)\s+/i, '')
        .trim();

    // Handle explicit separator: "<item> to/at/is/equals <number>"
    const sepMatch = phrase.match(/^(.+?)\s+(?:to|at|is|equals)\s+([a-z0-9\s-]+)$/i);
    if (sepMatch) {
        const sepNumTokens = sepMatch[2].replace(/-/g, ' ').trim().split(/\s+/);
        const sepCount = parseNumberTokens(sepNumTokens, true);
        if (sepCount !== null && sepMatch[1].trim()) {
            return { type: 'item-count', itemQuery: sepMatch[1].trim(), count: sepCount };
        }
    }

    const tokens = phrase.replace(/-/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

    // 1. Try trailing count (try longest valid number suffix up to 3 tokens, e.g. "half a dozen", "twenty one", "one")
    for (let len = Math.min(3, tokens.length - 1); len >= 1; len--) {
        const tail = tokens.slice(tokens.length - len);
        const count = parseNumberTokens(tail, len === 1);
        if (count !== null) {
            const itemQuery = tokens.slice(0, tokens.length - len).join(' ').trim();
            if (itemQuery) {
                return { type: 'item-count', itemQuery, count };
            }
        }
    }

    // 2. Try leading count (e.g. "2 whole milk", "three bananas", "a dozen eggs")
    for (let len = Math.min(3, tokens.length - 1); len >= 1; len--) {
        const head = tokens.slice(0, len);
        // Do not allow homophones at the start ("for" / "to") to avoid mangling phrases
        const count = parseNumberTokens(head, false);
        if (count !== null) {
            let itemTokens = tokens.slice(len);
            if (itemTokens[0] === 'of') itemTokens = itemTokens.slice(1);
            const itemQuery = itemTokens.join(' ').trim();
            if (itemQuery) {
                return { type: 'item-count', itemQuery, count };
            }
        }
    }

    // 3. Standalone number in smart mode (no item name)
    const onlyNum = parseNumberTokens(tokens, true);
    if (onlyNum !== null) {
        return { type: 'walk-qty', count: onlyNum };
    }

    return { type: 'item-only', itemQuery: phrase };
}

/**
 * Score how well a query matches a list of items.
 * Returns sorted array of { item, score } for matches above threshold.
 */
export function matchGroceryItems(query, items, minScore = 0.52) {
    const qNorm = normalizeText(query);
    const qCompact = normalizeCompact(query);
    if (!qNorm || !items || items.length === 0) return [];

    const qTokens = qNorm.split(' ').filter(Boolean);
    const qSingularTokens = qTokens.map(singularize);

    const results = [];

    for (const item of items) {
        if (item.pendingDelete) continue;
        const iNorm = normalizeText(item.text);
        const iCompact = normalizeCompact(item.text);
        if (!iNorm) continue;

        let score = 0;

        if (qCompact === iCompact) {
            score = 1.0;
        } else if (qNorm === iNorm) {
            score = 0.98;
        } else {
            const iTokens = iNorm.split(' ').filter(Boolean);
            const iSingularTokens = iTokens.map(singularize);

            if (qSingularTokens.join(' ') === iSingularTokens.join(' ')) {
                score = 0.95;
            } else {
                // Check if every query token matches an item token (exact, singular, or prefix)
                let matchedTokens = 0;
                for (let qi = 0; qi < qTokens.length; qi++) {
                    const qt = qTokens[qi];
                    const qs = qSingularTokens[qi];
                    const found = iTokens.some((it, ii) => {
                        const is = iSingularTokens[ii];
                        return it === qt || is === qs || it.startsWith(qt) || is.startsWith(qs);
                    });
                    if (found) matchedTokens++;
                }

                if (matchedTokens === qTokens.length) {
                    // Favor closer token counts so "milk" prefers "Milk" over "Chocolate Almond Milk"
                    const lengthRatio = qTokens.length / Math.max(iTokens.length, qTokens.length);
                    score = 0.80 + 0.12 * lengthRatio;
                } else if (iCompact.includes(qCompact) && qCompact.length >= 3) {
                    score = 0.75 + 0.05 * (qCompact.length / iCompact.length);
                } else if (qCompact.includes(iCompact) && iCompact.length >= 3) {
                    score = 0.72 * (iCompact.length / qCompact.length);
                } else {
                    const dice = bigramDice(qNorm, iNorm);
                    const lev = levenshteinRatio(qCompact, iCompact);
                    score = Math.max(dice, lev) * 0.74;
                }
            }
        }

        if (score >= minScore) {
            results.push({ item, score });
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
}
