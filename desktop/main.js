const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;
let tray = null;

// Resolve SQLite Database path: ~/.kb/kb.db
const dbPath = path.join(os.homedir(), '.kb', 'kb.db');
const db = new sqlite3.Database(dbPath);

// Resolve package root for spawning Python CLI subprocesses
const projectRoot = path.resolve(__dirname, '..');

// Settings management (stored at ~/.kb/configs/kb-image.json)
const configDir = path.join(os.homedir(), '.kb', 'configs');
const configPath = path.join(configDir, 'kb-image.json');

function loadSettings() {
  const defaults = {
    ollama_host: process.env.OLLAMA_HOST || 'http://localhost:11414',
    ollama_model: process.env.OLLAMA_MODEL || 'gemma4:latest'
  };
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...defaults, ...data };
    }
  } catch (e) {
    console.error('Error reading settings file:', e);
  }
  return defaults;
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
    return { status: 'success' };
  } catch (e) {
    console.error('Error writing settings file:', e);
    throw e;
  }
}

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
    title: 'kb-image',
    icon: path.join(__dirname, 'build', 'icon.png')
  });

  // Load the built Vite application index.html
  // In development, you can point to http://localhost:3000
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist-frontend', 'index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'tray-icon.png');
  const trayIcon = fs.existsSync(trayIconPath) ? trayIconPath : path.join(__dirname, 'package.json');
  
  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('kb-image library manager');
    
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    updateTrayMenu();
    setInterval(updateTrayMenu, 30000); // periodically update menu
  } catch (e) {
    console.error('Failed to create tray icon:', e);
  }
}

function updateTrayMenu() {
  if (!tray) return;

  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='image_files'", (err, tables) => {
    const menuTemplate = [
      {
        label: 'Open Image Manager',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' }
    ];

    if (!err && tables && tables.length > 0) {
      db.all("SELECT file_name FROM image_files ORDER BY created DESC LIMIT 5", (err, rows) => {
        if (!err && rows && rows.length > 0) {
          rows.forEach((row) => {
            menuTemplate.push({
              label: `🖼️ ${row.file_name}`,
              click: () => {
                if (mainWindow) {
                  if (mainWindow.isMinimized()) mainWindow.restore();
                  mainWindow.show();
                  mainWindow.focus();
                }
              }
            });
          });
          menuTemplate.push({ type: 'separator' });
        }
        
        menuTemplate.push({
          label: 'Quit',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        });

        tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
      });
    } else {
      menuTemplate.push({
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      });
      tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

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
// Helper to parse JSON strings from SQLite
function parseImageRow(row) {
  if (!row) return row;

  // Parse tags
  if (typeof row.tags === 'string') {
    try {
      row.tags = JSON.parse(row.tags);
      if (typeof row.tags === 'string') {
        row.tags = JSON.parse(row.tags);
      }
    } catch (e) {
      row.tags = [];
    }
  } else if (!row.tags) {
    row.tags = [];
  }

  // Parse exif_data
  if (typeof row.exif_data === 'string') {
    try {
      row.exif_data = JSON.parse(row.exif_data);
      if (typeof row.exif_data === 'string') {
        row.exif_data = JSON.parse(row.exif_data);
      }
    } catch (e) {
      row.exif_data = {};
    }
  } else if (!row.exif_data) {
    row.exif_data = {};
  }

  return row;
}

// Helper to query single records
function getRecord(imageHash) {
  return new Promise((resolve) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='image_files'", (err, row) => {
      if (row) {
        db.get("SELECT *, 'file' as origin FROM image_files WHERE image_hash = ?", [imageHash], (err, fileRow) => {
          if (fileRow) resolve(parseImageRow(fileRow));
          else {
            db.get("SELECT *, 'web' as origin FROM web_images WHERE image_hash = ?", [imageHash], (err, webRow) => {
              resolve(parseImageRow(webRow) || null);
            });
          }
        });
      } else {
        db.get("SELECT *, 'web' as origin FROM web_images WHERE image_hash = ?", [imageHash], (err, webRow) => {
          resolve(parseImageRow(webRow) || null);
        });
      }
    });
  });
}

// Prompts for Ollama AI operations (1:1 with Python codebase)
const CLASSIFY_SYS_PROMPT = `# You are an image classification assistant.

## Goal
Classify the given image into one of the following classes:
- nature: landscapes, plants, animals, outdoors, weather, etc.
- people: portraits, groups of people, selfies, etc.
- screenshots: desktop or phone screenshots, code snippets, application windows, etc.
- diagrams: charts, graphs, flowcharts, technical drawings, etc.
- nsfw: explicit content, nudity, violence, etc.
- memes: funny images, internet jokes, text overlay images, etc.
- other: anything that does not fit into the other categories.

## Output Format
Your response MUST be exactly one of the classes listed above, and nothing else.
Do not include any explanation or extra text.`;

