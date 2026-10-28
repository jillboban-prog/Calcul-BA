"""Tests des calculs (sans serveur) : python -m pytest -q tests/test_analysis.py"""
import io

import pytest

from backend import analysis as a


def test_small_values_keep_precision():
    # perméabilité (m/s) : l'arrondi à 4 décimales les écrasait à 0
    rows = [{"k": v} for v in (1.2e-8, 3.4e-8, 2.2e-8, 5.1e-9)]
    s = a.describe(["k"], rows)["columns"]["k"]
    assert s["mean"] == pytest.approx(1.8275e-8, rel=1e-3)
    assert s["min"] == pytest.approx(5.1e-9) and s["max"] == pytest.approx(3.4e-8)
    assert s["std"] > 0
    edges = s["histogram"]["edges"]
    assert edges[0] < edges[-1]
    g = a.groups([{"g": "A", "v": 1.2e-6}, {"g": "A", "v": 2e-6}], "g", "v")["groups"][0]
    assert g["mean"] == pytest.approx(1.6e-6)


def test_usual_values_rounded_as_before():
    assert a._r(26.94705882) == 26.9471
    assert a._r(0.0123456) == 0.0123
    assert a._r(19.7949, 2) == 19.79
    assert a._r(0.0) == 0.0 and a._r(None) is None


def test_padded_codes_are_text():
    rows = [{"Code": f"{i:03d}", "R": 20 + i % 5} for i in range(1, 30)]
    d = a.describe(["Code", "R"], rows)
    assert d["columns"]["Code"]["type"] == "text"
    assert d["columns"]["R"]["type"] == "numeric"
    assert d["numeric_columns"] == ["R"]


def test_plain_numbers_stay_numeric():
    for values in (["1", "2", "3", "10"], ["7", "14", "28"], ["0", "5", "12"], ["0,5", "0,25", "1"]):
        d = a.describe(["x"], [{"x": v} for v in values])
        assert d["columns"]["x"]["type"] == "numeric", values


def test_control_characters_do_not_break_export():
    assert a.clean_value("ab\x1acd") == "abcd"
    assert a.clean_value("\x1a") is None
    # donnée déjà enregistrée avec un caractère de contrôle
    table = a.export_rows(["T"], [{"T": "x\x0by"}], [])
    xlsx = a.to_xlsx("essai", ["T\x01"], table)
    cols, data = a.read_table("e.xlsx", xlsx)
    assert cols == ["T"] and data == [["xy"]]
    # une ligne ne contenant que ce caractère est ignorée à l'import
    cols, data = a.read_table("f.csv", "A;B\n1;2\n\x1a\n".encode("latin-1"))
    assert data == [["1", "2"]]


def test_oversized_csv_cell_gives_clear_message():
    raw = ("A;B\n" + "x" * 200_000 + ";1\n").encode()
    with pytest.raises(a.ImportProblem):
        a.read_table("gros.csv", raw)
