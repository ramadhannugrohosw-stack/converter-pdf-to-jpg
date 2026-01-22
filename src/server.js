const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { runGhostscript, listJpgFiles } = require("./ghostscript");
const { streamZip } = require("./zip");

const app = express();

const PORT = parseInt(process.env.PORT || "3000", 10);
const BIN_DIR = process.env.GS_BIN_DIR || path.join(__dirname, "..", "bin");
const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB || "50", 10);

const upload = multer({
  dest: path.join(os.tmpdir(), "pdf2jpg_uploads"),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (!ok) return cb(new Error("Only PDF allowed (field name must be 'file')"));
    cb(null, true);
  },
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/v1/convert/pdf-to-jpg", upload.single("file"), async (req, res) => {
  const pdfTempPath = req.file?.path;
  if (!pdfTempPath) return res.status(400).json({ error: "file is required (multipart field name: file)" });

  // Params with sane bounds
  const dpi = Math.min(Math.max(parseInt(req.body.dpi || "150", 10), 72), 600);
  const quality = Math.min(Math.max(parseInt(req.body.quality || "85", 10), 1), 100);
  const firstPage = Math.max(parseInt(req.body.firstPage || "1", 10), 1);
  const lastPage = Math.max(parseInt(req.body.lastPage || "9999", 10), firstPage);
  const memoryMB = Math.min(Math.max(parseInt(req.body.memoryMB || "300", 10), 64), 2048);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf2jpg_work_"));
  const outputDir = path.join(workDir, "out");
  fs.mkdirSync(outputDir, { recursive: true });

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
    if (jpgs.length === 0) return res.status(422).json({ error: "No JPG generated. Invalid PDF?" });

    await streamZip(res, jpgs, { zipName: "hasil-konversi.zip" });
  } catch (e) {
    res.status(500).json({ error: e.message || "convert failed" });
  } finally {
    try { fs.unlinkSync(pdfTempPath); } catch {}
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`PDF→JPG API running: http://localhost:${PORT}`);
  console.log(`Using GS bin dir: ${BIN_DIR}`);
});
