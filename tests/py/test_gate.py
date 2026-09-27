import sys

import pytest

from tools.gate import ANCHORS, GATE_COMMANDS, commands_for, run_commands


def test_every_gate_has_commands_and_an_anchor():
    assert set(GATE_COMMANDS) == set(ANCHORS) == {f"G{n}" for n in range(8)}
    assert all(GATE_COMMANDS[gate] for gate in GATE_COMMANDS)


def test_layer_placeholder_is_substituted():
    commands = commands_for("G1", "nj_counties", py="PY", npm="NPM")
    assert ["PY", "-m", "pipeline", "check", "nj_counties"] in commands
    assert all("{id}" not in part for command in commands for part in command)


def test_layer_gate_without_layer_is_refused():
    with pytest.raises(ValueError, match="--layer"):
        commands_for("G1")


def test_unknown_gate_is_refused():
    with pytest.raises(ValueError, match="Unknown gate"):
        commands_for("G9")


def test_aggregation_passes_only_when_every_command_passes():
    ok = [sys.executable, "-c", "print('fine')"]
    bad = [sys.executable, "-c", "import sys; print('broken'); sys.exit(3)"]
    lines = []
    assert run_commands([ok, ok], echo=lines.append) is True
    assert run_commands([ok, bad, ok], echo=lines.append) is False
    assert any(line.startswith("FAIL") for line in lines)
    assert any("broken" in line for line in lines)
