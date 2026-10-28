@echo off
chcp 65001 >nul
title calculBA - administration de la base en ligne
cd /d "%~dp0"

if not exist ".venv\installe.ok" (
  echo [ERREUR] Lancez d'abord Lancer_calculBA.bat une fois : il installe ce qu'il faut.
  pause & exit /b 1
)

rem Pilote PostgreSQL (une seule fois) : necessaire pour parler a la base Neon.
if not exist ".venv\postgres.ok" (
  echo Installation du pilote PostgreSQL ^(une seule fois^)...
  ".venv\Scripts\python.exe" -m pip install -r requirements-server.txt || (
    echo [ERREUR] Installation impossible. Verifiez votre connexion Internet.
    pause & exit /b 1
  )
  echo ok> ".venv\postgres.ok"
)

echo.
echo Collez l'adresse de connexion de votre base Neon (clic droit pour coller), puis Entree.
echo Elle commence par postgresql://  -  Elle n'est enregistree nulle part.
set "DATABASE_URL="
set /p "DATABASE_URL=Adresse : "
if not defined DATABASE_URL (
  echo Aucune adresse saisie.
  pause & exit /b 1
)

:menu
echo.
echo   1 = Transferer les donnees de ce PC (calculba.db) vers la base en ligne
echo       ^(seulement si la base en ligne est encore vide^)
echo   2 = Sauvegarder la base en ligne dans le dossier "sauvegardes" ^(fichier JSON^)
echo   3 = Donner un mot de passe temporaire a un utilisateur qui a oublie le sien
echo   4 = Lister les comptes
echo   5 = Quitter
echo.
choice /c 12345 /n /m "Votre choix : "
if errorlevel 5 exit /b 0
if errorlevel 4 goto users
if errorlevel 3 goto reset
if errorlevel 2 goto export

:transfer
if not exist "calculba.db" (
  echo Aucun fichier calculba.db dans ce dossier.
  goto menu
)
".venv\Scripts\python.exe" -m backend.manage import-sqlite calculba.db
goto menu

:export
".venv\Scripts\python.exe" -m backend.manage export-json
goto menu

:reset
set "EMAIL="
set /p "EMAIL=Adresse e-mail du compte : "
if defined EMAIL ".venv\Scripts\python.exe" -m backend.manage reset-password "%EMAIL%"
goto menu

:users
".venv\Scripts\python.exe" -m backend.manage users
goto menu
