const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;

// Resolve SQLite Database path: ~/.kb/kb.db
const dbPath = path.join(os.homedir(), '.kb', 'kb.db');
const db = new sqlite3.Database(dbPath);

// Resolve package root for spawning Python CLI subprocesses
const projectRoot = path.resolve(__dirname, '..');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    // Earth-toned initial background
    backgroundColor: '#F4EFEA',
    title: 'kb-image'
  });

  // Load the built Vite application index.html
  // In development, you can point to http://localhost:3000
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist-frontend', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db.close();
    app.quit();
  }
});

// Helper to query single records
function getRecord(imageHash) {
  return new Promise((resolve) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='image_files'", (err, row) => {
      if (row) {
        db.get("SELECT *, 'file' as origin FROM image_files WHERE image_hash = ?", [imageHash], (err, fileRow) => {
          if (fileRow) resolve(fileRow);
          else {
            db.get("SELECT *, 'web' as origin FROM web_images WHERE image_hash = ?", [imageHash], (err, webRow) => {
              resolve(webRow || null);
            });
          }
        });
      } else {
        db.get("SELECT *, 'web' as origin FROM web_images WHERE image_hash = ?", [imageHash], (err, webRow) => {
          resolve(webRow || null);
        });
      }
    });
  });
}

// IPC Handlers
ipcMain.handle('get-images', async (event, args) => {
  const { limit = 24, offset = 0, classification, tag, search } = args || {};

  const tables = await new Promise((resolve) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
      if (err) resolve([]);
      else resolve(rows.map(r => r.name));
    });
  });

  const selectFields = (
    "file_name, extension, size, created, modified, hight, width, " +
    "exif_data, thumbnail, image_hash, description, tags, classification"
  );

  let sqlParts = [];
  if (tables.includes('image_files')) {
    sqlParts.push(`SELECT ${selectFields}, 'file' as origin FROM image_files`);
  }
  if (tables.includes('web_images')) {
    sqlParts.push(`SELECT ${selectFields}, 'web' as origin FROM web_images`);
  }

  if (sqlParts.length === 0) return [];

  let subquery = sqlParts.join(' UNION ALL ');
  let sql = `SELECT * FROM (${subquery}) WHERE 1=1`;
  let params = [];

  if (classification) {
    sql += " AND classification = ?";
    params.push(classification);
  }
  if (tag) {
    sql += " AND tags LIKE ?";
    params.push(`%"${tag}"%`);
  }
  if (search) {
    sql += " AND (file_name LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += " ORDER BY created DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle('get-image-details', async (event, imageHash) => {
  const row = await getRecord(imageHash);
  if (!row) throw new Error('Image not found');
  // Exclude full raw base64 column from details query to save IPC overhead
  delete row.image;
  return row;
});

ipcMain.handle('get-image-file', async (event, imageHash) => {
  const row = await getRecord(imageHash);
  if (!row || !row.image) throw new Error('Image file not found');
  return row.image; // Returns raw base64 string
});

ipcMain.handle('update-image-tags', async (event, { imageHash, tags, origin }) => {
  const tableName = origin === 'file' ? 'image_files' : 'web_images';
  const tagsJson = JSON.stringify(tags);
  return new Promise((resolve, reject) => {
    db.run(`UPDATE ${tableName} SET tags = ? WHERE image_hash = ?`, [tagsJson, imageHash], function (err) {
      if (err) reject(err);
      else resolve({ status: 'success', tags });
    });
  });
});

ipcMain.handle('import-web-image', async (event, url) => {
  return new Promise((resolve, reject) => {
    // Spawns Python CLI to reuse downloading, thumbnailing, and EXIF logic
    // Calls "uv run kb-image import --url <url>"
    exec(`uv run kb-image import --url "${url}"`, { cwd: projectRoot }, (err, stdout, stderr) => {
      if (err) {
        console.error(`Import subprocess error: ${stderr}`);
        reject(err);
      } else {
        resolve({ status: 'success' });
      }
    });
  });
});
