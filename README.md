# calculBA — collecte et analyse de données de génie civil

Application web locale pour saisir des mesures de laboratoire et de chantier, importer des tableurs CSV ou Excel et obtenir des statistiques et graphiques fiables. Chaque compte ne voit que ses propres jeux de données.

Version 5 : onglet Probabilités, base PostgreSQL pour la mise en ligne, sécurité renforcée. **Pour obtenir un lien d'utilisation permanent et gratuit, suivez [DEPLOIEMENT.md](DEPLOIEMENT.md).** Le détail des corrections est dans [AUDIT.md](AUDIT.md).

## Démarrage rapide sous Windows

1. Installez Python (3.12, 3.13 ou 3.14 conseillé) depuis https://www.python.org/downloads/ en cochant **« Add python.exe to PATH »**.
   Si vous avez le **gestionnaire d'installation Python** (la commande `py help` affiche « Python installation manager »), tapez `py list` dans une invite de commandes : si aucune version n'apparaît, installez-en une avec `py install 3.14` et acceptez l'ajout au PATH.
2. Décompressez le zip, puis double-cliquez sur **`Lancer_calculBA.bat`** dans le dossier `calculba`.
3. La première fois, l'installation prend quelques minutes. Le navigateur s'ouvre ensuite sur http://127.0.0.1:8000.
4. Laissez la fenêtre noire ouverte pendant l'utilisation ; fermez-la pour arrêter calculBA.

**Important :** n'ouvrez pas `frontend/index.html` par double-clic. Cette page ne fonctionne qu'à travers le serveur, à l'adresse http://127.0.0.1:8000.

## Installation manuelle (PowerShell)

Ouvrez PowerShell **dans le dossier `calculba`** (celui qui contient `backend` et `frontend`) :

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Ouvrez ensuite http://127.0.0.1:8000.

- Si `py` n'existe pas, essayez `python -m venv .venv` (Python 3.10 minimum ; testé de 3.12 à 3.15).
- Si PowerShell refuse d'activer l'environnement : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, puis recommencez.
- Pendant le développement, ajoutez `--reload` pour relancer le serveur à chaque modification.
- `--host 127.0.0.1` limite l'accès à votre ordinateur. N'utilisez `0.0.0.0` (accès depuis le réseau) que sur un réseau de confiance.

Sous macOS / Linux : `python3 -m venv .venv && source .venv/bin/activate`, puis les mêmes commandes.

### Mise à jour depuis la version 3

Copiez votre ancien `calculba.db` à la racine du projet avant de lancer le serveur. La base est migrée automatiquement au démarrage : comptes, jeux et observations sont conservés, les anciens mots de passe restent valables (ils sont renforcés à la prochaine connexion). Les sessions ouvertes avec la v3 sont fermées : il faut se reconnecter une fois.

Des jeux créés avant l'apparition des comptes peuvent n'appartenir à personne. Pour les rattacher à un compte :

```powershell
python -m backend.manage orphans
python -m backend.manage assign-orphans votre@adresse.fr
```

## Utilisation

1. **Nouveau jeu** : définissez vos colonnes (des modèles existent pour chaque domaine) ou importez un fichier. Indiquez l'unité dans le nom de colonne : `Resistance_MPa`, `Profondeur_m`.
2. **Données** : ajoutez, modifiez ou supprimez des observations. Laissez vide une mesure inconnue : elle sera exclue des calculs, jamais comptée comme 0.
3. **Statistiques** : effectif, valeurs manquantes, moyenne, écart-type (n − 1), coefficient de variation, minimum, quartiles, médiane, maximum. Les valeurs non numériques dans une colonne numérique sont signalées.
4. **Graphiques** : répartition (histogramme), moyenne par groupe (par lot, par site…), relation entre deux variables avec droite des moindres carrés et R², valeurs dans l'ordre de saisie.
5. **Probabilités** : ajuste une loi (normale, lognormale, Weibull, Gumbel, exponentielle, uniforme) à une variable, affiche paramètres, fractiles 5/50/95 % et courbe sur l'histogramme, et **classe les lois** de la mieux à la moins adaptée (critère AIC).
6. **Exporter** : Excel `.xlsx` (recommandé), CSV pour Excel français ou allemand (`;` et virgule décimale), ou CSV standard.

Un fichier d'essai est fourni : `exemples/essais_beton.csv` (54 éprouvettes, 3 lots, 7/14/28 jours, avec deux mesures manquantes et une saisie non numérique pour voir comment elles sont traitées).

### Fichiers acceptés à l'import

- CSV (séparateur virgule, point-virgule ou tabulation détecté automatiquement ; UTF-8 ou encodage Windows) et Excel `.xlsx`.
- Première ligne = noms de colonnes, tous différents.
- Limites : 50 000 lignes, 60 colonnes, 15 Mo.
- Une colonne de codes à largeur fixe avec zéros de tête (`001`, `002`…) est lue comme du texte (identifiants), pas comme des nombres.
- L'ancien format `.xls` doit d'abord être enregistré en `.xlsx`.

## Comptes et sécurité

- Mots de passe : 10 caractères minimum, stockés avec PBKDF2-HMAC-SHA256 (600 000 itérations, sel unique).
- Session dans un cookie HttpOnly, valable 30 jours au plus et vérifiée côté serveur.
- Blocage temporaire après 8 tentatives de connexion échouées en 15 minutes.
- Protection CSRF par en-tête obligatoire, en-têtes de sécurité (CSP, anti-iframe).
- Limite de 5 créations de compte par heure et par adresse IP ; code d'invitation facultatif (`CALCULBA_INVITE_CODE`).
- Quotas par compte (100 jeux, 200 000 observations) ; en-tête HTTPS strict (HSTS) en ligne.
- La date de naissance est facultative et n'est jamais renvoyée au navigateur.
- « Mon compte » permet de supprimer définitivement le compte et ses données.

