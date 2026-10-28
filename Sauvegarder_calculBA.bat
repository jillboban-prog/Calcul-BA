@echo off
chcp 65001 >nul
title calculBA - sauvegarde
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERREUR] Lancez d'abord Lancer_calculBA.bat une fois : il installe ce qu'il faut.
  pause & exit /b 1
)

".venv\Scripts\python.exe" -m backend.manage backup
echo.
echo Les copies sont dans le dossier "sauvegardes" (les 14 plus recentes sont gardees).
echo Pour etre a l'abri d'une panne du PC, copiez ce dossier sur une cle USB ou dans un cloud.
echo Pour restaurer : fermez calculBA, puis remplacez calculba.db par une copie (renommee calculba.db).
echo.
pause
