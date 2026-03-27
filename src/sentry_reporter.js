// sentry_reporter.js — anonymous crash-reporting with user consent
'use strict';
const fs   = require('fs');
const path = require('path');

const PREFS_FILE = path.join(process.cwd(), 'data', 'crash_report_prefs.json');

const DEFAULT_PREFS = {
    opted:        null,  // null = undecided, 'yes' = opted in, 'no' = opted out
    dontAskAgain: false
};

let _prefs   = null;
let _sentry  = null;
let _enabled = false;

// ─── Prefs persistence ────────────────────────────────────────────────────────

function loadPrefs() {
    try {
        if (fs.existsSync(PREFS_FILE)) {
            _prefs = { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) };
        } else {
            _prefs = { ...DEFAULT_PREFS };
        }
    } catch (_) {
        _prefs = { ...DEFAULT_PREFS };
    }
    return _prefs;
}

function savePrefs(update) {
    if (!_prefs) loadPrefs();
    _prefs = { ..._prefs, ...update };
    try {
        const dir = path.dirname(PREFS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(PREFS_FILE, JSON.stringify(_prefs, null, 2));
    } catch (_) {}
    return { ..._prefs };
}

function getPrefs() {
    if (!_prefs) loadPrefs();
    return { ..._prefs };
}

/** True if the user has not yet made a decision and has not opted out of being asked. */
function needsConsent() {
    const p = getPrefs();
    return !p.dontAskAgain && p.opted === null;
}

function isEnabled() { return _enabled; }

// ─── Sentry init ──────────────────────────────────────────────────────────────

// Sensitive env-var prefixes / keys that must never appear in reports.
const SENSITIVE_KEYS = new Set([
    'OLLAMA_URL', 'OLLAMA_API_KEY', 'OLLAMA_AUTH_SCHEME',
    'MC_HOST', 'MC_PORT', 'BOT_OPTIONS', 'BOT_NAMES', 'BOT_NAME', 'BOT_ID',
    'SENTRY_DSN',
]);

// Replace IP addresses and known hostnames in a string.
function _scrub(str) {
    if (typeof str !== 'string') return str;
    // IPv4
    str = str.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip-redacted]');
    // localhost / hostname patterns
    str = str.replace(/\b(localhost|127\.0\.0\.1)\b/gi, '[host-redacted]');
    return str;
}

function initSentry(dsn) {
    if (!dsn || _enabled) return;
    try {
        const Sentry = require('@sentry/node');
        Sentry.init({
            dsn,
            release: (() => {
                try { return require('../package.json').version; } catch { return '1.0.0'; }
            })(),
            environment: 'production',
            // Block any automatic personal-data collection
            sendDefaultPii: false,
            beforeSend(event) {
                // Strip request, user, and breadcrumb data that might contain PII
                delete event.request;
                delete event.user;
                if (event.breadcrumbs) delete event.breadcrumbs;

                // Scrub environment from extra/contexts
                if (event.extra) {
                    for (const k of SENSITIVE_KEYS) delete event.extra[k];
                }
                if (event.contexts?.runtime) {
                    // Keep runtime version, drop other runtime fields
                }

                // Scrub error messages and stack trace paths
                if (event.exception?.values) {
                    for (const ex of event.exception.values) {
                        if (ex.value) ex.value = _scrub(ex.value);
                        if (ex.stacktrace?.frames) {
                            for (const f of ex.stacktrace.frames) {
                                if (f.filename) f.filename = f.filename.replace(/.*[/\\](src|node_modules)[/\\]/, '.../$1/');
                            }
                        }
                    }
                }
                if (event.message) event.message = _scrub(event.message);

                return event;
            }
        });
        _sentry  = Sentry;
        _enabled = true;
        console.log('[Sentry] Anonymous crash reporting enabled.');
    } catch (e) {
        console.error('[Sentry] Failed to initialize:', e.message);
    }
}

// ─── Public capture helpers ───────────────────────────────────────────────────

function captureException(err, context = {}) {
    if (!_enabled || !_sentry) return;
    try {
        _sentry.withScope(scope => {
            if (context.category) scope.setTag('error_category', String(context.category).slice(0, 64));
            scope.setTag('node_version', process.version);
            scope.setTag('platform', process.platform);
            _sentry.captureException(err);
        });
    } catch (_) {}
}

function captureMessage(msg, level = 'info') {
    if (!_enabled || !_sentry) return;
    try { _sentry.captureMessage(_scrub(msg), level); } catch (_) {}
}

module.exports = { loadPrefs, savePrefs, getPrefs, needsConsent, initSentry, captureException, captureMessage, isEnabled };
