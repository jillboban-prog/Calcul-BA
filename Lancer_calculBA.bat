@echo off
chcp 65001 >nul
title calculBA - serveur
cd /d "%~dp0"

if not exist "backend\main.py" (
  echo [ERREUR] Ce fichier doit rester dans le dossier calculba, a cote de "backend" et "frontend".
  pause & exit /b 1
)

rem ---- Premiere utilisation : environnement Python + paquets --------------
if not exist ".venv\installe.ok" (
  echo Premiere installation de calculBA, patientez quelques minutes...
  rem Les messages de "py" restent visibles : le gestionnaire d'installation
  rem Python peut poser une question (repondre dans cette fenetre).
  if not exist ".venv\Scripts\python.exe" (
    where py >nul 2>nul && py -3 -m venv .venv
  )
  if not exist ".venv\Scripts\python.exe" (
    where python >nul 2>nul && python -m venv .venv
  )
  if not exist ".venv\Scripts\python.exe" (
    echo.
    echo [ERREUR] Aucune version de Python utilisable n'a ete trouvee.
    echo   - Avec le gestionnaire d'installation Python, tapez dans une invite de commandes :
    echo         py install 3.14
    echo   - Sinon, installez Python depuis https://www.python.org/downloads/
    echo     en cochant "Add python.exe to PATH".
    echo   Puis relancez ce fichier.
    pause & exit /b 1
  )
  ".venv\Scripts\python.exe" --version
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt || (
    echo.
    echo [ERREUR] L'installation des paquets a echoue. Verifiez votre connexion Internet et relancez.
    echo          L'installation reprendra depuis le debut au prochain lancement.
    rmdir /s /q .venv 2>nul
    pause & exit /b 1
  )
  echo ok> ".venv\installe.ok"
)

rem ---- Demarrage : le navigateur s'ouvre quand le serveur est pret ---------
echo.
echo calculBA demarre sur http://127.0.0.1:8000
echo Laissez cette fenetre ouverte pendant l'utilisation. Fermez-la pour arreter calculBA.
echo.
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start "" http://127.0.0.1:8000"
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
echo.
echo calculBA s'est arrete. Si un message d'erreur apparait ci-dessus, le port 8000 est peut-etre deja utilise.
pause
