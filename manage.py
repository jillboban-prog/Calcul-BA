"""Commandes d'administration. À lancer depuis la racine du projet.

Base utilisée : SQLite (calculba.db) par défaut, ou PostgreSQL si la variable
DATABASE_URL est définie (pour administrer la base en ligne depuis votre PC).

    python -m backend.manage users                    liste des comptes
    python -m backend.manage reset-password EMAIL     nouveau mot de passe temporaire
    python -m backend.manage orphans                  jeux sans propriétaire
    python -m backend.manage assign-orphans EMAIL     les rattacher à un compte
    python -m backend.manage backup [DOSSIER]         copie datée de calculba.db (SQLite)
    python -m backend.manage export-json [FICHIER]    sauvegarde complète en JSON (toutes bases)
    python -m backend.manage import-sqlite FICHIER    copier une base SQLite dans la base en ligne (vide)
"""
from __future__ import annotations

import json
import secrets
import sqlite3
import sys
import time
from pathlib import Path

from . import settings
from .db import backend_label, close_pool, connect, init_db
from .security import hash_password

KEEP_BACKUPS = 14   # nombre de sauvegardes SQLite conservées (les plus anciennes sont supprimées)
COPY_COLUMNS = {
    "users": ("id", "full_name", "birth_date", "email", "password_hash", "created_at"),
    "datasets": ("id", "user_id", "name", "domain", "columns_json", "created_at", "updated_at"),
    "records": ("id", "dataset_id", "values_json", "created_at"),
}


def _backup_sqlite(argv: list[str]) -> int:
    if settings.USE_POSTGRES:
        print("La base en ligne (PostgreSQL) se sauvegarde avec : python -m backend.manage export-json")
        return 1
    folder = Path(argv[1]) if len(argv) == 2 else settings.ROOT / "sauvegardes"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"calculba_{time.strftime('%Y%m%d_%H%M%S')}.db"
    # API de sauvegarde de SQLite : copie cohérente même si le serveur tourne.
    src, dest = sqlite3.connect(settings.DB_PATH), sqlite3.connect(target)
    try:
        src.backup(dest)
    finally:
        dest.close(); src.close()
    for old in sorted(folder.glob("calculba_*.db"))[:-KEEP_BACKUPS]:
        old.unlink()
    print(f"Sauvegarde créée : {target}")
    return 0


def _export_json(conn, argv: list[str]) -> int:
    target = Path(argv[1]) if len(argv) == 2 else settings.ROOT / "sauvegardes" / f"calculba_{time.strftime('%Y%m%d_%H%M%S')}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    data = {"format": "calculBA-export", "version": settings.VERSION, "tables": {}}
    for t, cols in COPY_COLUMNS.items():
        rows = conn.execute(f"SELECT {', '.join(cols)} FROM {t} ORDER BY id").fetchall()
        data["tables"][t] = [dict(zip(cols, (r[i] for i in range(len(cols))))) for r in rows]
    target.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    counts = ", ".join(f"{len(v)} {k}" for k, v in data["tables"].items())
    print(f"Export créé : {target}  ({counts})")
    return 0


def _import_sqlite(conn, path: str) -> int:
    """Copie comptes, jeux et observations d'un calculba.db vers la base actuelle, qui doit être vide."""
    src_path = Path(path)
    if not src_path.is_file():
        print(f"Fichier introuvable : {src_path}"); return 1
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
        print("La base de destination contient déjà des comptes : import refusé pour éviter les doublons.")
        return 1
    src = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
    try:
        totals = {}
        for t, cols in COPY_COLUMNS.items():
            have = {r[1] for r in src.execute(f"PRAGMA table_info({t})")}
            use = [c for c in cols if c in have]
            rows = src.execute(f"SELECT {', '.join(use)} FROM {t} ORDER BY id").fetchall()
            if t == "datasets":  # jeux sans propriétaire : ignorés (invisibles pour tous)
                ui = use.index("user_id")
                rows = [r for r in rows if r[ui] is not None]
            if rows:
                marks = ", ".join("?" for _ in use)
                conn.executemany(f"INSERT INTO {t} ({', '.join(use)}) VALUES ({marks})", rows)
            totals[t] = len(rows)
        if settings.USE_POSTGRES:  # les compteurs d'identifiants doivent repartir après les ids copiés
            for t in COPY_COLUMNS:
                conn.execute(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), COALESCE((SELECT MAX(id) FROM {t}), 0) + 1, false)")
        conn.commit()
    finally:
        src.close()
    print("Import terminé : " + ", ".join(f"{n} {t}" for t, n in totals.items()) + ".")
    print("Les mots de passe sont conservés ; chacun se reconnecte avec le sien.")
    return 0


def main(argv: list[str]) -> int:
    init_db()
    conn = connect()
    try:
        cmd = argv[0] if argv else "help"
        if cmd not in ("help", "-h", "--help"):
            print(f"Base : {backend_label()}")
        if cmd == "users":
            for r in conn.execute("SELECT id, full_name, email, created_at FROM users ORDER BY id"):
                print(f"{r['id']:>4}  {r['email']:<35} {r['full_name']}  (créé le {r['created_at']})")
        elif cmd == "reset-password" and len(argv) == 2:
            email = argv[1].strip().lower()
            user = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if not user:
                print("Aucun compte avec cette adresse."); return 1
            temp = secrets.token_urlsafe(9)  # 12 caractères
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(temp), user["id"]))
            conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user["id"],))
            conn.commit()
            print(f"Mot de passe temporaire pour {email} : {temp}")
            print("Transmettez-le en privé ; toutes les sessions de ce compte ont été fermées.")
        elif cmd == "orphans":
            rows = conn.execute("SELECT id, name FROM datasets WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)").fetchall()
            print(f"{len(rows)} jeu(x) sans propriétaire")
            for r in rows:
                print(f"  #{r['id']}  {r['name']}")
        elif cmd == "assign-orphans" and len(argv) == 2:
            user = conn.execute("SELECT id FROM users WHERE email = ?", (argv[1].strip().lower(),)).fetchone()
            if not user:
                print("Aucun compte avec cette adresse."); return 1
            n = conn.execute("UPDATE datasets SET user_id = ? WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)",
                             (user["id"],)).rowcount
            conn.commit()
            print(f"{n} jeu(x) rattaché(s) à {argv[1]}.")
        elif cmd == "backup" and len(argv) <= 2:
            return _backup_sqlite(argv)
        elif cmd == "export-json" and len(argv) <= 2:
            return _export_json(conn, argv)
        elif cmd == "import-sqlite" and len(argv) == 2:
            return _import_sqlite(conn, argv[1])
        else:
            print(__doc__); return 0 if cmd in ("help", "-h", "--help") else 1
        return 0
    finally:
        conn.close()
        close_pool()  # PostgreSQL : ferme les connexions pour quitter sans attendre


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
