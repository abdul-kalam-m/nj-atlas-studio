"""Build a release and prepare it for GitHub Pages. The human pushes it (docs/RELEASE.md).

    python tools/release.py              # published layers only; prepares build/pages and prints the push command
    python tools/release.py --rehearsal  # includes drafts to test the whole process; never prints a push command
    python tools/release.py --refresh    # download every source again first

Order: check preconditions, clear site/data, build, catalog, every automated check, write release.json,
copy site/ into a brand-new git repository at build/pages with one commit. Nothing is pushed.

Studio (docs/studio/IMPLEMENTATION_GUIDE.md): only copy layers are rebuilt. Folders of hybrid layers (hours to
rebuild) and parked split layers are kept when site/data is cleared, and never copied into build/pages; hybrid
map copies are uploaded by the owner (tools/publish_tiles.py). build/pages gets the site plus an explicit list of
data files: both catalogs, the area lists and outlines, the calendar, health.json, release.json and the copy layers'
folders. health.json is the newer of the local copy and the live site's, which the nightly check updates.
"""
import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.levels import COUNTY_LAYER, LEVEL_BY_LAYER, MUNICIPALITY_LAYER, TAG_STEPS  # noqa: E402
from pipeline.recipes import load_recipes  # noqa: E402

PAGES = ROOT / "build" / "pages"


class ReleaseError(RuntimeError):
    pass


def run(command: list[str], label: str) -> None:
    print(f"-> {label}", flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode != 0:
        raise ReleaseError(f"Stopped: '{label}' failed. Nothing was published.")


def chosen_layers(rehearsal: bool) -> list[dict]:
    recipes = [r for r in load_recipes(ROOT) if r["access"] == "copy"]  # live and hybrid layers ship no files (D-030)
    chosen = [r for r in recipes if rehearsal or r["status"] == "published"]
    ids = {r["id"] for r in chosen}
    if not chosen:
        raise ReleaseError("No layer has status 'published'. The owner reviews licenses first (DECISIONS.md O-3).")
    missing = needed_boundaries(chosen) - ids
    if missing:
        raise ReleaseError(f"The place pickers and place tags need {', '.join(sorted(missing))} to be published too.")
    return chosen


def needed_boundaries(recipes: list[dict]) -> set[str]:
    """Counties and municipalities, plus every boundary layer the chosen layers' place tags read, recursively."""
    needed = {COUNTY_LAYER, MUNICIPALITY_LAYER}
    modes = [recipe["place_tags"] for recipe in recipes]
    while modes:
        for step in TAG_STEPS[modes.pop()]:
            if step["layer"] not in needed:
                needed.add(step["layer"])
                modes.append(LEVEL_BY_LAYER[step["layer"]]["place_tags"])
    return needed


def git_commit() -> str:
    head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True)
    if head.returncode != 0:
        return "uncommitted"
    dirty = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return head.stdout.strip() + ("-dirty" if dirty else "")


def r2_layers() -> list[str]:
    """Layers whose files live on Cloudflare R2, not GitHub Pages."""
    return [r["id"] for r in load_recipes(ROOT) if (r.get("partition") or {}).get("host") == "r2"]


def clear_data(data: Path, keep: list[str]) -> None:
    """Empty site/data, except the folders of large layers, which take hours to rebuild."""
    if not data.exists():
        return
    for path in data.iterdir():
        if path.name in keep:
            continue
        if path.is_dir():
            remove_tree(path)
        else:
            path.unlink()


def remove_tree(path: Path) -> None:
    """Delete a folder, including the read-only object files git leaves on Windows."""
    def make_writable_and_retry(function, target, _error):
        os.chmod(target, stat.S_IWRITE)
        function(target)
    shutil.rmtree(path, onexc=make_writable_and_retry)


DATA_FILES = ("catalog.json", "places.json", "studio.json", "calendar.json", "health.json", "release.json")
DATA_FOLDERS = ("places", "outlines")


def kept_folders(data: Path, copy_ids: set[str]) -> list[str]:
    """Folders a release keeps but does not rebuild: hybrid map copies and parked split layers."""
    return sorted(p.name for p in data.iterdir() if p.is_dir() and p.name not in copy_ids and p.name not in DATA_FOLDERS)         if data.exists() else []


def pages_data(data: Path, copy_ids: set[str]) -> list[Path]:
    """The data paths published to GitHub Pages."""
    names = [*DATA_FILES, *DATA_FOLDERS, *sorted(copy_ids)]
    return [data / name for name in names if (data / name).exists()]


def newer_health(local: str | None, live: str | None) -> str | None:
    """The health file to publish: the one checked last. The nightly check commits health.json to gh-pages, and a
    release must not put an older local copy back (found 2026-10-03)."""
    def checked(text):
        try:
            return json.loads(text).get("checked_at") or ""
        except (TypeError, ValueError, AttributeError):
            return None
    if checked(live) is None:
        return local
    if checked(local) is None:
        return live
    return live if checked(live) > checked(local) else local


