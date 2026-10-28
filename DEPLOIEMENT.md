# Mettre calculBA en ligne (lien permanent, gratuit, sans carte bancaire)

Résultat : une adresse du type **https://calculba-xxxx.onrender.com** que vous pouvez envoyer, ouverte depuis n'importe quel ordinateur ou téléphone.

Trois comptes gratuits, aucun ne demande de carte bancaire :

| Service | Rôle | Offre gratuite |
|---|---|---|
| **GitHub** | garde le code de l'application | dépôt privé gratuit |
| **Neon** | garde les données (base PostgreSQL) | 1 Go, largement assez pour calculBA |
| **Render** | fait tourner l'application | 750 h/mois, soit tout le mois pour un service |

Pourquoi deux hébergeurs : le disque de Render gratuit est **effacé à chaque redémarrage**. Les données doivent donc vivre ailleurs, dans la base Neon, qui, elle, est permanente.

Durée : environ 30 minutes la première fois.

---

## Étape 1 — Mettre le code sur GitHub

1. Créez un compte sur **github.com** (bouton *Sign up*).
2. En haut à droite : **+** → **New repository**.
   - *Repository name* : `calculba`
   - Cochez **Private** (personne d'autre ne verra le code).
   - Cliquez **Create repository**.
3. Sur la page du dépôt vide, cliquez le lien **uploading an existing file**.
4. **Décompressez le zip de calculBA dans un dossier neuf**, sans lancer l'application dedans : il ne doit contenir ni `.venv`, ni `calculba.db`, ni `sauvegardes`.
5. Ouvrez le dossier `calculba`, sélectionnez **tout son contenu** (`Ctrl + A`) et glissez-le dans la page GitHub. Les dossiers `backend`, `frontend`, `tests`… et les fichiers `render.yaml`, `.python-version` doivent apparaître dans la liste.
6. En bas : **Commit changes**.

> Si Windows masque `.python-version` ou `.gitignore` : ce n'est pas grave. Sans `.python-version`, Render utilise Python 3.14, qui fonctionne aussi (testé).

## Étape 2 — Créer la base de données sur Neon

1. Allez sur **neon.com** → **Sign up**. Le plus simple : *Continue with GitHub*.
2. Créez un projet :
   - *Project name* : `calculba`
   - *Postgres version* : celle proposée par défaut
   - *Region* : **AWS Europe Central 1 (Frankfurt)**, la plus proche de Render Francfort. Évitez les régions *Azure*.
3. Une fois le projet créé, cliquez **Connect** (ou *Connection string*) et copiez l'adresse qui commence par `postgresql://…` et se termine par `…sslmode=require…`.
4. Gardez-la de côté (Bloc-notes). **C'est un mot de passe : ne la publiez nulle part.**

## Étape 3 — Lancer l'application sur Render

1. Allez sur **render.com** → **Get Started** → *Sign up with GitHub* (autorisez Render à voir vos dépôts, au moins `calculba`).
2. En haut : **New +** → **Blueprint**.
3. Choisissez le dépôt `calculba`. Render lit le fichier `render.yaml` et prépare un service `calculba` gratuit à Francfort.
4. Render demande deux valeurs :
   - **DATABASE_URL** : collez l'adresse Neon de l'étape 2.
   - **CALCULBA_INVITE_CODE** : un code de votre choix (par exemple `beton-2026`). Seules les personnes qui ont ce code pourront créer un compte. Laissez vide pour une inscription libre, déconseillé pour un lien public.
5. Cliquez **Apply** (ou *Deploy Blueprint*). La première installation dure 3 à 6 minutes. Dans les journaux (*Logs*), la ligne `calculBA 5.0.0, base : PostgreSQL` confirme que la base Neon est bien utilisée.
6. L'adresse de votre application apparaît en haut de la page du service : **https://calculba-xxxx.onrender.com**. C'est le lien à partager, accompagné du code d'invitation.

## Étape 4 (facultatif) — Transférer les données de votre PC

À faire **avant** que quelqu'un crée un compte en ligne, car le transfert exige une base vide.

1. Sur votre PC, dans le dossier calculBA qui contient votre `calculba.db` habituel, double-cliquez **`Administrer_en_ligne.bat`**.
2. Collez l'adresse Neon (clic droit dans la fenêtre noire), Entrée.
3. Choisissez **1**. Comptes, jeux et observations sont copiés ; chacun garde son mot de passe.

## Ce qu'il faut savoir sur l'offre gratuite

- **Mise en veille** : après 15 minutes sans visite, Render endort l'application. La visite suivante la réveille en **environ une minute** (la base Neon se réveille aussi). Ensuite, tout est rapide. Prévenez vos utilisateurs.
- **Quotas par compte** (réglables) : 100 jeux et 200 000 observations, pour ne pas dépasser 1 Go chez Neon.
- **Sauvegardes** : `Administrer_en_ligne.bat` → **2** crée une copie complète datée dans `sauvegardes`. Faites-en une régulièrement et copiez-la sur une clé USB ou un cloud.
- **Mot de passe oublié** : il n'y a pas d'envoi d'e-mail. Utilisez `Administrer_en_ligne.bat` → **3** : il affiche un mot de passe temporaire à transmettre en privé.
- **Mettre à jour l'application** : sur GitHub, téléversez les fichiers modifiés (même méthode qu'à l'étape 1). Render redéploie tout seul en quelques minutes ; les données, chez Neon, ne bougent pas.

## Réglages possibles (Render → service `calculba` → *Environment*)

| Variable | Effet | Valeur par défaut |
|---|---|---|
| `DATABASE_URL` | base Neon | (obligatoire en ligne) |
| `CALCULBA_INVITE_CODE` | code exigé à l'inscription ; vide = inscription libre | vide |
| `CALCULBA_SECURE_COOKIES` | cookie de session envoyé seulement en HTTPS | `1` en ligne |
| `CALCULBA_MAX_DATASETS` | jeux maximum par compte | `100` |
| `CALCULBA_MAX_RECORDS` | observations maximum par compte | `200000` |
| `CALCULBA_REGISTER_MAX_PER_IP` | créations de compte par heure et par adresse IP | `5` |
| `CALCULBA_SESSION_DAYS` | durée d'une connexion | `30` |

## En cas de problème

| Ce que vous voyez | Cause probable et solution |
|---|---|
| Le déploiement échoue pendant `pip install` | Un fichier manque sur GitHub : vérifiez que `requirements.txt` et `requirements-server.txt` y sont. |
| Journaux : `connection failed` ou `password authentication failed` | `DATABASE_URL` mal copiée. Render → *Environment* → recollez l'adresse Neon complète → *Save, rebuild and deploy*. |
| La page met une minute à s'ouvrir | Réveil après la mise en veille : normal sur l'offre gratuite. |
| « Code d'invitation incorrect » | Le code saisi diffère de `CALCULBA_INVITE_CODE` (majuscules comprises). |
| « Trop de tentatives » | Protection contre les robots : 5 comptes par heure et par adresse IP, ou 8 mots de passe faux en 15 minutes. Attendez. |

Les offres gratuites et l'apparence des sites évoluent : si un bouton porte un autre nom, cherchez l'équivalent (*New project*, *Blueprint*, *Connection string*…).
