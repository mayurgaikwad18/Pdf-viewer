'use strict';

/**
 * Document Portal server
 *
 * - Public visitors can list, preview (in the browser) and download files.
 * - The admin (password protected) can upload files of any format, delete
 *   files, and change the admin password.
 *
 * Run with:  npm start        (default port 3000, override with PORT env var)
 * Admin page: http://localhost:3000/admin
 */

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file
const MAX_FILES_PER_UPLOAD = 20;

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const FILES_DB = path.join(DATA_DIR, 'files.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.txt');

// ---------------------------------------------------------------------------
// Startup: folders and persisted state
// ---------------------------------------------------------------------------
for (const dir of [UPLOAD_DIR, DATA_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function scryptHash(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function writePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(
    AUTH_FILE,
    JSON.stringify({ salt, hash: scryptHash(password, salt) }, null, 2)
  );
}

function verifyPassword(password) {
  try {
    const { salt, hash } = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    const expected = Buffer.from(hash, 'hex');
    const actual = Buffer.from(scryptHash(password, salt), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// First run: create the admin password (env var ADMIN_PASSWORD, or "admin123").
if (!fs.existsSync(AUTH_FILE)) {
  writePassword(process.env.ADMIN_PASSWORD || 'admin123');
}

function getSessionSecret() {
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret);
  return secret;
}

function loadFiles() {
  try {
    return JSON.parse(fs.readFileSync(FILES_DB, 'utf8'));
  } catch {
    return [];
  }
}

function saveFiles(files) {
  fs.writeFileSync(FILES_DB, JSON.stringify(files, null, 2));
}

// ---------------------------------------------------------------------------
// File type helpers
// ---------------------------------------------------------------------------
const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed'
};

// Types that are safe to render directly in the browser. Everything else is
// always sent as a download (never rendered inline), so that e.g. uploaded
// HTML files cannot run scripts on this site's origin.
const INLINE_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'video/mp4',
  'video/webm',
  'video/ogg'
]);

// Multipart filenames arrive latin1-decoded; convert back to UTF-8 so that
// non-english file names are stored correctly.
function decodeOriginalName(name) {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

function resolveMime(originalName, reportedMime) {
  const ext = path.extname(originalName).toLowerCase();
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  if (reportedMime && reportedMime !== 'application/octet-stream') return reportedMime;
  return 'application/octet-stream';
}

function contentDisposition(type, filename) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'file';
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function toPublicFile(record) {
  return {
    id: record.id,
    name: record.name,
    size: record.size,
    mime: record.mime,
    uploadedAt: record.uploadedAt,
    previewable: INLINE_MIME.has(record.mime),
    viewUrl: `/file/${record.id}`,
    downloadUrl: `/file/${record.id}/download`
  };
}

function findRecord(id) {
  return loadFiles().find((f) => f.id === id);
}

// ---------------------------------------------------------------------------
// Upload handling (multer)
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const original = decodeOriginalName(file.originalname);
    let ext = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (ext.length > 12) ext = '';
    cb(null, crypto.randomUUID() + ext);
  }
});

const uploader = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_UPLOAD }
}).array('files', MAX_FILES_PER_UPLOAD);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    name: 'portal.sid',
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
  })
);

app.use(express.static(PUBLIC_DIR));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Not logged in' });
}

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
  }

  const password = req.body && req.body.password;
  if (!password || !verifyPassword(password)) {
    const next = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
    next.count += 1;
    loginAttempts.set(ip, next);
    return res.status(401).json({ error: 'Incorrect password' });
  }

  loginAttempts.delete(ip);
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

app.post('/api/password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(currentPassword || '')) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  writePassword(String(newPassword));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Files API
// ---------------------------------------------------------------------------
app.get('/api/files', (req, res) => {
  const files = loadFiles().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json({ files: files.map(toPublicFile), total: files.length });
});

app.post('/api/upload', requireAdmin, (req, res) => {
  uploader(req, res, (err) => {
    if (err) {
      // Remove any files multer already wrote to disk before the error.
      for (const f of req.files || []) fs.unlink(f.path, () => {});
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is too large. Maximum size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB per file.`
          : err.code === 'LIMIT_FILE_COUNT'
            ? `Too many files. Maximum ${MAX_FILES_PER_UPLOAD} files per upload.`
            : err.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }

    const incoming = req.files || [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: 'No files received' });
    }

    const files = loadFiles();
    const saved = incoming.map((f) => {
      const name = decodeOriginalName(f.originalname) || 'file';
      const record = {
        id: crypto.randomUUID(),
        name,
        storedName: f.filename,
        size: f.size,
        mime: resolveMime(name, f.mimetype),
        uploadedAt: new Date().toISOString()
      };
      files.unshift(record);
      return record;
    });
    saveFiles(files);

    res.json({ uploaded: saved.map(toPublicFile) });
  });
});

app.delete('/api/files/:id', requireAdmin, (req, res) => {
  const files = loadFiles();
  const index = files.findIndex((f) => f.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'File not found' });

  const [removed] = files.splice(index, 1);
  saveFiles(files);
  fs.unlink(path.join(UPLOAD_DIR, removed.storedName), () => {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// File serving (public)
// ---------------------------------------------------------------------------
function applyFileHeaders(res, record, dispositionType) {
  res.setHeader('Content-Type', record.mime || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', contentDisposition(dispositionType, record.name));
  res.setHeader('Cache-Control', 'private, max-age=3600');
}

function serveFile(record, dispositionType, res) {
  applyFileHeaders(res, record, dispositionType);
  res.sendFile(path.join(UPLOAD_DIR, record.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).end('File missing on disk');
  });
}

// Open in browser (inline) for previewable types, download for the rest.
app.get('/file/:id', (req, res) => {
  const record = findRecord(req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found' });
  serveFile(record, INLINE_MIME.has(record.mime) ? 'inline' : 'attachment', res);
});

// Always download.
app.get('/file/:id/download', (req, res) => {
  const record = findRecord(req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found' });
  serveFile(record, 'attachment', res);
});

// ---------------------------------------------------------------------------
// Fallback error handler & start
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Document Portal running at http://localhost:${PORT}`);
  console.log(`Admin page:              http://localhost:${PORT}/admin`);
});
