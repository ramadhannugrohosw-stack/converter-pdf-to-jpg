"use strict";

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { runGhostscript, listJpgFiles } = require("./ghostscript");
const { streamZip } = require("./zip");

const app = express();

// =========================
// Config
// =========================
const PORT = parseInt(process.env.PORT || "3000", 10);

// BIN_DIR dipakai untuk Windows portable Ghostscript (gswin64c.exe + DLL).
// Di Linux/Ubuntu biasanya tidak dipakai, karena Ghostscript dipanggil via "gs" dari PATH.
const BIN_DIR = process.env.GS_BIN_DIR || path.join(__dirname, "..", "bin");

const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB || "50", 10);

// Temp upload directory
const UPLOAD_DIR = path.join(os.tmpdir(), "pdf2jpg_uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// =========================
// Helpers
// =========================
function sanitizeBaseName(name) {
  const base = (name || "pdf").replace(/\.[^/.]+$/, "");
  return (
    base
      // buang karakter aneh untuk nama file (aman untuk header & filesystem)
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "pdf"
  );
}

function isLikelyPdf(filePath) {
  // PDF biasanya diawali dengan "%PDF"
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.toString() === "%PDF";
  } catch {
    return false;
  }
}

function safeUnlink(filePath) {
  try {
    if (filePath) fs.unlinkSync(filePath);
  } catch {}
}

function safeRm(dirPath) {
  try {
    if (dirPath) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {}
}

// =========================
// Multer upload
// =========================
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const nameOk = (file.originalname || "").toLowerCase().endsWith(".pdf");
    const mimeOk = file.mimetype === "application/pdf";
    // Kadang mimetype bisa kosong/berbeda tergantung client.
    // Kita toleransi jika extension .pdf, lalu kita validasi magic bytes setelah upload.
    if (!nameOk && !mimeOk) {
      return cb(new Error("Only PDF allowed (multipart field name must be 'file')"));
    }
    cb(null, true);
  },
});

// =========================
// Routes
// =========================
app.get("/", (req, res) => {
  res.type("text/plain").send(
    `PDF→JPG API\n\n` +
      `POST /v1/convert/pdf-to-jpg\n` +
      `Content-Type: multipart/form-data\n` +
      `Field: file (PDF)\n\n` +
      `Optional fields:\n` +
      `- dpi (72..600)\n` +
      `- quality (1..100)\n` +
      `- firstPage (>=1)\n` +
      `- lastPage (>=firstPage)\n` +
      `- memoryMB (64..2048)\n\n` +
      `Response: application/zip\n`
  );
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/v1/convert/pdf-to-jpg", upload.single("file"), async (req, res) => {
  const pdfTempPath = req.file?.path;
  if (!pdfTempPath) {
    return res.status(400).json({ error: "file is required (multipart field name: file)" });
  }

  // Validasi magic bytes PDF
  if (!isLikelyPdf(pdfTempPath)) {
    safeUnlink(pdfTempPath);
    return res.status(400).json({ error: "Invalid PDF content (file does not start with %PDF)" });
  }

  // Params with sane bounds
  const dpi = Math.min(Math.max(parseInt(req.body.dpi || "150", 10), 72), 600);
  const quality = Math.min(Math.max(parseInt(req.body.quality || "85", 10), 1), 100);
  const firstPage = Math.max(parseInt(req.body.firstPage || "1", 10), 1);
  const lastPage = Math.max(parseInt(req.body.lastPage || "9999", 10), firstPage);
  const memoryMB = Math.min(Math.max(parseInt(req.body.memoryMB || "300", 10), 64), 2048);

  // Work dirs
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf2jpg_work_"));
  const outputDir = path.join(workDir, "out");
  fs.mkdirSync(outputDir, { recursive: true });

  // ZIP name dynamic (avoid overwrite; good for curl -OJ)
  const safeBase = sanitizeBaseName(req.file.originalname);
  const zipName = `${safeBase}.zip`;

  try {
    await runGhostscript({
      binDir: BIN_DIR,
      inputPdfPath: pdfTempPath,
      outputDir,
      dpi,
      quality,
      firstPage,
      lastPage,
      memoryMB,
    });

    const jpgs = listJpgFiles(outputDir);
    if (jpgs.length === 0) {
      return res.status(422).json({ error: "No JPG generated. Invalid PDF?" });
    }

    // Stream ZIP result
    await streamZip(res, jpgs, { zipName });
  } catch (e) {
    // Kalau response belum terkirim (belum mulai stream), kita aman kirim JSON
    // Jika streaming sudah berjalan, error akan muncul di client sebagai koneksi terputus.
    if (!res.headersSent) {
      res.status(500).json({ error: e?.message || "convert failed" });
    }
  } finally {
    safeUnlink(pdfTempPath);
    safeRm(workDir);
  }
});

// =========================
// Error handler (multer & others)
// =========================
app.use((err, req, res, next) => {
  // Multer file size limit
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `File too large. Max ${MAX_MB}MB` });
  }

  if (err) {
    return res.status(400).json({ error: err.message || "Bad request" });
  }

  next();
});

// =========================
// Start server
// =========================
app.listen(PORT, () => {
  console.log(`PDF→JPG API running: http://localhost:${PORT}`);
  console.log(`Platform: ${os.platform()}`);
  console.log(`MAX_UPLOAD_MB: ${MAX_MB}`);
  console.log(`GS_BIN (override): ${process.env.GS_BIN || "(not set)"}`);
  console.log(`GS_BIN_DIR (windows portable): ${BIN_DIR}`);
});
