# Cloudflare Pages setup (one-time)

This folder is the Cloudflare edition of the Christmas Tree app.
The Google Apps Script edition stays in the repo root (`Code.gs` + `Index.html`) as a backup.

## Structure
- `index.html` — the whole app (static page)
- `functions/api.js` — Pages Function API (create/get/join/preview), same logic as `Code.gs`
- Database: **Cloudflare KV**, binding name **`TREES`** (one key per tree: `tree_<id>`)

## One-time setup in the Cloudflare dashboard
1. Sign up / log in at dash.cloudflare.com (free plan, no card).
2. **Storage & Databases → KV → Create namespace** named `christmas-trees`.
3. **Workers & Pages → Create → Pages → Connect to Git** → choose the GitHub repo
   `private-group-christmas-tree-quiz`.
   - Production branch: `main`
   - Root directory: `cloudflare`
   - Framework preset: None, Build command: (empty), Build output directory: (default)
4. After the project is created: **Settings → Bindings → Add → KV namespace**
   - Variable name: `TREES`, Namespace: `christmas-trees`, Environment: Production.
5. **Deployments → Retry deployment** (so the binding takes effect).

After that, every push to `main` that touches `cloudflare/` auto-deploys in about a minute.

Live URL format: `https://<project>.pages.dev/`
Trees are opened as `https://<project>.pages.dev/?tree=<id>&invite=<token>` — same as before.
