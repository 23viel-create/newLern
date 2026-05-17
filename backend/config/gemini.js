require('dotenv').config();

function getApiKeys() {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key && key.trim()) keys.push(key.trim());
  }
  return keys;
}

module.exports = {
  getApiKeys,
  MAX_KEYS: 5,
};
