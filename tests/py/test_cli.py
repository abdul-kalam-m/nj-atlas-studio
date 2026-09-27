import subprocess
import sys

from pipeline import ROOT


def test_help_lists_every_command():
    result = subprocess.run([sys.executable, "-m", "pipeline", "--help"], cwd=ROOT,
                            capture_output=True, text=True, check=True)
    for command in ("validate", "inspect", "fetch", "build", "catalog", "check"):
        assert command in result.stdout
