"""Réglages communs des tests.

Par défaut les tests utilisent une base SQLite temporaire. Pour les lancer sur
PostgreSQL (comme en ligne), définissez DATABASE_URL vers une base de TEST :
toutes ses tables calculBA sont effacées au début de la session de tests.
"""
import os

import pytest

# Les tests créent beaucoup de comptes depuis la même adresse : limite relevée ici,
# et vérifiée à part dans test_register_rate_limit.
os.environ.setdefault("CALCULBA_REGISTER_MAX_PER_IP", "100000")

# Base SQLite temporaire, choisie ICI (conftest est chargé avant tout module de test) :
# sinon le premier test qui importe backend fige le chemin sur le vrai calculba.db.
import tempfile  # noqa: E402

os.environ["CALCULBA_DB"] = os.path.join(tempfile.mkdtemp(prefix="calculba_tests_"), "test.db")


def pytest_configure(config):
    url = os.environ.get("DATABASE_URL", "")
    if url.startswith(("postgres://", "postgresql://")):
        import psycopg
        with psycopg.connect(url, autocommit=True) as c:
            c.execute("DROP TABLE IF EXISTS records, datasets, user_sessions, users CASCADE")


@pytest.fixture
def sqlite_only():
    from backend import settings
    if settings.USE_POSTGRES:
        pytest.skip("test propre à SQLite")
