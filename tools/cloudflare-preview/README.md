# Cloudflare test preview

A test copy of the tool on Cloudflare's free plan, at `https://dads-ooda-preview.dads-ooda.workers.dev`, made when Netlify's free credits ran out (Dad, 17 Oct 2026). It is for looking at a branch before it merges. The live site stays on GitHub Pages.

- [`worker.js`](worker.js) serves each file of a build from Workers KV (Cloudflare's key-value storage) with the right type.
- [`deploy.sh`](deploy.sh) uploads a build's `dist/` to KV, then deploys the Worker. [`wrangler.toml`](wrangler.toml) names the Worker and its KV store.

**To update it:** check out the branch to show, then from the repository root run `npm ci`, `npx vite build --base=/`, then `bash tools/cloudflare-preview/deploy.sh` with `CLOUDFLARE_ACCOUNT_ID` set. The token needs Workers Scripts and Workers KV Storage edit rights.

**Why not Cloudflare Pages:** Pages uploads files with a short-lived pass in the `Authorization` header. A cloud session's network proxy replaces that header with the account token, so Cloudflare refuses the upload (code 8000013, seen 17 Oct 2026). From a normal computer, `npx wrangler@4.147.0 pages deploy dist --project-name dads-ooda-preview` works too, at `dads-ooda-preview.pages.dev`.

**Free plan limits:**
- Workers: 100,000 requests a day for the whole account, the relay included. A first visit asks for about 170 files.
- KV: 100,000 reads and 1,000 writes a day. Each deploy writes every file, about 170, so about 5 deploys a day.

Over a limit, Cloudflare refuses until midnight UTC; nothing is billed.
