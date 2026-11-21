# GitHub Pages + Supabase setup (one-time)

This is the current edition of the Christmas Tree app (chosen 2026-11-21 after Cloudflare's
human-verification blocked the automated setup).

## Pieces
- **Frontend:** `docs/index.html` in this repo, served by **GitHub Pages**
  (repo Settings → Pages → Source: Deploy from a branch → `main` / `/docs`).
  Live URL: `https://nehanraiyan123-arch.github.io/private-group-christmas-tree-quiz/`
- **Database + API:** **Supabase** (Postgres). Run `supabase/schema.sql` once in the
  project's SQL Editor. It creates the `trees` table (locked by RLS, no direct access)
  and four public RPC functions (`create_tree`, `get_tree_full`, `join_tree`,
  `get_preview_messages`) that enforce the invite token / passcode rules server-side.
- The frontend talks to Supabase via PostgREST RPC with the project's **anon key**
  (safe to publish: the table itself is not readable, only the guarded functions are).

## One-time steps
1. supabase.com → Sign up/in **with GitHub** → New project `christmas-tree-quiz`,
   region **Northeast Asia (Tokyo)**, set a database password.
2. SQL Editor → paste all of `supabase/schema.sql` → Run (expect "Success").
3. Project Settings → API: copy the **Project URL** and **anon public key** into
   `docs/index.html` (SUPABASE_URL / SUPABASE_ANON_KEY) and push.
4. GitHub repo → Settings → Pages → Branch `main`, folder `/docs` → Save.

After that, updates = push to GitHub; Pages redeploys in about a minute.