const TAGGING_SYS_PROMPT = `# You are an image tagging assistant.

## Goal
Generate a list of 5-10 descriptive tags, keywords, or labels for the given image. 
Respond ONLY with a comma-separated list of tags, e.g., "mountain, landscape, sunset, snow". 
Do not include explanations, markdown formatting, or extra text.`;

const DESCRIBE_SYS_PROMPT = `# You are an image description assistant.

## Context
The reason *you specifically* were assigned to this assignment is because the *user* has
a large collection of images that are spread across multiple NAS servers and phone backups,
old laptop, backups, and cloud storage exports, as well as thousands of images takes from a
DSLR camera. The user is trying to organize and catalog all of these images in a single, unified image database;
deduplicating and assigning unique metadata, a la *your descriptions*.

The user has confidince in your unique ability to understand images at a deep level and know how to best
represent the image in a concise yet highly search-optimized way.

Images will be of all types of image classes, including but not limited to: nature, people, screenshots, diagrams, nsfw, memes, and more.
You must be able to understand the unique context of each image and generate descriptions that are optimized for search and discovery.

## Instructions
Given the image, generate a description of the image that captures the following key elements:

- Subject or Subjects of the image; Who or what is the *main focus* of the image?
- Context of the image; Where is the image taken? What is happening in the image?
- Visual elements that stand out; What text search terms would be most effective for finding this image in a large database of images?

## Constraints
- Some images may be blurry, too dark, or otherwise undescribable.
  In these cases the assigned description should be "undecipherable image".
  Do not assign any other description to images that are blurry, too dark, or otherwise undescribable.
- ALWAYS do your best to generate a description for each image, but if guidelines *were* to prevent you from describing an image (e.g. NSFW content), assign the description "restricted content" and do not provide any other description.
- Always follow the guidelines above. If an image violates any of the guidelines, assign the appropriate description as outlined above and do not provide any other description.

## Output Format
Your response may be in any format you choose to represent the description, the user trusts and relies on your judgement.`;