### Partager calculBA gratuitement (sans hébergeur payant)

Double-cliquez sur `Partager_calculBA.bat` (après avoir lancé `Lancer_calculBA.bat` une première fois) et choisissez :

- **1 · Wi-Fi local** : les autres appareils du même Wi-Fi ouvrent `http://ADRESSE:8000` (l'adresse est affichée). Aucune donnée Internet consommée, mais la connexion n'est pas chiffrée : pas de Wi-Fi public, pas de mot de passe réutilisé.
- **2 · Internet** : un lien `https://….trycloudflare.com` temporaire (tunnel Cloudflare sans compte, téléchargé une fois dans `outils/`). Le lien change à chaque lancement ; l'ordinateur doit rester allumé et connecté. Ne publiez pas le lien : toute personne qui l'a peut créer un compte. Ce mode est prévu pour des démonstrations, sans garantie de disponibilité.

Les données restent dans `calculba.db` sur votre ordinateur. `Sauvegarder_calculBA.bat` en fait une copie datée dans `sauvegardes/` (14 conservées) ; copiez-les aussi sur une clé USB ou un cloud. Pour restaurer : fermez calculBA et remplacez `calculba.db` par une copie renommée.

### Lien permanent (gratuit, sans carte bancaire)

Render (l'application) + Neon (la base PostgreSQL) : voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)**. Les fichiers `render.yaml`, `requirements-server.txt` et `.python-version` sont prêts ; `Administrer_en_ligne.bat` transfère vos données vers la base en ligne, la sauvegarde et dépanne les mots de passe oubliés.

### Limites d'une mise en ligne publique

Pas de vérification des adresses e-mail ni d'envoi de mot de passe oublié (dépannage par l'administrateur) ; les limiteurs de tentatives sont en mémoire, donc prévus pour un seul serveur (le cas de l'offre gratuite). Ajoutez une politique de confidentialité si des personnes extérieures s'inscrivent.

## Réglages

| Variable d'environnement | Rôle | Par défaut |
|---|---|---|
| `CALCULBA_DB` | chemin de la base SQLite | `calculba.db` à la racine |
| `CALCULBA_SESSION_DAYS` | durée des sessions | `30` |
| `CALCULBA_SECURE_COOKIES` | `1` pour n'envoyer le cookie qu'en HTTPS | `0` |
| `DATABASE_URL` | base PostgreSQL (en ligne) ; vide = SQLite | vide |
| `CALCULBA_INVITE_CODE` | code exigé à l'inscription | vide |
| `CALCULBA_MAX_DATASETS` / `CALCULBA_MAX_RECORDS` | quotas par compte | `100` / `200000` |

Les autres limites (lignes, colonnes, taille de fichier, seuil de détection numérique) sont dans `backend/settings.py`.

## Explorer l'API

Pendant que calculBA tourne, ouvrez http://127.0.0.1:8000/docs : toutes les routes de l'API y sont listées par thème, avec leurs paramètres et leurs réponses. Connectez-vous d'abord dans un autre onglet sur http://127.0.0.1:8000, puis utilisez « Try it out » pour envoyer une requête réelle. La description brute (format OpenAPI) est sur http://127.0.0.1:8000/openapi.json.

## Tests

```powershell
pip install -r requirements-dev.txt
python -m pytest -q
```

53 tests couvrent la lecture des nombres, les comptes et sessions, l'isolation entre utilisateurs, l'import CSV/Excel, les statistiques, les lois de probabilité, les quotas, l'invitation, les exports, l'administration et la migration depuis la v3. Pour les lancer sur PostgreSQL : définissez `DATABASE_URL` vers une base **de test** (elle est vidée).

## Organisation du code

```
backend/main.py       routes de l'API et service de l'interface
backend/analysis.py   lecture des nombres et des fichiers, statistiques, graphiques, exports
backend/security.py   mots de passe, sessions, limitation des tentatives
backend/db.py         base SQLite (PC) ou PostgreSQL (en ligne), schémas, migration
backend/settings.py   réglages et limites
backend/manage.py     administration : comptes, mots de passe, sauvegardes, transfert vers la base en ligne
render.yaml           configuration de l'hébergement Render
frontend/index.html   structure de la page
frontend/api-docs.html  page /docs (documentation interactive de l'API)
frontend/static/      styles, scripts, Chart.js et polices Barlow (fournis localement : fonctionne hors ligne)
```

Bibliothèques tierces incluses : Chart.js 4.5 (licence MIT, `frontend/static/vendor`), Swagger UI 5.34 (licence Apache 2.0, `frontend/static/vendor/swagger`) et la police Barlow (SIL Open Font License, `frontend/static/fonts`).

## Limites connues

Pas de prédiction automatique ni d'application Android native. Les statistiques sont descriptives : vérifiez toujours les unités, la qualité des mesures et les normes d'essai applicables avant toute interprétation technique.

## Lois de probabilité : à savoir

- Ajustement par maximum de vraisemblance ; lognormale, Weibull et exponentielle à seuil nul (usage en génie civil), réservées aux valeurs strictement positives.
- Au moins 5 valeurs différentes sont nécessaires ; en dessous de 30, les fractiles extrêmes sont incertains (l'onglet le signale).
- Le fractile 5 % de la loi ajustée n'est pas directement une valeur caractéristique réglementaire : les normes (EN 1990 annexe D, EN 206…) ajoutent un facteur lié à la taille de l'échantillon.
- Le test de Kolmogorov-Smirnov est indicatif, car les paramètres sont estimés sur les mêmes données. L'ancienne adresse `/probabilites` redirige vers l'application.