def live_health() -> str | None:
    """gh-pages' data/health.json, or None when it cannot be read (offline, no remote)."""
    fetched = subprocess.run(["git", "fetch", "-q", "origin", "gh-pages"], cwd=ROOT, capture_output=True, text=True)
    if fetched.returncode != 0:
        return None
    shown = subprocess.run(["git", "show", "FETCH_HEAD:data/health.json"], cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8")
    return shown.stdout if shown.returncode == 0 else None


def refresh_health(data: Path) -> None:
    path = data / "health.json"
    local = path.read_text(encoding="utf-8") if path.exists() else None
    live = live_health()
    keep = newer_health(local, live)
    if keep is not None and keep != local:
        path.write_text(keep, encoding="utf-8", newline="\n")
        print("-> health.json: using the live site's, which is newer", flush=True)
    elif live is None:
        print("-> health.json: the live site's could not be read; keeping the local copy", flush=True)


def prepare_pages(date: str, rehearsal: bool, copy_ids: set[str]) -> None:
    if PAGES.exists():
        remove_tree(PAGES)
    shutil.copytree(ROOT / "site", PAGES, ignore=lambda folder, names: ["data"] if Path(folder) == ROOT / "site" else [])
    data = ROOT / "site" / "data"
    for path in pages_data(data, copy_ids):
        target = PAGES / "data" / path.name
        if path.is_dir():
            shutil.copytree(path, target)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    (PAGES / ".nojekyll").write_text("", encoding="utf-8")
    message = f"NJ-Atlas {'REHEARSAL (not for publishing)' if rehearsal else 'release'} {date}"
    for command in (["git", "init", "-q", "-b", "gh-pages"], ["git", "add", "-A"], ["git", "commit", "-q", "-m", message]):
        if subprocess.run(command, cwd=PAGES).returncode != 0:
            raise ReleaseError(f"Could not prepare build/pages: {' '.join(command)} failed")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build and prepare an NJ-Atlas release")
    parser.add_argument("--rehearsal", action="store_true", help="Include drafts; never offer a push command")
    parser.add_argument("--refresh", action="store_true", help="Download every source again")
    args = parser.parse_args(argv)
    py = sys.executable
    try:
        layers = chosen_layers(args.rehearsal)
        print(f"Layers in this {'rehearsal' if args.rehearsal else 'release'}: {', '.join(sorted(r['id'] for r in layers))}")
        data = ROOT / "site" / "data"
        copy_ids = {r["id"] for r in layers}
        large = kept_folders(data, copy_ids)
        clear_data(data, keep=large + ["health.json"])
        refresh_health(data)
        drafts = ["--include-drafts"] if args.rehearsal else []
        run([py, "-m", "pipeline", "build", "--all", *drafts, *(["--refresh"] if args.refresh else [])], "build every layer")
        run([py, "-m", "pipeline", "catalog", *drafts, "--for-release"], "write catalog.json and places.json")
        run([py, "-m", "pipeline", "check", "--catalog"], "data checks (G1 rules) on the released layers")
        run([py, "tools/lint_text.py"], "plain-language and library lint")
        run([py, "-m", "pytest", "-m", "not network"], "Python tests")
        run([shutil.which("npm") or "npm", "test"], "JavaScript tests")
        catalog = json.loads((data / "catalog.json").read_text(encoding="utf-8"))
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        release = {"date": date, "commit": git_commit(), "rehearsal": args.rehearsal,
                   "layers": [{"id": layer["id"], "rows": layer["rows"], "status": layer["status"]} for layer in catalog["layers"]]}
        (data / "release.json").write_text(json.dumps(release, indent=2) + "\n", encoding="utf-8")
        size = sum(f.stat().st_size for path in pages_data(data, copy_ids)
                   for f in ([path] if path.is_file() else path.rglob("*")) if f.is_file())
        if size > 900 * 1024 * 1024:
            raise ReleaseError(f"The published data is {size / 1e6:.0f} MB; GitHub Pages sites must stay under 900 MB.")
        prepare_pages(date, args.rehearsal, copy_ids)
    except ReleaseError as error:
        print(f"RELEASE: FAIL. {error}")
        return 1
    print(f"Prepared build/pages ({size / 1e6:.0f} MB of data, commit {release['commit']}).")
    if args.rehearsal:
        print("RELEASE: REHEARSAL PASS. Drafts are included, so this must not be published.")
    else:
        if release["commit"].endswith(("-dirty", "uncommitted")):
            print("Warning: the working tree has uncommitted changes; commit before publishing so the release is traceable.")
        print("RELEASE: READY. The owner publishes it with:")
        print('  git -C build/pages push --force <your GitHub repository URL> gh-pages')
    return 0


if __name__ == "__main__":
    sys.exit(main())
