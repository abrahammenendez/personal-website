# personal-website

My personal website, and a home for small self-contained experiments.

**Live:** [abrahammenendez.com](https://abrahammenendez.com)

[![Release and deploy](https://github.com/abrahammenendez/personal-website/actions/workflows/release-deploy.yaml/badge.svg)](https://github.com/abrahammenendez/personal-website/actions/workflows/release-deploy.yaml)

The site is **static by default**: every route is prerendered to HTML at build
time and served from [Cloudflare](https://www.cloudflare.com/)'s edge. An
experiment that needs a server (an API call, a database, websockets) opts into
that per route, so one experiment can never slow down or break the rest of the
site.

## Tech stack

| Area | Tools |
| --- | --- |
| Framework | [TanStack Start](https://tanstack.com/start) · [React 19](https://react.dev/) (+ [React Compiler](https://react.dev/learn/react-compiler)) |
| Build | [Vite 8](https://vite.dev/) (Rolldown) · [TypeScript 7](https://www.typescriptlang.org/) |
| Styling | [Tailwind 4](https://tailwindcss.com/) · [shadcn/ui](https://ui.shadcn.com/) on [Base UI](https://base-ui.com/) · [lucide](https://lucide.dev/) · [sonner](https://sonner.emilkowal.ski/) |
| Data | [TanStack Query](https://tanstack.com/query) · [Zod](https://zod.dev/) |
| Quality | [Biome](https://biomejs.dev/) · [Vitest](https://vitest.dev/) · [Playwright](https://playwright.dev/) · [Lefthook](https://lefthook.dev/) |
| Platform | [Cloudflare Workers](https://developers.cloudflare.com/workers/) · [GitHub Actions](https://docs.github.com/actions) · [Sentry](https://sentry.io/) · [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) |

## Getting started

Requires [Node](https://nodejs.org/) (version pinned in [`.nvmrc`](./.nvmrc)).

```sh
nvm use          # or install the Node version in .nvmrc
npm ci
npm run dev      # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → prerender → `sitemap.xml` |
| `npm run preview` | Serve the production build locally, via the Cloudflare runtime |
| `npm run check` | Biome lint + format (writes fixes) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (watch) |
| `npm run test:e2e` | Playwright against the built output |

## Layout

```
src/
├── routes/          File-based routes. routeTree.gen.ts is generated.
│   ├── __root.tsx     Root document: <html>/<head>, site-wide meta, JSON-LD, theme script
│   ├── index.tsx      Home
│   └── lab/           The Lab index, plus one route file per experiment
├── lab/             The experiment registry, and one directory per experiment
├── components/      Shared components; ui/ holds vendored shadcn primitives
├── lib/             SEO, theming, Sentry config, security headers
├── worker/          Modules only the Worker entry (server.ts) may import
├── router.tsx       Router factory and typed Register
└── styles.css       Tailwind entry, @theme tokens, colour tokens
```

[`model/`](./model) sits outside `src/`, one directory per experiment that needs a
model: the Python that exports it and generates its test fixtures. It runs by hand.

## How it works

### The registry is the single source of truth

`src/lab/registry.ts` holds one `EXPERIMENTS` array, and that declaration drives
the `/lab` index, each experiment page's `<head>`, and the sitemap. **Adding an
experiment is two edits:**

1. Add an entry to [`src/lab/registry.ts`](./src/lab/registry.ts).
2. Add a route at `src/routes/lab/<slug>.tsx` that renders it.

`src/lab/hello-server/` is a working reference: a server function on the Worker,
Zod validation at the boundary, TanStack Query on the client, and Sentry across
both. Copy its shape: a pure, tested `logic.ts`, an `api.ts` holding the server
functions, and a component that consumes them.

`src/lab/peelr/` is the other end of the range: stem separation running on the
visitor's GPU, so the arithmetic that paid services rent servers for happens in
the tab. Most of it is ordinary signal processing, tested against fixtures generated
by the Python it reimplements, which is the only way a subtly wrong transform
gets caught before it ships as slightly wrong audio. [`model/peelr/`](./model/peelr)
holds that Python, including the export and both fixture generators.

It needs two things from the platform, both consequences of size.

- **The ONNX model is served from R2**, by `src/worker/peelr-model.ts`, because
  Workers cap an individual static asset at 25 MiB and the model is several
  times that. Its URL carries a content hash, so the response can be immutable
  for a year and a new export is simply a new URL.
- **ONNX Runtime's 23 MiB WebAssembly binary is a static asset, not a bundled
  one.** Vite emits a Web Worker's assets into *every* environment, the server
  one included, so making that binary a Vite asset pushes the Worker script past
  Cloudflare's 3 MiB limit. `scripts/copy-ort-assets.mjs` copies it into
  `public/` instead, and `vite.config.ts` picks the ONNX Runtime build that
  loads it from a path rather than inlining a reference to it.

Every static route prerenders whether it is linked or not, so `published: false`
keeps an experiment out of the index while leaving it shareable by link. Biome's
`noRestrictedImports` rejects `@/lab/*/*` deep imports, so each experiment stays
reachable only through its barrel.

### Every route declares its own `<head>`

`__root.tsx` declares only what is page-invariant. Title, description, canonical
and the page-specific OG tags come from each route's own `head()`, via
`buildPageHead` or, for an experiment, `buildExperimentPageHead`.

This is not a style preference. TanStack Router de-duplicates `meta` tags by
`name`/`property` across nested matches, but never `links`, so the root cannot
supply a fallback canonical without every page ending up with two. A route that
forgets its `head()` ships with no canonical instead of a wrong one, and
`e2e/seo.spec.ts` asserts exactly one per page as the guard.

Two related traps the e2e suite also pins down: `og:image` must be absolute, or
link previews break; and the URL a page is *served* at must be the one its
canonical claims, which is why `wrangler.jsonc` sets
`html_handling: "drop-trailing-slash"`. The prerenderer writes
`dist/client/<slug>/index.html`, and Cloudflare's default reads that as "this
page lives at `/<slug>/`".

`sitemap.xml` comes from TanStack Start's built-in generator rather than a
hand-rolled route, which costs one config line but accepts two rough edges:
every URL carries the same build-date `lastmod`, and an index route is listed
twice, as both `/lab` and `/lab/`. Fine at this size; a real content site would
want a custom `sitemap[.]xml` route instead.

### The `light`/`dark` class on `<html>` is the source of truth

`THEME_INIT_SCRIPT` (`src/lib/theme.ts`) runs from `<ScriptOnce>` in `<head>`
before first paint, so there is no flash of the wrong theme. An absent
`localStorage` key means "follow the OS", so no third stored state exists, and
the script's `matchMedia` listener keeps following until the visitor picks a
side.

Consequences before touching it:

- **Prefer the `dark:` variant over reading the scheme in React.**
  `ThemeToggle` renders both glyphs and lets CSS pick one, so the prerendered
  HTML never guesses. `ui/sonner.tsx` is the one exception, because sonner
  needs the value as a prop, and it subscribes via a `MutationObserver` on the
  class.
- **Cookies and server functions are the wrong tool here**, however often
  they're recommended for TanStack Start. Cloudflare serves the prerendered
  files from the edge without invoking the Worker, so per-request theming has no
  request to hook.
- **All base styles live in `@layer base`.** Unlayered declarations beat every
  cascade layer regardless of specificity, so a bare `body {}` rule would
  silently override the `bg-background` utility meant to win.
- **`--muted-foreground` is tuned on APCA `Lc`, not the WCAG 2 ratio**, which
  ignores type size, weight and polarity and flatters light-on-dark. Body copy
  is set in EB Garamond, a light-stroked serif that a bare WCAG pass leaves
  looking washed out.

### Conventions

- **React Compiler is on.** Don't hand-write `useMemo`/`useCallback`/`memo`;
  compute derived values during render.
- **No `useEffect`** for data fetching, derived state, or event responses. It is
  for real external subscriptions with cleanup.
- **`src/components/ui/**` is vendored**, added via the shadcn CLI and
  regenerated on updates. Biome formats but does not lint it. App code
  everywhere else is strictly linted.
- Base UI is not Radix: its `Input` reports changes via `onValueChange(value)`,
  not `onChange(event)`.

> Under Vite 8 / Rolldown, `@vitejs/plugin-react` no longer runs Babel, so the
> React Compiler pass is applied via `@rolldown/plugin-babel`, ordered **before**
> the JSX transform.

## Deployment

Every push to `main` runs the full `verify` pipeline (lint, typecheck, unit and
e2e tests, build), cuts a [semantic-release](https://semver.org/) version from
the [Conventional Commits](https://www.conventionalcommits.org/), and deploys to
Cloudflare Workers. Pushes touching only [`iac/`](./iac) skip all of it, since no
site code changed. There is no staging environment; `main` is production, and
production is deployed only by CI.

`verify.yaml` is a reusable workflow, so the checks gating a merge are exactly
the ones gating a deploy.

Two decisions worth recording:

- **semantic-release is installed in the release job, not as a devDependency.**
  Its plugins need `conventional-commits-filter@^5` while `@commitlint/cli`
  needs `^6`; in one dependency tree npm produces a lockfile `npm ci` rejects.
- **The custom domain is declared in `wrangler.jsonc`**, so the binding is
  versioned with the code and applied by the deploy job.

Cloudflare credentials live in the repository's `prod`
[GitHub Environment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment),
never in the repo. `CLOUDFLARE_API_TOKEN` is a secret; `CLOUDFLARE_ACCOUNT_ID`
is a variable, since it identifies rather than authenticates.

## Infrastructure

- **Domain:** registered at [Namecheap](https://www.namecheap.com/), nameservers
  delegated to [Cloudflare DNS](https://developers.cloudflare.com/dns/). The zone
  contents are declared in [`iac/`](./iac) and applied by
  [OpenTofu](https://opentofu.org/); pushing to `main` applies them the same way
  it deploys the Worker.
- **Hosting:** [Cloudflare Workers](https://developers.cloudflare.com/workers/)
  serves the prerendered assets; the apex is bound as a
  [custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  in [`wrangler.jsonc`](./wrangler.jsonc). `www` → apex via a Cloudflare
  [redirect rule](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/),
  which needs a proxied placeholder DNS record because a Worker custom domain
  only matches its exact hostname.
- **Observability:** [Sentry](https://sentry.io/) for errors on both the client
  and the Worker, and [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)
  (cookieless, so no consent banner).
