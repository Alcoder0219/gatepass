import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

const UPLOAD_ROOT = path.resolve(process.cwd(), env.upload.dir);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

ensureDir(UPLOAD_ROOT);

const storageFor = (folder) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ensureDir(path.join(UPLOAD_ROOT, folder))),
    filename: (_req, file, cb) => {
      // Random name — never trust the client's filename on disk.
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });

const ALLOWED = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ],
};

const fileFilter = (allowed) => (_req, file, cb) => {
  if (allowed.includes(file.mimetype)) return cb(null, true);
  return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
};

const limits = { fileSize: env.upload.maxFileSizeMb * 1024 * 1024 };

export const uploadAvatar = multer({
  storage: storageFor('avatars'),
  limits,
  fileFilter: fileFilter(ALLOWED.image),
}).single('profileImage');

export const uploadAttachments = multer({
  storage: storageFor('attachments'),
  limits,
  fileFilter: fileFilter([...ALLOWED.image, ...ALLOWED.document]),
}).array('attachments', 5);

export const uploadSecurityPhoto = multer({
  storage: storageFor('security'),
  limits,
  fileFilter: fileFilter(ALLOWED.image),
}).single('photo');

/** Maps a multer file to the public URL served by `/uploads`. */
export const toPublicUrl = (file, folder) =>
  file ? `/${env.upload.dir}/${folder}/${file.filename}` : '';

export const toAttachment = (file) => ({
  filename: file.filename,
  originalName: file.originalname,
  mimetype: file.mimetype,
  size: file.size,
  url: toPublicUrl(file, 'attachments'),
});

export { UPLOAD_ROOT };
