const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function pickGhostscriptExe(binDir) {
  const gs64 = path.join(binDir, "gswin64c.exe");
  const gs32 = path.join(binDir, "gswin32c.exe");

  if (fs.existsSync(gs64)) return gs64;
  if (fs.existsSync(gs32)) return gs32;

  throw new Error(`Ghostscript not found. Expected gswin64c.exe or gswin32c.exe in: ${binDir}`);
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
    const gsExe = pickGhostscriptExe(binDir);
    const outPattern = path.join(outputDir, "page-%03d.jpg");

    // Use args array => safe for spaces in paths
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

    // Important on Windows: set cwd to binDir so gsdll*.dll is found
    const p = spawn(gsExe, args, { cwd: binDir });

    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", (err) => reject(err));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Ghostscript failed (code ${code}): ${stderr}`));
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
