# calculBA — audits

- **Version 5 (octobre 2026)** : audit de la version partagée « calculBA_v4_partage », ci-dessous, en français.
- **Version 4** : audit de la version 3 d'origine, plus bas, en anglais.

---

## Version 5 — audit de la version partagée

Fichiers analysés : tout le dossier `calculBA_v4_partage/calculba`, y compris les nouveautés `frontend/probabilites.html`, la route `/api/datasets/{id}/probability`, `Partager_calculBA.bat`, `Sauvegarder_calculBA.bat`, `tests/test_analysis.py` et la base `calculba.db` livrée dans le zip.

Les points marqués **[reproduit]** ont été constatés en faisant tourner la version reçue (navigateur réel ou appels à l'API).

### 1. Module de probabilités : inutilisable

| # | Problème | Correction |
|---|---|---|
| 1.1 | **La page `/probabilites` ne fait rien** : son script est écrit dans la page, ce que la politique de sécurité (CSP `script-src 'self'`) interdit. Elle reste sur « Chargement… ». **[reproduit]** | Le module devient l'onglet **Probabilités** de chaque jeu, avec le code dans `app.js`. L'ancienne adresse redirige vers l'application. |
| 1.2 | **Lois normale, exponentielle et uniforme : erreur systématique.** `getattr(dist, "shapes", "").split()` plante quand la loi n'a pas de paramètre de forme (`shapes` vaut `None`). La loi normale est celle proposée par défaut. **[reproduit]** | Calcul déplacé dans `analysis.fit_distributions`, testé pour chaque loi. |
| 1.3 | **Lognormale et Weibull ajustées à 3 paramètres** (décalage libre) : sur les résistances du fichier d'exemple, la lognormale renvoie un décalage de **−1 999 MPa**. **[reproduit]** | Seuil fixé à 0 (2 paramètres), l'usage en génie civil. |
| 1.4 | **Loi de Student** ajustée à des mesures : 1,26 milliard de degrés de liberté, sans interprétation physique. **[reproduit]** | Remplacée par **Gumbel** (valeurs extrêmes : crues, vents). |
| 1.5 | Une colonne d'identifiants (`001`, `002`…) est acceptée comme une mesure. **[reproduit]** | Seules les colonnes détectées numériques sont acceptées. |
| 1.6 | Paramètres affichés « param_1, param_2… » sans nom ; histogramme dessiné en points ; aucune aide pour choisir la loi ; « tu » au lieu de « vous » ; pas de mode sombre. | Paramètres nommés (μ, σ, k, λ…), histogramme en barres avec la courbe, **classement automatique des lois par AIC**, fractiles de la loi comparés aux fractiles mesurés, avertissements (petit échantillon, fractile 5 % ≠ valeur caractéristique réglementaire). |

### 2. Mise en ligne : impossible en l'état

| # | Problème | Correction |
|---|---|---|
| 2.1 | **Pas de lien permanent gratuit possible** : la base SQLite est un fichier, et le disque des hébergeurs gratuits (Render) est effacé à chaque redémarrage. | Prise en charge de **PostgreSQL** (Neon, gratuit) via `DATABASE_URL` ; SQLite reste utilisé sur le PC. Les 53 tests passent sur les deux bases. Fichiers `render.yaml`, `requirements-server.txt`, `.python-version` et guide **DEPLOIEMENT.md**. |
| 2.2 | Aucun moyen de reprendre ses données sur la version en ligne. | `manage import-sqlite` (via `Administrer_en_ligne.bat`) : copie testée sur la base livrée (5 comptes, 26 jeux, 46 observations, contenu identique, mots de passe conservés). |
| 2.3 | Un gros import bloquait tout le serveur (traitement lourd dans une fonction `async`) : les autres utilisateurs attendaient. | Lecture et écriture exécutées en arrière-plan. |

### 3. Sécurité pour un usage public

| # | Problème | Correction |
|---|---|---|
| 3.1 | Inscription illimitée : un robot peut créer des milliers de comptes. | 5 créations par heure et par adresse IP **[vérifié : le 6ᵉ compte reçoit 429]** ; **code d'invitation** facultatif (`CALCULBA_INVITE_CODE`). |
| 3.2 | Aucun quota : un seul compte peut remplir la base gratuite (1 Go). | Quotas par compte : 100 jeux, 200 000 observations (réglables). |
| 3.3 | Mot de passe oublié : aucune solution. | `manage reset-password` (mot de passe temporaire, sessions fermées). |
| 3.4 | Pas d'en-tête HSTS en HTTPS. | Ajouté quand `CALCULBA_SECURE_COOKIES=1`. |
| 3.5 | **Le zip de partage contient `calculba.db`** : comptes, empreintes de mots de passe et sessions encore valides. Ici ce sont des comptes de test, mais c'est une fuite si l'on partage ainsi une vraie base. | `.gitignore` exclut tous les `*.db` ; ne jamais joindre la base à un partage. |
| 3.6 | `Partager_calculBA.bat` (mode Internet) : après `Ctrl + C`, répondre « O » laissait le serveur actif dans une fenêtre réduite, encore joignable. | Serveur lancé dans la même fenêtre : tout s'arrête ensemble ; filet de sécurité sur le port 8000. |

### 4. Qualité

| # | Problème | Correction |
|---|---|---|
| 4.1 | **Les tests écrivaient dans le vrai `calculba.db` du projet** : `test_analysis.py` charge les réglages avant que `test_api.py` choisisse une base temporaire. Un second passage échouait (comptes déjà existants). **[reproduit]** | Base temporaire choisie dans `tests/conftest.py`, chargé avant tout test. |
| 4.2 | `scipy` ajouté : vérifié disponible pour Windows de Python 3.12 à 3.15. | — |

Points corrects dans la version reçue, conservés : sauvegarde SQLite cohérente (`backup`), lecture des petites valeurs (perméabilités), codes à zéros de tête lus comme texte, nettoyage des caractères de contrôle, message clair pour les cellules CSV démesurées.

### Vérifications de la version 5

- 53 tests automatiques sur SQLite, 52 sur PostgreSQL 16 (le 53ᵉ, migration d'une base SQLite v3, ne concerne que SQLite).
- 48 vérifications dans un vrai navigateur (Chromium) sur une configuration identique à Render : Python 3.13, PostgreSQL, cookies sécurisés, HSTS, commande de démarrage de `render.yaml`. Clair, sombre, téléphone 390 px.

---

## Version 4 — audit of the original v3 (English)

This report covers the files that were submitted (`README.md`, `requirements.txt`, `.gitignore`, `main.py`, `index.html`, `__init__.py` and the combined `calculBA_code_source_avec_comptes.txt`, which is an exact copy of the other files).

Items marked **[reproduced]** were confirmed by running the original code (API calls and real-browser screenshots). The others were found by reading the code. Each item says how version 4 fixes it.

---

## 1. Problems that stop the app from running

| # | Problem | Fix in v4 |
|---|---|---|
| 1.1 | **The uploaded files are flat, but the code expects `backend/main.py` and `frontend/index.html`.** `main.py` computes `ROOT = parents[1]` and mounts `ROOT/frontend` at import time; with the flat layout the server crashes immediately with `RuntimeError: Directory '…/frontend' does not exist`. **[reproduced]** | The project ships in the correct folder structure, and if the folder is missing the error message now explains what to do. |
| 1.2 | The file picker accepts `.xls`, but reading `.xls` needs the `xlrd` package, which is not in `requirements.txt`. Any `.xls` upload fails with a cryptic pandas message. **[reproduced]** | `.xls` is no longer offered; uploading one returns a clear message explaining how to save it as `.xlsx`. |
| 1.3 | `@app.on_event("startup")` is deprecated in current FastAPI. | Replaced by a `lifespan` handler. |

## 2. Wrong results (statistics and charts)

| # | Problem | Fix in v4 |
|---|---|---|
| 2.1 | **A column becomes "numeric" if a single value parses as a number.** A sample-ID column `B01, B02, 3` is treated as numeric with mean 3, and the real IDs are counted as "missing". **[reproduced]** | A column is numeric only when ≥ 80 % of its filled cells are numbers. Text values in a numeric column are counted separately ("non numérique") and flagged in the stats and data tables. |
| 2.2 | **Missing values are plotted as 0.** The charts use `Number(r[col])`, and `Number(null)` is `0`, so every empty cell adds a fake zero to the histogram and the curve. **[reproduced: a 0–11 MPa bar appears in the strength histogram]** | All numbers are parsed on the server with one function (`to_number`). Missing values are excluded, and the series chart shows a visible gap instead. |
| 2.3 | **Semicolon CSV files (the default Excel export in France and Germany) import as a single column**, e.g. `Site;Profondeur_m;CBR_pct`. Decimal commas in imported files are not understood either. **[reproduced]** | The separator (`;` `,` tab `|`) is detected automatically; decimal commas, thousands spaces (`1 234,5`) and Windows encoding (cp1252) are handled. |
| 2.4 | Duplicate or empty column headers are silently renamed by pandas to `a.1` or `Unnamed: 1`, despite a check meant to reject them (the check runs after pandas has already renamed them). **[reproduced]** | Headers are read and validated by calculBA itself. Duplicates (case-insensitive) and columns that contain data but have no name are rejected with a message; fully empty trailing columns (common in Excel) are dropped. |
| 2.5 | A user column called `id` overwrites the record's internal ID in API responses (`{"id": r["id"], **values}`). **[reproduced]** | Values are nested under `values`, so no column name can collide. |
| 2.6 | Standard deviation is reported as `0` when there is only one value (it is undefined). | Reported as "—". The sample estimator (n − 1) is used and stated in the legend. |
| 2.7 | Stats are computed on all rows but charts only on the first 2,000 rows, so the table and the charts can disagree. | All charts are computed server-side on the full dataset (large series are thinned evenly for drawing, and the caption says so). |
| 2.8 | The "means" bar chart puts variables with different units (days, MPa, mm) on one axis, which is not meaningful. Negative values are drawn as positive bars (`Math.abs`). | Replaced by four meaningful charts: distribution (histogram), mean by group (e.g. strength per batch), X/Y relation with least-squares line and R², and values in entry order with the mean. |
| 2.9 | The line chart has no axis values except min/max, and drops missing observations so later points shift left. | Real axes with ticks and titles; the X axis is the observation number, so positions stay correct. |

## 3. Security and privacy

| # | Problem | Fix in v4 |
|---|---|---|
| 3.1 | **Sessions never expire on the server.** Only the cookie has a 30-day lifetime; a stolen token works forever. **[reproduced with a session dated year 2000]** | Each session has a server-side `expires_at`; expired sessions are rejected and cleaned up. Old v3 sessions are invalidated on upgrade. |
| 3.2 | **Logging out leaves the previous user's data in the page.** The header still shows "Connecté : <name>", the password stays in the login field, and the next person who logs in sees the previous user's analysis tables until they change tab. **[reproduced]** | Logout clears every view, the user block, all form fields and charts. Verified with an automated browser test using two accounts. |
| 3.3 | No limit on login attempts; and unknown e-mails return faster than wrong passwords (no hash is computed), revealing which addresses have accounts. | 8 failed attempts per IP + e-mail in 15 min → temporary block. A dummy hash is checked for unknown addresses so timing is identical. |
| 3.4 | No CSRF protection beyond `SameSite=Lax`; `secure=False` is hard-coded. | Every modifying request must carry an `X-Requested-With: calculBA` header that other sites cannot add. `secure` is controlled by `CALCULBA_SECURE_COOKIES=1`. Security headers (CSP, `nosniff`, frame denial) are added. |
| 3.5 | Date of birth is mandatory, stored, and returned by `/api/auth/me` to the browser, although the README itself says it should only be collected if needed (GDPR data minimisation). **[reproduced]** | Optional, never sent back to the browser. Old databases are migrated (the NOT NULL constraint is removed safely). |
| 3.6 | Passwords have no maximum length; a multi-megabyte password makes PBKDF2 burn CPU. | 10–256 characters. Hash strength raised to 600,000 iterations; old hashes are upgraded automatically at next login. |
| 3.7 | No way for a user to delete their account and data. | "Mon compte" → delete account (password confirmation required). |
| 3.8 | CSV export can be used for formula injection (a cell like `=HYPERLINK(...)` executes in Excel). | Text cells starting with `= + - @` are escaped in exports. |
| 3.9 | Request bodies are untyped `dict`s: sending `{"values": [1]}` crashes the server with a 500. **[reproduced]** | Pydantic models validate every request and return a readable French message. |

## 4. Robustness and performance

| # | Problem | Fix in v4 |
|---|---|---|
| 4.1 | `connect()` runs all `CREATE TABLE` statements and a migration check on **every request**, and connections are not closed when an error is raised (`get_ds` raises before `c.close()`). | Schema and migrations run once at startup; one connection per request through a FastAPI dependency that always closes it. WAL mode, foreign keys and indexes enabled. |
| 4.2 | `GET /records?limit=1` (used just to count rows) loads and decodes the whole dataset. | `COUNT(*)` and `LIMIT/OFFSET` pagination in SQL. |
| 4.3 | Export writes `export_calculba_<id>.csv` into the project folder and never deletes it. | Exports are generated in memory and streamed. |
| 4.4 | Import inserts rows one by one and has no file-size limit. | `executemany` and a 15 MB limit checked while reading. |
| 4.5 | Datasets created before accounts existed (`user_id` NULL) become invisible to everyone. | `python -m backend.manage assign-orphans <email>` attaches them to an account. |
| 4.6 | Any non-JSON server error breaks the frontend: `api()` calls `r.json()` then `r.text()` on the same response, which throws "body already used". | The body is read once as text and parsed safely; the server also always answers errors in JSON. |

## 5. Frontend behaviour bugs

| # | Problem | Fix in v4 |
|---|---|---|
| 5.1 | **Both login and registration forms are shown at the same time.** `.auth-form{display:grid}` is declared after `.hidden{display:none}` and overrides it. The same bug keeps the user block visible after logout. **[reproduced]** | `[hidden]{display:none!important}` and the native `hidden` attribute everywhere. |
| 5.2 | Clicking **"Ouvrir" on a dataset can analyse the previously selected one**: `choose()` doesn't wait for `refreshAll()`, and `loadAnalysis()` reads the old `<select>` value first. | No synchronised selects any more. Each dataset has its own address (`#/jeu/12/stats`), so what you open is what loads. |
| 5.3 | Changing the dataset in the Analysis dropdown leaves the old stats and charts on screen until "Analyser" is clicked. | Removed; navigation always reloads the view. |
| 5.4 | An expired session leaves the user inside the app with "Erreur" messages. | Any 401 sends the user back to the login screen with an explanation. |
| 5.5 | Buttons can be clicked twice while a request is running (duplicate datasets or records). | Buttons are disabled with a busy state during requests. |
| 5.6 | Status messages overwrite each other ("Jeu supprimé." is immediately replaced by "calculBA est prêt."). | Toast notifications that don't replace each other. |
| 5.7 | `<a><button>Exporter CSV</button></a>` is invalid HTML and the link has no `href` until an analysis has run. | Proper export menu with three formats: Excel .xlsx (recommended), CSV for French/German Excel (`;` and decimal comma), standard CSV. |
| 5.8 | No way to edit or delete a single observation; only the first 100 rows are ever visible. | Edit and delete per row, pagination (50 per page). |
| 5.9 | Text-column statistics (`most_frequent`) are computed by the API but never displayed. | Shown in a "Variables texte" table; ID-like columns are labelled as such. |

## 6. Layout and consistency discrepancies

| # | Problem | Fix in v4 |
|---|---|---|
| 6.1 | Header content and page content don't line up (header inner width 1100 px, main content 1072 px → 14 px offset). **[reproduced]** | Single layout grid: side rail + content column. |
| 6.2 | The logo appears twice on the login page (header and card). **[reproduced]** | One brand mark per screen. |
| 6.3 | On phones the 5 navigation buttons wrap onto 3 rows, the user block floats under the tagline, and the dataset table's action buttons are cut off ("Supp…"). **[reproduced]** | Top bar with a slide-in menu on phones; tables scroll inside their own frame; verified no horizontal page overflow at 390 px. |
| 6.4 | The domain list is typed twice in the HTML in two different orders (create: Béton first; import: Autre first), and the `/api/domains` endpoint is never used. | One list on the server, served by `/api/meta` and used by every form. |
| 6.5 | The interface mixes *tu* ("Connecte-toi", "Crée") and *vous* (all server messages). | *Vous* everywhere. |
| 6.6 | Most `<label>`s are not linked to their inputs (clicking a label does nothing, screen readers can't name fields); tabs have no ARIA roles; no visible focus style. | All fields labelled, ARIA tabs, focus rings, skip link, keyboard-closable menus and dialogs, reduced-motion support, dark mode. |
| 6.7 | "Observations actives" and "Domaine actif" on the home page depend on a hidden "active dataset" concept that users have to discover. | Home page lists all datasets with counts; each dataset page opens with a title block (name, domain, observations, columns, last change). |
| 6.8 | No favicon (404 on every page load). | Favicon added (cross-section of a reinforced-concrete beam). |

---

## What changed structurally

```
calculba/
├── backend/
│   ├── main.py        routes, validation, error handling, security headers
│   ├── analysis.py    number parsing, import, statistics, charts data, export
│   ├── security.py    password hashing, sessions, login throttling
│   ├── db.py          schema, migration from v3, connection per request
│   ├── settings.py    every limit and option in one place (env variables)
│   └── manage.py      admin commands (list users, re-attach orphan datasets)
├── frontend/
│   ├── index.html
│   └── static/  css/app.css · js/app.js · js/charts.js · vendor/Chart.js · fonts/Barlow
├── tests/test_api.py  33 automated tests
└── exemples/essais_beton.csv
```

Upgrading keeps existing data: start v4 on the old `calculba.db` and it migrates itself (tested).
