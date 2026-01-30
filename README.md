# PDF to Image API (ZIP / 1Image Mode)

API Node.js untuk mengubah file **PDF menjadi gambar (JPG)** menggunakan **Ghostscript**, dengan 3 mode output:

- **auto (default)**  
  - PDF 1 halaman → **1 file JPG**
  - PDF > 1 halaman → **ZIP berisi JPG per halaman**
- **zip**  
  - Selalu output **ZIP**
- **1image**  
  - Semua halaman PDF digabung **vertikal ke bawah** → **1 file JPG panjang**

---

## 🚀 Fitur
- Konversi PDF ke JPG per halaman
- Gabung multi-page PDF jadi **1 gambar panjang**
- Output ZIP otomatis
- Support Windows & Ubuntu
- Support parameter DPI, quality, page range
- Aman untuk file path dengan spasi

---

```bash
npm install
npm install sharp
```

khusus UBUNTU/LINUX
```bash
sudo apt update
sudo apt install ghostscript -y
```

```bash
npm start
```

khusus lebih dari 1 halaman:
jika ditambahkan -F "output=1image" maka akan jadi 1 file gambar gabungan secara vertikal. jika tidak maka akan dibautkan zip.
jika hanya 1 halaman dalam pdf makan akan otomatis jadi 1 file gambar
```bash
curl.exe -X POST "http://localhost:3000/v1/convert/pdf-to-image" ^
  -F "output=1image" ^
  -F "file=@D:\Documents\contoh pdf\rekening.pdf;type=application/pdf" ^
  -o "D:\Documents\contoh pdf\rekening-LONG.jpg
```

```bash
curl -X POST "http://localhost:3000/v1/convert/pdf-to-image" \
  -F "output=1image" \
  -F "file=@\"/home/USER/Documents/contoh pdf/rekening.pdf\";type=application/pdf" \
  -o "/home/USER/Documents/contoh pdf/rekening-LONG.jpg"
```


# PDF to JPG API (Ghostscript)

---

## Manual Usage (Windows – Drag & Drop)


https://github.com/user-attachments/assets/72a80fe5-a9be-4ab6-a6ad-05679e60f429


Besides using the API, this project also supports **manual PDF to JPG conversion**
using a **drag & drop method** on Windows.

### How it works
This repository provides batch files that allow you to:
- Drag a PDF file
- Drop it into a `.bat` file
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
