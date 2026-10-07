const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { badRequest } = require('../utils/http');

fs.mkdirSync(config.paths.uploads, { recursive: true });

// Extension is derived from the verified MIME type, never from the client-supplied filename.
const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.paths.uploads),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (!EXT[file.mimetype]) return cb(badRequest('Evidence must be a JPG, PNG, WEBP, GIF, MP4 or WEBM file'));
    cb(null, true);
  },
});

/** Removes files from disk (used when the DB transaction fails after multer already saved them). */
function discardFiles(files = []) {
  for (const f of files) fs.unlink(f.path, () => {});
}

module.exports = { upload, discardFiles };
