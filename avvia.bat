@echo off
REM ============================================================
REM  Imperium Galactica - avvio del gioco in locale
REM  Doppio clic su questo file per giocare.
REM ============================================================
cd /d "%~dp0"
set PORT=8123

echo Avvio del server locale sulla porta %PORT% ...
echo Apro il browser su http://localhost:%PORT%
echo (Lascia aperta questa finestra mentre giochi. Chiudila per terminare.)
echo.

REM Apre il browser dopo un breve istante
start "" http://localhost:%PORT%

REM Avvia il server (prova "python", poi "py")
python -m http.server %PORT% 2>nul || py -m http.server %PORT%
