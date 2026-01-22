# PDF to JPG API (Ghostscript)

---

## Manual Usage (Windows – Drag & Drop)

Besides using the API, this project also supports **manual PDF to JPG conversion**
using a **drag & drop method** on Windows.

### How it works
This repository provides batch files that allow you to:
- Drag a PDF file
- Drop it onto a `.bat` file
- Automatically convert all pages to JPG

### Steps

1. Make sure Ghostscript binaries exist in the `bin/` folder  
   (already included in this repository)

2. Locate one of the following files:
   - `pdf-to-jpg.bat` (auto-detect)
   - `pdf-to-jpg-64.bat` (64-bit Windows)
   - `pdf-to-jpg-32.bat` (32-bit Windows)

3. Drag your **PDF file** and drop it onto the `.bat` file

4. Output:
   - JPG images will be generated in the same folder as the PDF
   - Each page becomes one JPG file

### Notes
- This method is **Windows only**
- No Node.js or API server is required
- Useful for quick local conversion or offline usage
- Drag & drop (.bat) only works on Windows
- Linux / Ubuntu users must use the API or CLI

---

Simple REST API to convert uploaded **PDF files into JPG images (per page)**  
and return the result as a **ZIP file**.

This API is **cross-platform** and works on:
- ✅ Windows (using portable Ghostscript in `bin/`)
- ✅ Linux / Ubuntu (using system Ghostscript `gs`)

---

## Features

- Upload PDF via HTTP API
- Convert each page to JPG
- Return result as ZIP
- Supports PDF with spaces in filename
- Safe for concurrent requests (no overwrite)
- Cross-platform (Windows & Ubuntu)
- Ready to be used by **curl, Postman, n8n, or backend services**

---

## Requirements

### Common
- Node.js **v18+**
- npm

### Windows
- No additional install required  
- Uses Ghostscript portable binaries in `bin/`

### Linux / Ubuntu
Install Ghostscript:
```bash
sudo apt update
sudo apt install -y ghostscript



