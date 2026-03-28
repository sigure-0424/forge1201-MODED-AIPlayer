// runtime_config.js — Issue 12: Runtime modification of system constants with named presets
// All mutable values live here. bot_actuator.js imports and reads these at call time (not at module load).
// Presets are persisted to data/system_presets.json.

const fs = require('fs');
const path = require('path');

const PRESETS_FILE = path.join(process.cwd(), 'data', 'system_presets.json');

// ── Mutable runtime constants ──────────────────────────────────────────────
const config = {
    // Combat
    MELEE_RANGE: 3.5,           // Max distance (blocks) for melee engagement
    RETREAT_HEALTH_PCT: 0.25,   // Retreat when HP falls below this fraction
    CRIT_FALL_WAIT_MS: 200,     // Milliseconds to wait in fall phase before crit swing
    PASSIVE_DEFENSE_INTERVAL_MS: 1500, // Passive defense poll interval

    // Pathfinder
    PATHFINDER_THINK_TIMEOUT_MS: 5000,
    PATHFINDER_TICK_TIMEOUT: 5,

    // Collection
    COLLECT_TIMEOUT_MS: 20000,  // Per-block collect timeout cap
    MLG_TRIGGER_FALL_DIST: 4,   // Fall distance to trigger MLG water bucket
    MLG_GROUND_DIST_THRESHOLD: 6, // Ground distance at which MLG fires

    // Autonomic
    AUTONOMIC_EAT_FOOD_THRESHOLD: 18, // Eat when food drops below this
    AUTONOMIC_EAT_INTERVAL_MS: 8000,

    // LLM
    LLM_COOLDOWN_MS: 5000,
    LLM_FAILURE_CAP: 3,         // Consecutive failures before graceful halt
};

// ── Preset management ──────────────────────────────────────────────────────

function loadPresetsFile() {
    try {
        if (fs.existsSync(PRESETS_FILE)) {
            return JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function savePresetsFile(presets) {
    try {
        fs.mkdirSync(path.dirname(PRESETS_FILE), { recursive: true });
        fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
    } catch (e) {
        console.error('[RuntimeConfig] Could not save presets:', e.message);
    }
}

/**
 * Apply a named preset or an arbitrary patch object to the live config.
 * @param {string|Object} presetNameOrPatch  Named preset string OR key/value patch object.
 * @returns {{ ok: boolean, applied: Object, message: string }}
 */
function patch(presetNameOrPatch) {
    let delta;

    if (typeof presetNameOrPatch === 'string') {
        const presets = loadPresetsFile();
        delta = presets[presetNameOrPatch];
        if (!delta) {
            return { ok: false, applied: {}, message: `Preset "${presetNameOrPatch}" not found.` };
        }
    } else {
        delta = presetNameOrPatch;
    }

    const applied = {};
    for (const [k, v] of Object.entries(delta)) {
        if (Object.prototype.hasOwnProperty.call(config, k)) {
            config[k] = v;
            applied[k] = v;
        }
    }
    return { ok: true, applied, message: `Applied ${Object.keys(applied).length} setting(s).` };
}

/**
 * Save the current config (or a subset) as a named preset.
 * @param {string} name  Preset name.
 * @param {Object|null} subset  Keys to save. Defaults to entire config.
 */
function savePreset(name, subset = null) {
    const presets = loadPresetsFile();
    presets[name] = subset || { ...config };
    savePresetsFile(presets);
    return { ok: true, message: `Preset "${name}" saved.` };
}

/**
 * List all saved preset names.
 * @returns {string[]}
 */
function listPresets() {
    return Object.keys(loadPresetsFile());
}

module.exports = { config, patch, savePreset, listPresets };
