const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

function resolveGhostscriptBin(binDir) {
  // Override manual jika user set
  // Contoh Ubuntu: GS_BIN=gs
  // Contoh Windows: GS_BIN=C:\...\bin\gswin64c.exe
  if (process.env.GS_BIN && process.env.GS_BIN.trim()) {
    return process.env.GS_BIN.trim();
  }

  const platform = os.platform();

  // Windows => cari exe lokal (punya kamu)
  if (platform === "win32") {
    const gs64 = path.join(binDir, "gswin64c.exe");
    const gs32 = path.join(binDir, "gswin32c.exe");

    if (fs.existsSync(gs64)) return gs64;
    if (fs.existsSync(gs32)) return gs32;

    throw new Error(
      `Ghostscript not found. Expected gswin64c.exe or gswin32c.exe in: ${binDir}`
    );
  }

  // Linux/macOS => pakai "gs" dari PATH
  return "gs";
}

function runGhostscript({
  binDir,
  inputPdfPath,
  outputDir,
  dpi,
  quality,
  firstPage,
  lastPage,
  memoryMB,
}) {
  return new Promise((resolve, reject) => {
    const gsBin = resolveGhostscriptBin(binDir);
    const outPattern = path.join(outputDir, "page-%03d.jpg");

    // args array => aman untuk path yang ada spasi
    const args = [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=jpeg",
      `-sOutputFile=${outPattern}`,
      `-r${dpi}`,
      `-dFirstPage=${firstPage}`,
      `-dLastPage=${lastPage}`,
      `-dJPEGQ=${quality}`,
      "-dGraphicsAlphaBits=2",
      "-dTextAlphaBits=2",
      "-dNumRenderingThreads=4",
      `-dBufferSpace=${memoryMB}000000`,
      `-dBandBufferSpace=${memoryMB}000000`,
      "-c",
      `${memoryMB}000000`,
      "setvmthreshold",
      "-f",
      inputPdfPath,
      "-c",
      "quit",
    ];

    // Windows butuh cwd=binDir agar dll ketemu.
    // Linux/macOS tidak perlu, malah bisa bikin masalah kalau binDir tidak ada.
    const platform = os.platform();
    const spawnOpts =
      platform === "win32"
        ? { cwd: binDir }
        : {}; // linux/mac => rely on PATH

    const p = spawn(gsBin, args, spawnOpts);

    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", (err) => reject(err));
    p.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Ghostscript failed (code ${code}): ${stderr}`)
        );
      }
      resolve();
    });
  });
}

function listJpgFiles(outputDir) {
  return fs
    .readdirSync(outputDir)
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort()
    .map((f) => path.join(outputDir, f));
}

module.exports = { runGhostscript, listJpgFiles };
