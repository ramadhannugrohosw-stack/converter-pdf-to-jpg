"use strict";

const archiver = require("archiver");
const path = require("path");
const fs = require("fs");

/**
 * Sanitize nama file untuk header Content-Disposition (hindari karakter aneh).
 * Tidak mengubah ekstensi jika sudah ada.
 */
function sanitizeFileName(fileName, fallback = "pdf-to-jpg.zip") {
  if (!fileName || typeof fileName !== "string") return fallback;

  // Hilangkan karakter kontrol & karakter yang sering bikin masalah di header
  let safe = fileName
    .replace(/[\r\n\t]/g, " ")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // karakter terlarang Windows + kontrol ASCII
    .trim();

  if (!safe) return fallback;

  // Pastikan ekstensi .zip
  if (!safe.toLowerCase().endsWith(".zip")) safe += ".zip";

  // Batasi panjang biar aman
  if (safe.length > 120) {
    const ext = ".zip";
    safe = safe.slice(0, 120 - ext.length) + ext;
  }

  return safe;
}

/**
 * Validate list file input dan normalisasi path yang akan dimasukkan ke zip.
 * @param {string[]} files
 * @returns {string[]} files yang valid
 */
function normalizeAndValidateFiles(files) {
  if (!Array.isArray(files)) throw new Error("files must be an array");

  const out = [];
  for (const f of files) {
    if (typeof f !== "string" || !f.trim()) continue;
    const p = path.resolve(f);
    if (!fs.existsSync(p)) continue;
    const stat = fs.statSync(p);
    if (!stat.isFile()) continue;
    out.push(p);
  }

  if (out.length === 0) throw new Error("No valid files to zip");
  return out;
}

/**
 * Stream ZIP ke response HTTP.
 *
 * @param {import("express").Response} res - Express response
 * @param {string[]} files - daftar path file yang akan di-zip
 * @param {object} [options]
 * @param {string} [options.zipName] - nama zip di header
 * @param {string} [options.folder] - jika diisi, file akan dimasukkan ke folder ini di dalam zip
 * @param {number} [options.level] - kompresi zlib 0-9 (default 9)
 */
async function streamZip(res, files, options = {}) {
  const {
    zipName = "pdf-to-jpg.zip",
    folder = "",
    level = 9,
  } = options;

  const safeZipName = sanitizeFileName(zipName);
  const validFiles = normalizeAndValidateFiles(files);

  // Header untuk download file
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeZipName}"`);
  res.setHeader("Cache-Control", "no-store");

  const archive = archiver("zip", { zlib: { level: Math.min(Math.max(level, 0), 9) } });

  return new Promise((resolve, reject) => {
    // Jika archiver error, reject
    archive.on("error", (err) => reject(err));

    // Jika response error (client disconnect), reject (optional)
    res.on("error", (err) => reject(err));

    // Selesai ketika response benar-benar selesai mengirim
    res.on("finish", resolve);

    archive.pipe(res);

    for (const filePath of validFiles) {
      const nameInZip = folder
        ? path.posix.join(folder.replace(/\\/g, "/"), path.basename(filePath))
        : path.basename(filePath);

      archive.file(filePath, { name: nameInZip });
    }

    archive.finalize().catch(reject);
  });
}

module.exports = {
  streamZip,
  sanitizeFileName, // optional export (berguna kalau mau dipakai di server.js)
};
