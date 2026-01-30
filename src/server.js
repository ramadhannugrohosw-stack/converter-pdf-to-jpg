"use strict";

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

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

function pickOutputMode(req) {
  // Prioritas: query > body
  const raw =
    (req.query.output || req.query.mode || "").toString().trim() ||
    (req.body?.output || req.body?.mode || "").toString().trim();

  const v = raw.toLowerCase();
  if (v === "zip") return "zip";
  if (v === "1image" || v === "oneimage" || v === "single") return "1image";
  return "auto"; // default behavior
}

/**
 * Gabungkan banyak JPG menjadi 1 gambar panjang (stack vertikal).
 * - width disamakan ke max width; yang lebih kecil di-pad putih di kanan.
 * - output JPEG buffer
 *
 * @param {string[]} jpgPaths
 * @param {{jpegQuality?: number}} opt
 * @returns {Promise<Buffer>}
 */
async function mergeJpgVertical(jpgPaths, opt = {}) {
  if (!Array.isArray(jpgPaths) || jpgPaths.length === 0) {
    throw new Error("mergeJpgVertical: jpgPaths is empty");
  }

  const jpegQuality = Math.min(
    Math.max(parseInt(opt.jpegQuality || "85", 10), 1),
    100
  );

  const metas = await Promise.all(
    jpgPaths.map(async (p) => {
      const img = sharp(p);
      const meta = await img.metadata();
      if (!meta.width || !meta.height) {
        throw new Error(`Invalid image metadata: ${path.basename(p)}`);
      }
      return { path: p, width: meta.width, height: meta.height };
    })
  );

  const maxW = Math.max(...metas.map((m) => m.width));
  const totalH = metas.reduce((acc, m) => acc + m.height, 0);

  let y = 0;
  const composites = [];

  for (const m of metas) {
    let img = sharp(m.path);

    if (m.width < maxW) {
      img = img.extend({
        top: 0,
        bottom: 0,
        left: 0,
        right: maxW - m.width,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      });
    }

    const buf = await img.toBuffer();
    composites.push({ input: buf, top: y, left: 0 });
    y += m.height;
  }

  return sharp({
    create: {
      width: maxW,
      height: totalH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: jpegQuality })
    .toBuffer();
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
    `PDF→IMAGE API\n\n` +
      `POST /v1/convert/pdf-to-image\n` +
      `Content-Type: multipart/form-data\n` +
      `Field: file (PDF)\n\n` +
      `Optional fields (body/form-data):\n` +
      `- output: "zip" | "1image"   (default: auto)\n` +
      `- dpi (72..600)\n` +
      `- quality (1..100)           // kualitas JPG per halaman dari Ghostscript\n` +
      `- jpegQuality (1..100)       // kualitas JPG output gabungan (untuk 1image)\n` +
      `- firstPage (>=1)\n` +
      `- lastPage (>=firstPage)\n` +
      `- memoryMB (64..2048)\n\n` +
      `Atau via query:\n` +
      `- /v1/convert/pdf-to-image?output=zip\n` +
      `- /v1/convert/pdf-to-image?output=1image\n\n` +
      `Default (auto):\n` +
      `- jika PDF > 1 halaman => ZIP\n` +
      `- jika PDF 1 halaman   => JPG\n`
  );
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/v1/convert/pdf-to-image", upload.single("file"), async (req, res) => {
  const pdfTempPath = req.file?.path;
  if (!pdfTempPath) {
    return res.status(400).json({ error: "file is required (multipart field name: file)" });
  }

  // Validasi magic bytes PDF
  if (!isLikelyPdf(pdfTempPath)) {
    safeUnlink(pdfTempPath);
    return res.status(400).json({ error: "Invalid PDF content (file does not start with %PDF)" });
  }

  const outputMode = pickOutputMode(req); // auto | zip | 1image

  // Params with sane bounds
  const dpi = Math.min(Math.max(parseInt(req.body.dpi || "150", 10), 72), 600);
  const quality = Math.min(Math.max(parseInt(req.body.quality || "85", 10), 1), 100);
  const jpegQuality = Math.min(Math.max(parseInt(req.body.jpegQuality || "85", 10), 1), 100);
  const firstPage = Math.max(parseInt(req.body.firstPage || "1", 10), 1);
  const lastPage = Math.max(parseInt(req.body.lastPage || "9999", 10), firstPage);
  const memoryMB = Math.min(Math.max(parseInt(req.body.memoryMB || "300", 10), 64), 2048);

  // Work dirs
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf2img_work_"));
  const outputDir = path.join(workDir, "out");
  fs.mkdirSync(outputDir, { recursive: true });

  const safeBase = sanitizeBaseName(req.file.originalname);

  try {
    // 1) Convert PDF => JPG pages
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

    // 2) Decide output
    const resolvedMode =
      outputMode === "auto" ? (jpgs.length > 1 ? "zip" : "single") : outputMode;

    // 2a) FORCE ZIP (atau auto & multi-page)
    if (resolvedMode === "zip") {
      const zipName = `${safeBase}.zip`;
      await streamZip(res, jpgs, { zipName });
      return;
    }

    // 2b) SINGLE OUTPUT (auto & 1 page): return that one JPG
    if (resolvedMode === "single") {
      const one = jpgs[0];
      const outName = `${safeBase}.jpg`;

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
      res.setHeader("Cache-Control", "no-store");

      // stream file
      fs.createReadStream(one)
        .on("error", (e) => {
          if (!res.headersSent) res.status(500).json({ error: e?.message || "read failed" });
          else res.destroy();
        })
        .pipe(res);

      return;
    }

    // 2c) FORCE 1IMAGE (merge vertikal)
    if (resolvedMode === "1image") {
      const merged = jpgs.length === 1 ? fs.readFileSync(jpgs[0]) : await mergeJpgVertical(jpgs, { jpegQuality });
      const outName = `${safeBase}-LONG.jpg`;

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(merged);
    }

    // fallback (harusnya tidak kejadian)
    return res.status(500).json({ error: "Invalid output mode resolution" });
  } catch (e) {
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
  console.log(`PDF→IMAGE API running: http://localhost:${PORT}`);
  console.log(`POST /v1/convert/pdf-to-image`);
  console.log(`Default: auto (multi-page => zip, single-page => jpg)`);
  console.log(`Platform: ${os.platform()}`);
  console.log(`MAX_UPLOAD_MB: ${MAX_MB}`);
  console.log(`GS_BIN (override): ${process.env.GS_BIN || "(not set)"}`);
  console.log(`GS_BIN_DIR (windows portable): ${BIN_DIR}`);
});
