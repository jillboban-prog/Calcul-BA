"""Configuration centrale de calculBA.

Toutes les valeurs réglables passent par des variables d'environnement afin
de ne jamais modifier le code pour passer du poste local à un serveur.
"""
from __future__ import annotations

import os
from pathlib import Path

APP_NAME = "calculBA"
VERSION = "5.0.0"

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"
DB_PATH = Path(os.environ.get("CALCULBA_DB", ROOT / "calculba.db"))
# Base PostgreSQL (hébergement en ligne, ex. Neon). Vide = SQLite local (DB_PATH).
# Forme : postgresql://utilisateur:motdepasse@hote/base?sslmode=require
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))

# Sessions
COOKIE_NAME = "calculba_session"
SESSION_DAYS = int(os.environ.get("CALCULBA_SESSION_DAYS", "30"))
# À activer (=1) dès que l'application est servie en HTTPS.
SECURE_COOKIES = os.environ.get("CALCULBA_SECURE_COOKIES", "0") == "1"

# Inscription. Si un code d'invitation est défini, il est demandé à l'inscription :
# seules les personnes à qui vous l'avez donné peuvent créer un compte.
INVITE_CODE = os.environ.get("CALCULBA_INVITE_CODE", "").strip()
REGISTER_MAX_PER_IP = int(os.environ.get("CALCULBA_REGISTER_MAX_PER_IP", "5"))   # par heure
REGISTER_WINDOW_SECONDS = 3600

# En-tête exigé sur toute requête qui modifie des données (protection CSRF).
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "calculBA"

# Connexion : nombre d'échecs tolérés par adresse IP + e-mail sur la fenêtre.
LOGIN_MAX_FAILURES = 8
LOGIN_WINDOW_SECONDS = 15 * 60

# Mots de passe
PASSWORD_MIN = 10
PASSWORD_MAX = 256
PBKDF2_ITERATIONS = 600_000
LEGACY_PBKDF2_ITERATIONS = 310_000  # format de la version 3

# Limites des jeux de données
MAX_COLUMNS = 60
MAX_ROWS = 50_000
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_NAME_LENGTH = 120
MAX_COLUMN_NAME_LENGTH = 80
MAX_VALUE_LENGTH = 500
# Quotas par compte (protègent l'espace de la base gratuite en ligne).
MAX_DATASETS_PER_USER = int(os.environ.get("CALCULBA_MAX_DATASETS", "100"))
MAX_RECORDS_PER_USER = int(os.environ.get("CALCULBA_MAX_RECORDS", "200000"))

# Une colonne est considérée numérique si au moins cette part des valeurs
# renseignées se lit comme un nombre.
NUMERIC_THRESHOLD = 0.8

DOMAINS = [
    "Béton",
    "Sols et géotechnique",
    "Topographie",
    "Matériaux",
    "Structures",
    "Routes",
    "Hydraulique",
    "Autre",
]
