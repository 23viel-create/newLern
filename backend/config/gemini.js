const fs = require('fs');
const path = require('path');

const AI_KEYS_FILE = path.join(__dirname, '../../data/ai_keys.json');

// In-memory quota tracking per key
const keyStats = {};

function _loadSavedKeys() {
  try {
    const raw = fs.readFileSync(AI_KEYS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.keys) ? data.keys.filter(k => k && k.trim()) : [];
  } catch {
    return [];
  }
}

function _loadEnvKeys() {
  const keys = [];
  // Support any number of GEMINI_API_KEY_N env vars
  for (let i = 1; i <= 100; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (!k || !k.trim()) break; // stop at first gap
    keys.push(k.trim());
  }
  return keys;
}

function getApiKeys() {
  const saved = _loadSavedKeys();
  const env = _loadEnvKeys();
  const all = [...saved];
  for (const k of env) {
    if (!all.includes(k)) all.push(k);
  }
  return all;
}

function saveApiKeys(keys) {
  const valid = keys.filter(k => k && k.trim());
  fs.mkdirSync(path.dirname(AI_KEYS_FILE), { recursive: true });
  fs.writeFileSync(AI_KEYS_FILE, JSON.stringify({ keys: valid }, null, 2));
}

let _keyIndex = 0;
function getNextKey() {
  const keys = getApiKeys();
  if (!keys.length) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[_keyIndex % keys.length];
    _keyIndex = (_keyIndex + 1) % keys.length;
    const stats = keyStats[key] || { chars: 0, errors: 0 };
    const inCooldown = stats.cooldownUntil && stats.cooldownUntil > now;
    if (!inCooldown && stats.errors < 3) return key;
  }
  return null;
}

function recordUsage(key, chars) {
  if (!keyStats[key]) keyStats[key] = { chars: 0, errors: 0, lastUsed: 0 };
  keyStats[key].chars += chars;
  keyStats[key].lastUsed = Date.now();
}

function recordError(key) {
  if (!keyStats[key]) keyStats[key] = { chars: 0, errors: 0, lastUsed: 0 };
  keyStats[key].errors += 1;
}

function recordQuotaExhausted(key) {
  if (!keyStats[key]) keyStats[key] = { chars: 0, errors: 0, lastUsed: 0 };
  // Put key into 2-hour cooldown instead of permanently discarding it
  keyStats[key].cooldownUntil = Date.now() + 2 * 60 * 60 * 1000;
  keyStats[key].quotaExhausted = true;
}

function getKeyStatus() {
  const keys = getApiKeys();
  const now = Date.now();
  return keys.map((k, i) => {
    const stats = keyStats[k] || { chars: 0, errors: 0 };
    const inCooldown = !!(stats.cooldownUntil && stats.cooldownUntil > now);
    const cooldownMinutes = inCooldown ? Math.ceil((stats.cooldownUntil - now) / 60000) : 0;
    return {
      index: i + 1,
      masked: k.length > 10 ? k.slice(0, 6) + '…' + k.slice(-4) : '(קצר)',
      charsUsed: stats.chars,
      errors: stats.errors,
      healthy: !inCooldown && stats.errors < 3,
      inCooldown,
      cooldownMinutes,
    };
  });
}

module.exports = { getApiKeys, saveApiKeys, getNextKey, recordUsage, recordError, recordQuotaExhausted, getKeyStatus };
