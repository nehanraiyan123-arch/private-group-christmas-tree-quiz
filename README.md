# 🎄 グループ限定 3D＆2Dクイズ＆性格診断クリスマスツリー

**Private Group 3D & 2D Quiz & Personality Christmas Tree**

A mobile-first Christmas tree web app built as a **Google Apps Script Web App**
(`Code.gs` + `Index.html`). It runs **100% free** — Google's built-in
**PropertiesService** is the database, so there are no external servers to pay for.

## Features

1. **Private group-only security** — Every tree gets a unique room ID plus a
   24-character cryptographic invite token (`?tree=ID&invite=TOKEN`), with an
   optional group passcode（合言葉, stored SHA-256 hashed). No token = no entry.
   Pages are `noindex, nofollow`. One tap copies a ready-to-paste LINE invite.
2. **Customizable question count** — Creators start with 5 editable Japanese
   multiple-choice questions and can add/remove to use **3–15 questions**.
3. **Real participants only** — Every tree starts at **0 participants and
   0 ornaments**. No dummy, sample, or NPC users are ever generated.
4. **Live 3D / 2D switcher** — 3D mode (Three.js: tiered pine on a snowy island,
   starry sky, falling snow, twinkling lights, glowing star, touch orbit,
   tap-to-inspect ornaments) and 2D mode (illustrated tree with a glowing cabin
   and falling snow, smooth inside LINE's in-app browser). v2 loads the 2D tree
   instantly and preloads 3D in the background.
5. **Quiz + personality diagnosis + dual numbering** — Friends join with a
   nickname, answer the host's questions, pick an ornament shape/color, and
   leave a secret message. They earn a Japanese Christmas personality title
   scaled to their score %, a permanent join number (**No.1, No.2…**), and a
   ranking (**1位, 2位…**). Higher scorers sit closer to the top star.
6. **December 25, 2026 (JST) secret unlock** — Messages stay sealed until
   **2026-12-25 00:00 JST**. A host-only 🔒 12/25プレビュー toggle previews the
   unlocked card view.

## Deploy (free, ~2 minutes)

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Paste `Code.gs` into the editor (replace the default `myFunction` stub).
3. Add an HTML file named **`Index`** and paste `Index.html` into it.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Open the web app URL, create your tree, and copy the invite link to your
   LINE group.

> **Updating:** after pasting new code, use **Deploy → Manage deployments →
> Edit → Version: New version → Deploy**, otherwise the old version keeps
> being served at the same URL.

Existing trees, invite links, and participants survive updates — the storage
format is unchanged.

## Files

| File | What it is |
|---|---|
| `Code.gs` | Server side: routing, invite/passcode security, PropertiesService storage, scoring, personality titles, unlock logic |
| `Index.html` | The whole mobile app: creator form, 3D (Three.js) + 2D (SVG) trees, quiz flow, ranking drawer |
