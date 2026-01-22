# PDF to JPG API (Ghostscript)

Simple REST API to convert uploaded PDF into JPG images (per page) and return a ZIP.

## Requirements
- Node.js 18+
- Ghostscript console binaries:
  - `gswin64c.exe` (preferred) or `gswin32c.exe`
  - corresponding `gsdll*.dll`
Place them under `./bin` or set `GS_BIN_DIR`.

## Install
```bash
npm install
