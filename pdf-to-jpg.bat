@echo off
echo.
echo.

setlocal EnableExtensions

set "DPI=300"
set "ALPHABITS=2"
set "QUALITY=80"
set "FIRSTPAGE=1"
set "LASTPAGE=9999"
REM MEMORY in MB
set "MEMORY=300"

REM Pindah ke folder PDF (aman meskipun ada spasi)
cd /D "%~dp1"

REM Gunakan nama file PDF (dengan extension) dan full path (untuk eksekusi GS)
set "PDFFILE=%~nx1"
set "PDFPATH=%~f1"

REM Output: namaPDF-page-001.jpg, dst (lebih rapi & aman)
set "BASENAME=%~n1"
set "JPGFILE=%BASENAME%-page-%%03d.jpg"

REM Ghostscript path (argumen ke-2 opsional)
set "GS=%~2"
if "%GS%"=="" (
  set "GS=bin\gswin32c.exe"
)

echo Loading %GS%...
echo.

REM Jalankan Ghostscript - PENTING: quote output & input
"%~dp0%GS%" ^
  -sDEVICE=jpeg ^
  -sOutputFile="%JPGFILE%" ^
  -r%DPI% ^
  -dNOPAUSE ^
  -dBATCH ^
  -dFirstPage=%FIRSTPAGE% ^
  -dLastPage=%LASTPAGE% ^
  -dJPEGQ=%QUALITY% ^
  -dGraphicsAlphaBits=%ALPHABITS% ^
  -dTextAlphaBits=%ALPHABITS% ^
  -dNumRenderingThreads=4 ^
  -dBufferSpace=%MEMORY%000000 ^
  -dBandBufferSpace=%MEMORY%000000 ^
  -c %MEMORY%000000 setvmthreshold ^
  -f "%PDFFILE%" ^
  -c quit

echo Finished.
pause
