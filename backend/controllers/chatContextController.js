const fs   = require('fs');
const path = require('path');

const CHAT_CONTEXT_DIR = path.join(__dirname, '../../data/chat_context');

function _ensure() {
  fs.mkdirSync(CHAT_CONTEXT_DIR, { recursive: true });
}

function listFiles() {
  _ensure();
  return fs.readdirSync(CHAT_CONTEXT_DIR).map(name => {
    const stat = fs.statSync(path.join(CHAT_CONTEXT_DIR, name));
    return { name, size: stat.size, createdAt: stat.birthtime.toISOString() };
  });
}

function saveFile(originalName, buffer) {
  _ensure();
  const safe = originalName.replace(/[^\w.א-ת -]/g, '_').slice(0, 100);
  fs.writeFileSync(path.join(CHAT_CONTEXT_DIR, safe), buffer);
  return safe;
}

function deleteFile(name) {
  _ensure();
  const filePath = path.join(CHAT_CONTEXT_DIR, path.basename(name));
  if (!fs.existsSync(filePath)) {
    const err = new Error('קובץ לא נמצא'); err.status = 404; throw err;
  }
  fs.unlinkSync(filePath);
}

function getFilePath(name) {
  const filePath = path.join(CHAT_CONTEXT_DIR, path.basename(name));
  if (!fs.existsSync(filePath)) {
    const err = new Error('קובץ לא נמצא'); err.status = 404; throw err;
  }
  return filePath;
}

module.exports = { listFiles, saveFile, deleteFile, getFilePath };
