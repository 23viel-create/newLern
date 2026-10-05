// Must be first line — bypass corporate/kosher TLS filters (Rimon, NetSpark)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Data directory resolution ────────────────────────────────────────────────
// In production the asar is read-only; user data must live in a writable path.
// In dev mode fall back to the repo's own data/ directory.
const dataDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'data')
  : path.join(__dirname, '../data');

process.env.APP_DATA_DIR = dataDir;

// Scaffold writable data directories on first launch
const dirsToCreate = [
  dataDir,
  path.join(dataDir, 'summaries_tree', 'root'),
  path.join(dataDir, 'articles'),
  path.join(dataDir, 'backups'),
  path.join(dataDir, 'books'),
  path.join(dataDir, 'notes'),
];
for (const d of dirsToCreate) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Seed bundled articles to userData on first install
if (app.isPackaged) {
  const bundledArticles = path.join(process.resourcesPath, 'data', 'articles');
  const userArticles    = path.join(dataDir, 'articles');
  if (fs.existsSync(bundledArticles)) {
    for (const f of fs.readdirSync(bundledArticles)) {
      const dest = path.join(userArticles, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(bundledArticles, f), dest);
      }
    }
  }
}

// ── Start Express backend ────────────────────────────────────────────────────
require('../backend/server.js');

// ── Create browser window ────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
    title: 'מערכת למידה פעילה',
    show:  false,
  });

  // Show window only once the page has fully rendered (avoids white flash)
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Give Express time to bind port 3000 before loading
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1200);

  // Open external links in the OS browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