async function callOllamaChat(systemPrompt, userPrompt, base64Image) {
  const settings = loadSettings();
  const ollamaHost = settings.ollama_host;
  const ollamaModel = settings.ollama_model;
  
  let cleanBase64 = base64Image;
  if (base64Image.includes(';base64,')) {
    cleanBase64 = base64Image.split(';base64,')[1];
  }

  const payload = {
    model: ollamaModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt, images: [cleanBase64] }
    ],
    stream: false,
    options: {
      temperature: 0
    }
  };

  const response = await fetch(`${ollamaHost}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.message.content.trim();
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
      else resolve(rows.map(parseImageRow));
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
  // Query raw row to get full base64 image data (uncached parseImageRow)
  return new Promise((resolve, reject) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='image_files'", (err, tableRow) => {
      const queryDb = (tableName) => {
        db.get(`SELECT image FROM ${tableName} WHERE image_hash = ?`, [imageHash], (err, imgRow) => {
          if (imgRow) resolve(imgRow.image);
          else reject(new Error('Image file not found'));
        });
      };
      if (tableRow) {
        db.get("SELECT image FROM image_files WHERE image_hash = ?", [imageHash], (err, imgRow) => {
          if (imgRow) resolve(imgRow.image);
          else queryDb('web_images');
        });
      } else {
        queryDb('web_images');
      }
    });
  });
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
    const isDev = process.env.NODE_ENV === 'development';
    let cmd = 'uv run kb-image';
    let execOpts = { cwd: projectRoot };
    
    if (!isDev) {
      const localBinName = os.platform() === 'win32' ? 'kb-image.exe' : 'kb-image';
      const localBinPath = path.join(os.homedir(), '.local', 'bin', localBinName);
      if (fs.existsSync(localBinPath)) {
        cmd = `"${localBinPath}"`;
      } else {
        cmd = 'kb-image';
      }
      execOpts = {};
    }
    
    exec(`${cmd} import --url "${url}"`, execOpts, (err, stdout, stderr) => {
      if (err) {
        console.error(`Import subprocess error: ${stderr}`);
        reject(err);
      } else {
        resolve({ status: 'success' });
      }
    });
  });
});

ipcMain.handle('ai-describe-image', async (event, { imageHash, origin }) => {
  // Fetch full row including base64 image data
  const row = await new Promise((resolve, reject) => {
    const tableName = origin === 'file' ? 'image_files' : 'web_images';
    db.get(`SELECT image FROM ${tableName} WHERE image_hash = ?`, [imageHash], (err, imgRow) => {
      if (err) reject(err);
      else resolve(imgRow);
    });
  });
  if (!row || !row.image) throw new Error('Image data not found in DB');
  
  const description = await callOllamaChat(DESCRIBE_SYS_PROMPT, "Describe the attached image.", row.image);
  
  const tableName = origin === 'file' ? 'image_files' : 'web_images';
  return new Promise((resolve, reject) => {
    db.run(`UPDATE ${tableName} SET description = ? WHERE image_hash = ?`, [description, imageHash], function (err) {
      if (err) reject(err);
      else resolve({ status: 'success', description });
    });
  });
});

ipcMain.handle('ai-tag-image', async (event, { imageHash, origin }) => {
  // Fetch full row including base64 image data
  const row = await new Promise((resolve, reject) => {
    const tableName = origin === 'file' ? 'image_files' : 'web_images';
    db.get(`SELECT image FROM ${tableName} WHERE image_hash = ?`, [imageHash], (err, imgRow) => {
      if (err) reject(err);
      else resolve(imgRow);
    });
  });
  if (!row || !row.image) throw new Error('Image data not found in DB');
  
  const content = await callOllamaChat(TAGGING_SYS_PROMPT, "Tag this image.", row.image);
  const tags = content.split(',').map(t => t.strip ? t.strip().toLowerCase() : t.trim().toLowerCase()).filter(Boolean);
  const tagsJson = JSON.stringify(tags);
  
  const tableName = origin === 'file' ? 'image_files' : 'web_images';
  return new Promise((resolve, reject) => {
    db.run(`UPDATE ${tableName} SET tags = ? WHERE image_hash = ?`, [tagsJson, imageHash], function (err) {
      if (err) reject(err);
      else resolve({ status: 'success', tags });
    });
  });
});

ipcMain.handle('ai-classify-image', async (event, { imageHash, origin }) => {
  // Fetch full row including base64 image data
  const row = await new Promise((resolve, reject) => {
    const tableName = origin === 'file' ? 'image_files' : 'web_images';
    db.get(`SELECT image FROM ${tableName} WHERE image_hash = ?`, [imageHash], (err, imgRow) => {
      if (err) reject(err);
      else resolve(imgRow);
    });
  });
  if (!row || !row.image) throw new Error('Image data not found in DB');
  
  const content = await callOllamaChat(CLASSIFY_SYS_PROMPT, "Classify the attached image.", row.image);
  let classification = content.toLowerCase();
  
  const validClasses = ['nature', 'people', 'screenshots', 'diagrams', 'nsfw', 'memes', 'other'];
  if (!validClasses.includes(classification)) {
    classification = 'other';
  }
  
  const tableName = origin === 'file' ? 'image_files' : 'web_images';
  return new Promise((resolve, reject) => {
    db.run(`UPDATE ${tableName} SET classification = ? WHERE image_hash = ?`, [classification, imageHash], function (err) {
      if (err) reject(err);
      else resolve({ status: 'success', classification });
    });
  });
});

ipcMain.handle('get-settings', async () => {
  return loadSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
  return saveSettings(settings);
});

ipcMain.handle('get-unprocessed-images', async (event, { type, limit }) => {
  const tables = await new Promise((resolve) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
      if (err) resolve([]);
      else resolve(rows.map(r => r.name));
    });
  });

  let sqlParts = [];
  if (type === 'description') {
    if (tables.includes('image_files')) {
      sqlParts.push("SELECT image_hash, file_name, 'file' as origin FROM image_files WHERE description IS NULL OR description = ''");
    }
    if (tables.includes('web_images')) {
      sqlParts.push("SELECT image_hash, file_name, 'web' as origin FROM web_images WHERE description IS NULL OR description = ''");
    }
  } else if (type === 'tags') {
    if (tables.includes('image_files')) {
      sqlParts.push("SELECT image_hash, file_name, 'file' as origin FROM image_files WHERE tags IS NULL OR tags = '' OR tags = '[]'");
    }
    if (tables.includes('web_images')) {
      sqlParts.push("SELECT image_hash, file_name, 'web' as origin FROM web_images WHERE tags IS NULL OR tags = '' OR tags = '[]'");
    }
  } else if (type === 'classification') {
    if (tables.includes('image_files')) {
      sqlParts.push("SELECT image_hash, file_name, 'file' as origin FROM image_files WHERE classification IS NULL OR classification = '' OR classification = 'other'");
    }
    if (tables.includes('web_images')) {
      sqlParts.push("SELECT image_hash, file_name, 'web' as origin FROM web_images WHERE classification IS NULL OR classification = '' OR classification = 'other'");
    }
  }

  if (sqlParts.length === 0) return [];

  let sql = sqlParts.join(' UNION ALL ') + " LIMIT ?";
  return new Promise((resolve, reject) => {
    db.all(sql, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});
