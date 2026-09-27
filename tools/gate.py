"""Run a gate's automated checks: python tools/gate.py G1 --layer nj_counties

Keep GATE_COMMANDS in step with the "Automated" blocks in docs/GATES.md.
"{py}" is replaced by the Python running this script (the project venv) and "{id}" by --layer.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

GATE_COMMANDS = {
    "G0": [
        ["{py}", "-c", "import pyogrio; assert pyogrio.list_drivers()['PMTiles'] == 'rw'"],
        ["{py}", "-m", "pipeline", "validate"],
        ["{py}", "-m", "pytest", "-m", "not network"],
        ["{npm}", "test"],
    ],
    "G1": [
        ["{py}", "-m", "pipeline", "validate"],
        ["{py}", "-m", "pipeline", "build", "{id}", "--include-drafts"],
        ["{py}", "-m", "pipeline", "catalog", "--include-drafts"],
        ["{py}", "-m", "pipeline", "check", "{id}"],
        ["{py}", "-m", "pytest", "-m", "not network"],
    ],
    "G2": [
        ["{py}", "-m", "pipeline", "check"],
        ["{py}", "tools/lint_text.py"],
        ["{py}", "-m", "pytest", "-m", "not network"],
        ["{npm}", "test"],
    ],
    "G3": [
        ["{py}", "-m", "pipeline", "build", "--all", "--include-drafts"],
        ["{py}", "-m", "pipeline", "catalog", "--include-drafts"],
        ["{py}", "-m", "pipeline", "check"],
        ["{py}", "-m", "pytest", "-m", "not network"],
        ["{npm}", "test"],
        ["{py}", "tools/lint_text.py"],
    ],
    "G4": [
        ["{py}", "-m", "pipeline", "check"],
        ["{npm}", "test"],
    ],
    "G5": [
        ["{py}", "tools/lint_text.py"],
    ],
    "G6": [
        ["{py}", "tools/release.py"],
    ],
    "G7": [
        ["{py}", "-m", "pipeline", "check", "{id}"],
        ["{py}", "-m", "pytest", "-m", "not network"],
        ["{npm}", "test"],
    ],
}
ANCHORS = {
    "G0": "g0--workspace-ready", "G1": "g1--layer-data-is-valid", "G2": "g2--the-viewer-shows-layers",
    "G3": "g3--filters-are-correct", "G4": "g4--downloads-and-links-work",
    "G5": "g5--a-non-gis-person-can-use-it", "G6": "g6--release-is-live", "G7": "g7--large-layers-work",
}


def commands_for(gate: str, layer: str | None = None, py: str = sys.executable, npm: str | None = None) -> list[list[str]]:
    if gate not in GATE_COMMANDS:
        raise ValueError(f"Unknown gate {gate}; choose one of {', '.join(GATE_COMMANDS)}")
    templates = GATE_COMMANDS[gate]
    if any("{id}" in part for command in templates for part in command) and not layer:
        raise ValueError(f"Gate {gate} needs --layer <id>")
    npm = npm or shutil.which("npm") or "npm"
    values = {"{py}": py, "{npm}": npm, "{id}": layer or ""}
    return [[values.get(part, part) for part in command] for command in templates]


def display(command: list[str]) -> str:
    shown = ["python" if part == sys.executable else ("npm" if part.lower().endswith(("npm", "npm.cmd")) else part)
             for part in command]
    return " ".join(f'"{p}"' if " " in p else p for p in shown)


def run_commands(commands: list[list[str]], cwd: Path = ROOT, echo=print) -> bool:
    all_passed = True
    for command in commands:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        passed = result.returncode == 0
        all_passed &= passed
        echo(f"{'PASS' if passed else 'FAIL'}  {display(command)}")
        if not passed:
            tail = (result.stdout + result.stderr).strip().splitlines()[-15:]
            for line in tail:
                echo(f"      {line}")
    return all_passed


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run a gate's automated checks")
    parser.add_argument("gate", choices=sorted(GATE_COMMANDS))
    parser.add_argument("--layer", help="Layer id for gates that check one layer (G1, G7)")
    args = parser.parse_args(argv)
    try:
        commands = commands_for(args.gate, args.layer)
    except ValueError as error:
        print(error)
        return 2
    passed = run_commands(commands)
    print(f"GATE {args.gate}: {'PASS' if passed else 'FAIL'}")
    print(f"Manual checks: docs/GATES.md#{ANCHORS[args.gate]}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
