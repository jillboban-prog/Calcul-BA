"""Tests de la version 5 : lois de probabilité, quotas, invitation, limite d'inscription,
commandes d'administration. Fonctionnent sur SQLite et sur PostgreSQL (voir conftest.py)."""
import io
import os
import sqlite3
import tempfile

os.environ.setdefault("CALCULBA_DB", os.path.join(tempfile.mkdtemp(), "v5.db"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import analysis, settings  # noqa: E402
from backend.main import app  # noqa: E402

H = {settings.CSRF_HEADER: settings.CSRF_VALUE}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE = os.path.join(ROOT, "exemples", "essais_beton.csv")


def user(email):
    c = TestClient(app)
    c.__enter__()
    r = c.post("/api/auth/register", headers=H, json={"full_name": "Test V5", "email": email, "password": "motdepasse123"})
    assert r.status_code in (201, 409), r.text
    if r.status_code == 409:
        assert c.post("/api/auth/login", headers=H, json={"email": email, "password": "motdepasse123"}).status_code == 200
    return c


def import_sample(c):
    with open(SAMPLE, "rb") as f:
        r = c.post("/api/datasets/import", headers=H, files={"file": ("essais_beton.csv", f.read())})
    assert r.status_code == 201, r.text
    return r.json()["dataset"]["id"]


# ------------------------------------------------------------ probabilités

def test_every_distribution_fits_concrete_strengths():
    c = user("proba@example.com")
    did = import_sample(c)
    for key in analysis.DISTRIBUTIONS:
        r = c.get(f"/api/datasets/{did}/probability", params={"column": "Resistance_MPa", "distribution": key})
        assert r.status_code == 200, (key, r.text)
        j = r.json()
        assert j["n"] == 51 and j["selected"]["key"] == key
        assert all(p["value"] is not None for p in j["selected"]["parameters"])
        assert [q["p"] for q in j["quantiles"]] == [0.05, 0.5, 0.95]
    best = c.get(f"/api/datasets/{did}/probability", params={"column": "Resistance_MPa"}).json()
    ranked = [x for x in best["comparison"] if x["available"]]
    assert ranked[0]["delta_aic"] == 0 and len(ranked) == 6
    # Lognormale à 2 paramètres : plus de décalage absurde de -2 000 MPa.
    logn = c.get(f"/api/datasets/{did}/probability", params={"column": "Resistance_MPa", "distribution": "lognormal"}).json()
    mu_ln = logn["selected"]["parameters"][0]["value"]
    assert 3.0 < mu_ln < 3.6  # exp(mu) ≈ 27 MPa


def test_normal_fit_matches_sample_statistics():
    fit = analysis.fit_distributions([20.0, 22.0, 24.0, 26.0, 28.0, 30.0], "normal")
    mu, sigma = (p["value"] for p in fit["selected"]["parameters"])
    assert mu == pytest.approx(25.0) and sigma == pytest.approx(3.4157, rel=1e-3)
    assert fit["quantiles"][0]["model"] == pytest.approx(25.0 - 1.6449 * 3.4157, rel=1e-3)


def test_probability_refuses_bad_inputs():
    c = user("proba2@example.com")
    did = import_sample(c)
    r = c.get(f"/api/datasets/{did}/probability", params={"column": "Echantillon"})
    assert r.status_code == 400 and "numérique" in r.json()["detail"]
    csv = "Code;R\n" + "\n".join(f"{i:03d};{20 + i % 7}" for i in range(1, 30))
    did2 = c.post("/api/datasets/import", headers=H, files={"file": ("c.csv", csv.encode())}).json()["dataset"]["id"]
    assert c.get(f"/api/datasets/{did2}/probability", params={"column": "Code"}).status_code == 400
    with pytest.raises(analysis.FitProblem):
        analysis.fit_distributions([-1.0, 2, 3, 4, 5], "lognormal")
    with pytest.raises(analysis.FitProblem):
        analysis.fit_distributions([5.0] * 10, "normal")
    with pytest.raises(analysis.FitProblem):
        analysis.fit_distributions([1.0, 2, 3], "normal")
    assert c.get(f"/api/datasets/{did}/probability", params={"column": "Resistance_MPa", "distribution": "student"}).status_code == 422


def test_old_probability_page_redirects():
    c = TestClient(app)
    r = c.get("/probabilites", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/#/"


# ------------------------------------------------------------- inscription

def test_invite_code(monkeypatch):
    monkeypatch.setattr(settings, "INVITE_CODE", "beton2026")
    c = TestClient(app)
    assert c.get("/api/meta").json()["invite_required"] is True
    body = {"full_name": "Invité", "email": "invite@example.com", "password": "motdepasse123"}
    assert c.post("/api/auth/register", headers=H, json=body).status_code == 403
    assert c.post("/api/auth/register", headers=H, json={**body, "invite_code": "mauvais"}).status_code == 403
    assert c.post("/api/auth/register", headers=H, json={**body, "invite_code": "beton2026"}).status_code == 201


def test_register_rate_limit(monkeypatch):
    from backend import main, security
    monkeypatch.setattr(main, "register_throttle", security.LoginThrottle(3, 3600))
    c = TestClient(app)
    codes = [c.post("/api/auth/register", headers=H, json={"full_name": "Robot", "email": f"bot{i}@example.com",
                                                           "password": "motdepasse123"}).status_code for i in range(5)]
    assert codes == [201, 201, 201, 429, 429]


# ------------------------------------------------------------------ quotas

def test_quotas(monkeypatch):
    c = user("quota@example.com")
    monkeypatch.setattr(settings, "MAX_DATASETS_PER_USER", 2)
    monkeypatch.setattr(settings, "MAX_RECORDS_PER_USER", 60)
    did = import_sample(c)  # 54 lignes
    r = c.post("/api/datasets/import", headers=H, files={"file": ("b.csv", open(SAMPLE, "rb").read())})
    assert r.status_code == 400 and "observations" in r.json()["detail"]
    ok = c.post("/api/datasets", headers=H, json={"name": "Deux", "columns": ["a"]})
    assert ok.status_code == 201
    third = c.post("/api/datasets", headers=H, json={"name": "Trois", "columns": ["a"]})
    assert third.status_code == 400 and "jeux" in third.json()["detail"]
    for i in range(6):
        assert c.post(f"/api/datasets/{did}/records", headers=H, json={"values": {"Echantillon": f"X{i}"}}).status_code == 201
    over = c.post(f"/api/datasets/{did}/records", headers=H, json={"values": {"Echantillon": "trop"}})
    assert over.status_code == 400


def test_security_headers_when_https(monkeypatch):
    monkeypatch.setattr(settings, "SECURE_COOKIES", True)
    r = TestClient(app).get("/api/health")
    assert r.headers["strict-transport-security"].startswith("max-age=")


# ------------------------------------------------------ administration

def test_manage_reset_password(capsys):
    from backend import manage
    user("oubli@example.com")
    assert manage.main(["reset-password", "oubli@example.com"]) == 0
    temp = capsys.readouterr().out.split(" : ")[-1].split()[0]
    c = TestClient(app)
    assert c.post("/api/auth/login", headers=H, json={"email": "oubli@example.com", "password": "motdepasse123"}).status_code == 401
    assert c.post("/api/auth/login", headers=H, json={"email": "oubli@example.com", "password": temp}).status_code == 200


def test_manage_export_json(tmp_path):
    from backend import manage
    out = tmp_path / "export.json"
    assert manage.main(["export-json", str(out)]) == 0
    import json
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["format"] == "calculBA-export" and data["tables"]["users"]


def test_manage_import_sqlite_into_empty_database(tmp_path, monkeypatch):
    """Transfert PC -> base en ligne : comptes, jeux, observations et mots de passe conservés."""
    from backend import db, manage, security
    # Base source : un calculba.db de PC avec un compte, un jeu et deux observations.
    src = tmp_path / "pc.db"
    raw = sqlite3.connect(src)
    raw.executescript(db.SQLITE_SCHEMA)
    raw.execute("INSERT INTO users (id, full_name, email, password_hash) VALUES (7, 'Ange PC', 'pc@example.com', ?)",
                (security.hash_password("motdepassePC1"),))
    raw.execute("INSERT INTO datasets (id, user_id, name, domain, columns_json) VALUES (3, 7, 'Jeu PC', 'Béton', '[\"R\"]')")
    raw.execute("INSERT INTO datasets (id, user_id, name, domain, columns_json) VALUES (4, NULL, 'Orphelin', 'Autre', '[\"R\"]')")
    raw.executemany("INSERT INTO records (dataset_id, values_json) VALUES (3, ?)", [('{"R": "25,5"}',), ('{"R": "27"}',)])
    raw.commit(); raw.close()

    # Destination vide : une base neuve (SQLite temporaire, ou PostgreSQL de test vidé).
    if settings.USE_POSTGRES:
        conn = db.connect()
        conn.execute("TRUNCATE records, datasets, user_sessions, users RESTART IDENTITY CASCADE"); conn.commit(); conn.close()
    else:
        monkeypatch.setattr(settings, "DB_PATH", tmp_path / "online.db")
    assert manage.main(["import-sqlite", str(src)]) == 0

    with TestClient(app) as c:
        assert c.post("/api/auth/login", headers=H, json={"email": "pc@example.com", "password": "motdepassePC1"}).status_code == 200
        ds = c.get("/api/datasets").json()
        assert [d["name"] for d in ds] == ["Jeu PC"] and ds[0]["record_count"] == 2
        # Les nouveaux identifiants repartent après les identifiants copiés.
        new = c.post("/api/datasets", headers=H, json={"name": "Après import", "columns": ["a"]}).json()
        assert new["id"] > 3  # le jeu orphelin n° 4 n'est pas copié
    # Une seconde importation est refusée (base non vide).
    assert manage.main(["import-sqlite", str(src)]) == 1
