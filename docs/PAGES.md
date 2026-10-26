# GitHub Pages — deployment and troubleshooting

The live Roptimer website is a static site built from `web/`. It should appear at:

<https://gefrus112.github.io/robloxclinetbooster/>

If GitHub Pages shows the repository README instead of the website, Pages is serving the repository root in legacy mode and cannot find `index.html`. This repository now fixes that in three ways.

---

## 1. Preferred setup — GitHub Actions

`.github/workflows/deploy-pages.yml` builds the site and deploys the `web/` directory with the official Pages actions.

Required repository setting for Actions deployment:

- **Settings → Pages → Build and deployment → Source:** `GitHub Actions`

> **Admin-only one-time switch:** the GitHub token available to automated coding sessions and to `GITHUB_TOKEN` cannot change an existing Pages source from legacy to workflow. A repository admin must make that single Settings change if you want Actions deployments. If it is not changed, the workflow still succeeds: it regenerates and validates the site, then skips deployment, while the root `index.html` fallback fixes legacy `main / /` publishing automatically.

The workflow:

1. Checks out the active branch.
2. Runs `python build_screenshots.py`.
3. Runs `python build_downloads.py` (which calls `build_website.py` and refreshes downloadable docs/packages).
4. Runs `python build_website.py --check`.
5. Checks the current Pages `build_type`.
6. If it is `workflow`, uploads `web/` as the Pages artifact and deploys with `actions/deploy-pages@v4`.
7. If it is `legacy`, skips deployment and relies on the committed root `index.html` fallback.

It runs on pushes to `main` and `arena/ebd36b53-robloxclinetbooster` when website files change, and can also be started manually from the Actions tab.

### Configure with the GitHub CLI

```bash
gh api repos/gefrus112/robloxclinetbooster/pages \
  -X PUT \
  --field build_type=workflow \
  --field source.branch=main \
  --field source.path=/
```

Verify:

```bash
gh api repos/gefrus112/robloxclinetbooster/pages \
  --jq '{status,build_type,html_url,source}'
```

Expected `build_type` is `workflow`.

---

## 2. Legacy branch fallback

If you choose **Deploy from a branch** instead of GitHub Actions, set:

- **Branch:** `main`
- **Folder:** `/` (root)

The generator now creates a real root-level `index.html` and `.nojekyll`, so GitHub Pages serves the site instead of rendering `README.md` as the index. The root `index.html` points assets and downloads at `web/...`, so the same generated site works from the repository root too.

```bash
python3 build_website.py
python3 build_website.py --check
```

Generated fallback files:

```text
index.html              root Pages entry
404.html                root custom 404
.nojekyll               disables Jekyll
web/index.html          primary Pages artifact
web/.nojekyll           disables Jekyll inside the artifact
web/404.html            artifact custom 404
web/site.webmanifest    install metadata
web/robots.txt          crawler metadata
web/sitemap.xml         basic sitemap
```

---

## 3. If the README still appears

Check these in order:

1. **Settings → Pages → Source** is `GitHub Actions`, or legacy source is `main / /`.
2. `.github/workflows/deploy-pages.yml` exists on the branch that Pages uses.
3. The latest Pages workflow run succeeded.
4. `web/index.html` and `index.html` exist.
5. `.nojekyll` and `web/.nojekyll` exist.
6. Hard-refresh the site with `Ctrl/Cmd + Shift + R`.
7. Wait 1–2 minutes for the Pages CDN.
8. Open the site URL directly: <https://gefrus112.github.io/robloxclinetbooster/>.

In GitHub CLI:

```bash
gh run list --workflow deploy-pages.yml --limit 5
gh api repos/gefrus112/robloxclinetbooster/pages/builds/latest \
  --jq '{status,created_at,commit}'
```

---

## 4. Local preview

```bash
python3 build_website.py
python3 build_website.py --check
python3 -m http.server 8000 --directory web
```

Open <http://localhost:8000>.

To test the root fallback exactly:

```bash
python3 -m http.server 8001
```

Open <http://localhost:8001/index.html>. Both should show the same website.

---

## 5. Website generator commands

| Command | Purpose |
| --- | --- |
| `python3 build_website.py` | Generate root and `web/` site files. |
| `python3 build_website.py --check` | Validate placeholders, local links, JSON, manifest, and output files. |
| `python3 build_screenshots.py` | Regenerate the SVG screenshots. |
| `python3 build_downloads.py` | Regenerate the website, docs, source ZIP, Windows package, and macOS packages. |

`build_downloads.py` calls `build_website.py`, so it also refreshes the root Pages fallback.

---

## 6. Custom domain

No custom domain is configured. If you add one later, create `web/CNAME` with the domain, update `SITE_URL` in `build_website.py`, and configure the domain in **Settings → Pages**.
