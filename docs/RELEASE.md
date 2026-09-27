# Releasing NJ-Atlas

A release turns the reviewed layers into a static website on GitHub Pages. The agent prepares it and the owner publishes it. This follows DECISIONS.md D-009: data never enters the main branch's history, and each release is a single commit on a `gh-pages` branch.

## One-time setup (owner)

1. **O-4:** create an empty GitHub repository, for example `nj-atlas`, and push the main branch to it.
2. In the repository's **Settings → Pages**, choose "Deploy from a branch", branch `gh-pages`, folder `/ (root)`.
3. **O-1:** choose a code license and add a `LICENSE` file.

## Every release

1. **Owner, licenses (O-3).** For each layer to publish, read the terms at its `source.landing_page` and `license.url`. Then fill in `license.name`, `license.url`, `reviewed_by` and `reviewed_on`, and set `status` to `published`. Counties and municipalities must be published, because the area pickers need them. If any data layer is published, census tracts and block groups must be too, because every data layer's place columns come from them; `release.py` names any that are missing. [LICENSE_REVIEW.md](LICENSE_REVIEW.md) lists the evidence gathered so far.
2. **Agent, rehearsal (optional).** `python tools/release.py --rehearsal` runs the whole process with drafts included. It never offers a push command.
3. **Agent, release.** `python tools/release.py` does the following:
   - clears `site/data/` and rebuilds the published layers (add `--refresh` to download fresh data);
   - writes the catalog and runs every automated check;
   - writes `site/data/release.json`;
   - prepares `build/pages/` as a new repository with one commit.

   It stops at the first failure, with nothing published.
4. **Owner, publish (M6-T3).** Run the printed command:

   ```text
   git -C build/pages push --force <your GitHub repository URL> gh-pages
   ```

   The force push is intended: it replaces the previous release, so old data files don't pile up in history.
5. **Agent, live check (M6-T4).** Run the G6 checks against the Pages URL and record them in PROGRESS.md.

## Large layers on Cloudflare R2 (M7)

Parcels are too big for GitHub Pages, so they live in the owner's R2 bucket (O-6, steps in PARCELS_REVIEW.md).

1. **Agent:** `python -m pipeline fetch nj_parcels` (about 90 minutes), then `python -m pipeline build nj_parcels --include-drafts --jobs 8` (about 25 minutes), then `python -m pipeline check nj_parcels`. The release never rebuilds it.
2. **Agent:** `python tools/r2_manifest.py` writes `build/r2_manifest.csv` and prints an upload command.
3. **Owner:** upload `site/data/nj_parcels/` to the bucket with your own credentials, put the bucket's public URL in `catalog/hosting.json` as `r2_base_url`, and publish the layer after reviewing it (O-3, O-5).
4. **Agent:** the next `tools/release.py` then lists parcels in the catalog, pointing at R2, while `build/pages` still holds only the small layers.

## Limits

- **GitHub Pages:** each file must stay under 100 MB, and the build keeps them under 95 MB; the whole site must stay under 1 GB, and the release stops at 900 MB. Larger layers wait for M7 (Cloudflare R2).
- **Range requests:** GitHub Pages serves them, which PMTiles and Parquet need. G6 manual step 3 checks this on the live site.
