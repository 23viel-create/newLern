const fs = require('fs');
const path = require('path');

// Derive path from limits.js so APP_DATA_DIR is honoured in production.
// Never use __dirname here — inside app.asar that points to a read-only path.
const AI_KEYS_FILE = require('./limits').AI_KEYS_FILE;

// In-memory quota tracking per key
const keyStats = {};

// ─── Persistence helpers ──────────────────────────────────────────────────────

function _ensureKeysFile() {
  const dir = path.dirname(AI_KEYS_FILE);

  // Auto-correct: if a previous bug created the JSON path as a directory, wipe it.
  if (fs.existsSync(AI_KEYS_FILE) && fs.statSync(AI_KEYS_FILE).isDirectory()) {
    fs.rmSync(AI_KEYS_FILE, { recursive: true, force: true });
  }

  // Ensure the parent directory exists.
  fs.mkdirSync(dir, { recursive: true });

  // Seed an empty store if the file doesn't exist yet.
  if (!fs.existsSync(AI_KEYS_FILE)) {
    fs.writeFileSync(AI_KEYS_FILE, JSON.stringify({ keys: [], lbMode: 'balanced' }, null, 2));
  }
}

function _loadSavedData() {
  try {
    _ensureKeysFile();
    const raw = fs.readFileSync(AI_KEYS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { keys: [], lbMode: 'balanced' };
  }
}

function _persistData(data) {
  _ensureKeysFile();
  fs.writeFileSync(AI_KEYS_FILE, JSON.stringify(data, null, 2));
}

function _loadSavedKeys() {
  const data = _loadSavedData();
  return Array.isArray(data.keys) ? data.keys.filter(k => k && k.trim()) : [];
}

function _loadEnvKeys() {
  const keys = [];
  for (let i = 1; i <= 100; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (!k || !k.trim()) break;
    keys.push(k.trim());
  }
  return keys;
}

function getApiKeys() {
  const saved = _loadSavedKeys();
  const env   = _loadEnvKeys();
  const all   = [...saved];
  for (const k of env) {
    if (!all.includes(k)) all.push(k);
  }
  return all;
}

function saveApiKeys(keys) {
  const valid   = keys.filter(k => k && k.trim());
  const existing = _loadSavedData();
  existing.keys  = valid;
  _persistData(existing);
}

// ─── Load-balancing mode ──────────────────────────────────────────────────────
// 'balanced'     — round-robin all healthy keys regardless of task type
// 'test_focused' — reserve keys[0] for general tasks, keys[1..N] for quiz tasks
//                  (only active when total key count > 4)

let _lbMode = (() => {
  try { return _loadSavedData().lbMode === 'test_focused' ? 'test_focused' : 'balanced'; }
  catch { return 'balanced'; }
})();

function getLbMode() { return _lbMode; }

function setLbMode(mode) {
  _lbMode      = (mode === 'test_focused') ? 'test_focused' : 'balanced';
  const data   = _loadSavedData();
  data.lbMode  = _lbMode;
  _persistData(data);
}

// ─── Key rotation ─────────────────────────────────────────────────────────────

let _keyIndex   = 0; // balanced / fallback index
let _generalIdx = 0; // test_focused: general pool index
let _quizIdx    = 0; // test_focused: quiz pool index

/**
 * Returns the next available key for the given taskType.
 * @param {'general'|'quiz'} taskType
 */
function getNextKey(taskType = 'general') {
  const keys = getApiKeys();
  if (!keys.length) return null;
  const now = Date.now();

  let pool, getIdx, setIdx;

  if (_lbMode === 'test_focused' && keys.length > 4) {
    if (taskType === 'quiz') {
      pool    = keys.slice(1);
      getIdx  = () => _quizIdx;
      setIdx  = (v) => { _quizIdx = v; };
    } else {
      pool    = keys.slice(0, 1);
      getIdx  = () => _generalIdx;
      setIdx  = (v) => { _generalIdx = v; };
    }
  } else {
    pool    = keys;
    getIdx  = () => _keyIndex;
    setIdx  = (v) => { _keyIndex = v; };
  }

  for (let attempt = 0; attempt < pool.length; attempt++) {
    const idx   = getIdx() % pool.length;
    setIdx((idx + 1) % pool.length);
    const key   = pool[idx];
    const stats = keyStats[key] || { chars: 0, errors: 0 };
    const inCooldown = stats.cooldownUntil && stats.cooldownUntil > now;
    if (!inCooldown && stats.errors < 3) return key;
  }
  return null; // entire pool exhausted / in cooldown
}

function recordUsage(key, chars) {
  if (!keyStats[key]) keyStats[key] = { chars: 0, errors: 0, lastUsed: 0 };
  keyStats[key].chars    += chars;
  keyStats[key].lastUsed  = Date.now();
}

function recordError(key) {
  if (!keyStats[key]) keyStats[key] = { chars: 0, errors: 0, lastUsed: 0 };
  keyStats[key].errors += 1;
}

function recordQuotaExhausted(key) {
  if (!keyStats[key]) keyStats[key] = { chars: 0, errors: 0, lastUsed: 0 };
  // 2-hour cooldown instead of permanent discard
  keyStats[key].cooldownUntil  = Date.now() + 2 * 60 * 60 * 1000;
  keyStats[key].quotaExhausted = true;
}

function resetAllCooldowns() {
  for (const key of Object.keys(keyStats)) {
    delete keyStats[key].cooldownUntil;
    delete keyStats[key].quotaExhausted;
    keyStats[key].errors = 0;
  }
}

function getKeyStatus() {
  const keys = getApiKeys();
  const now  = Date.now();
  return keys.map((k, i) => {
    const stats          = keyStats[k] || { chars: 0, errors: 0 };
    const inCooldown     = !!(stats.cooldownUntil && stats.cooldownUntil > now);
    const cooldownMinutes = inCooldown ? Math.ceil((stats.cooldownUntil - now) / 60000) : 0;
    return {
      index:          i + 1,
      masked:         k.length > 10 ? k.slice(0, 6) + '…' + k.slice(-4) : '(קצר)',
      charsUsed:      stats.chars,
      errors:         stats.errors,
      healthy:        !inCooldown && stats.errors < 3,
      inCooldown,
      cooldownMinutes,
    };
  });
}

module.exports = {
  getApiKeys, saveApiKeys,
  getNextKey, recordUsage, recordError, recordQuotaExhausted, getKeyStatus,
  resetAllCooldowns,
  getLbMode, setLbMode,
};
