// wiki_rag.js — Issue 10: Local wiki search via inverted index (lightweight RAG)
//
// Usage:
//   const rag = require('./wiki_rag');
//   rag.buildIndex();                      // call once at startup
//   const snippets = rag.search('enderdragon breath attack', 3);
//   // returns array of { file, line, text } for top-N matches
//
// Index is rebuilt automatically when wiki files change (mtime check on each search).

const fs   = require('fs');
const path = require('path');

const WIKI_DIR = path.join(process.cwd(), 'data', 'wiki');

// ── State ───────────────────────────────────────────────────────────────────
let _index     = null;  // Map<word, Array<{file,line,text}>>
let _indexedAt = 0;     // mtime of last full rebuild (max of all files)

// ── Tokenisation ────────────────────────────────────────────────────────────
function tokenise(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, ' ')
        .split(' ')
        .filter(t => t.length > 2);
}

// ── Index building ──────────────────────────────────────────────────────────

/**
 * Reads all .md/.txt files in data/wiki/ and builds an inverted index.
 * Called automatically on first search or when files have changed.
 */
function buildIndex() {
    if (!fs.existsSync(WIKI_DIR)) {
        fs.mkdirSync(WIKI_DIR, { recursive: true });
    }

    const files = fs.readdirSync(WIKI_DIR)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
        .map(f => path.join(WIKI_DIR, f));

    if (files.length === 0) {
        _index = new Map();
        _indexedAt = Date.now();
        return;
    }

    const maxMtime = Math.max(...files.map(f => fs.statSync(f).mtimeMs));
    if (_index && maxMtime <= _indexedAt) return; // no change

    const newIndex = new Map();

    for (const filePath of files) {
        const fileName = path.basename(filePath);
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        lines.forEach((text, idx) => {
            const words = tokenise(text);
            for (const word of words) {
                if (!newIndex.has(word)) newIndex.set(word, []);
                newIndex.get(word).push({ file: fileName, line: idx + 1, text: text.trim() });
            }
        });
    }

    _index = newIndex;
    _indexedAt = maxMtime;
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Search the wiki for a natural-language query.
 * @param {string} query  Space-separated keywords.
 * @param {number} topN   Maximum results to return (default 5).
 * @returns {Array<{file:string, line:number, text:string, score:number}>}
 */
function search(query, topN = 5) {
    buildIndex(); // no-op if already up to date

    if (!_index || _index.size === 0) return [];

    const words = tokenise(query);
    const scores = new Map(); // key → score

    for (const word of words) {
        const hits = _index.get(word) || [];
        for (const hit of hits) {
            const key = `${hit.file}:${hit.line}`;
            scores.set(key, (scores.get(key) || { hit, count: 0 }));
            scores.get(key).count += 1;
        }
    }

    return [...scores.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, topN)
        .map(({ hit, count }) => ({ ...hit, score: count }));
}

/**
 * Format search results as a compact string suitable for LLM context injection.
 * @param {string} query
 * @param {number} topN
 * @returns {string}  Empty string when no wiki content is available.
 */
function searchForPrompt(query, topN = 3) {
    const results = search(query, topN);
    if (results.length === 0) return '';
    const lines = results.map(r => `[${r.file}:${r.line}] ${r.text}`);
    return `\n\n### Wiki Knowledge (query: "${query}")\n${lines.join('\n')}`;
}

module.exports = { buildIndex, search, searchForPrompt };
