@echo off
chcp 65001 >nul
title calculBA - partage
cd /d "%~dp0"

if not exist ".venv\installe.ok" (
  echo [ERREUR] Lancez d'abord Lancer_calculBA.bat une fois : il installe ce qu'il faut.
  pause & exit /b 1
)

echo.
echo Comment voulez-vous partager calculBA ?
echo.
echo   1 = Wi-Fi local : les PC et telephones connectes au meme Wi-Fi que cet ordinateur
echo   2 = Internet    : un lien https temporaire, accessible de partout (gratuit)
echo.
choice /c 12 /n /m "Votre choix (1 ou 2) : "
if errorlevel 2 goto internet

rem =====================================================================
rem  Mode 1 : Wi-Fi local (aucune donnee Internet consommee)
rem =====================================================================
:wifi
set CALCULBA_SECURE_COOKIES=0
echo.
echo Adresse(s) de cet ordinateur sur le reseau (prenez celle qui commence par 192.168 ou 10.) :
ipconfig | findstr /i /c:"IPv4"
echo.
echo Les autres personnes ouvrent dans leur navigateur :  http://ADRESSE:8000
echo   (remplacez ADRESSE par celle ci-dessus, par exemple http://192.168.1.15:8000)
echo.
echo - Si Windows demande d'autoriser l'acces reseau : cochez "Reseaux prives", puis Autoriser.
echo - Ce mode n'est PAS chiffre : evitez un Wi-Fi public et ne reutilisez pas un mot de passe important.
echo - Laissez cette fenetre ouverte. Fermez-la pour arreter le partage.
echo.
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
echo.
echo Le partage s'est arrete. Si un message d'erreur apparait ci-dessus, le port 8000 est peut-etre deja utilise.
pause
exit /b 0

rem =====================================================================
rem  Mode 2 : lien Internet temporaire (tunnel Cloudflare, sans compte)
rem =====================================================================
:internet
set "CF=cloudflared"
where cloudflared >nul 2>nul && goto cf_ok
set "CF=%~dp0outils\cloudflared.exe"
if exist "%CF%" goto cf_ok
echo.
echo L'outil gratuit "cloudflared" n'est pas installe : telechargement depuis GitHub (une seule fois,
echo quelques dizaines de Mo de donnees Internet)...
if not exist "outils" mkdir "outils"
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'outils\cloudflared.tmp'"
if exist "outils\cloudflared.tmp" move /y "outils\cloudflared.tmp" "outils\cloudflared.exe" >nul
if not exist "%CF%" (
  echo.
  echo [ERREUR] Telechargement impossible. Verifiez votre connexion Internet, ou installez l'outil avec :
  echo     winget install --id Cloudflare.cloudflared
  echo Puis relancez ce fichier.
  pause & exit /b 1
)
:cf_ok

set CALCULBA_SECURE_COOKIES=1
echo.
echo Demarrage de calculBA...
rem Serveur dans CETTE fenetre (/b) : Ctrl+C ou la fermeture de la fenetre arretent
rem a la fois le tunnel et calculBA (avant, le serveur restait actif en arriere-plan).
start "" /b .venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
timeout /t 4 /nobreak >nul

echo.
echo ======================================================================
echo  Cherchez ci-dessous une adresse du type  https://xxxx-xxxx.trycloudflare.com
echo  C'est le lien a envoyer. Utilisez AUSSI ce lien pour vous connecter vous-meme.
echo.
echo  - Le lien change a chaque lancement et disparait quand vous arretez.
echo  - Toute personne qui a le lien peut creer un compte : ne le publiez pas.
echo  - Arret : fermez cette fenetre ^(ou Ctrl+C^). calculBA s'arrete en meme temps.
echo ======================================================================
echo.
"%CF%" tunnel --url http://127.0.0.1:8000

rem Filet de securite : arrete le serveur s'il tourne encore sur le port 8000.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":8000 .*LISTENING"') do taskkill /pid %%p /f >nul 2>nul
echo.
echo Partage arrete.
pause
exit /b 0
