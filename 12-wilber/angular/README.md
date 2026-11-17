# Wilber storefront + tenant admin (Angular 18)

One Angular workspace, two applications, one shared core:

| Path | What | Project name | Dev URL | Hosted at |
|---|---|---|---|---|
| `src/` | Storefront (customers) | `wilber-angular-app` | http://localhost:4200 | wilber.cloudshops.app (S3 `wibler-angular` + CloudFront `EBUFHWO6SEHTO`) |
| `projects/admin/` | Tenant admin (staff) | `admin` | http://localhost:4400 | wilber-admin.cloudshops.app (`GlintAdminSite-wilber` stack) |
| `projects/shared/` | Used by both: `core/` (ApiService, interceptor, SessionService, models, documents, money pipe, print helper, `GLINT_ENV`), `ui/` (toaster) | — | — | — |

Both apps talk to the Glint Commerce API (`glint-commerce-backend`). Port 4300 is the SaaS console's.

## How sharing works

- Shared code lives once, in `projects/shared`, imported through the `@shared/*` path alias (root `tsconfig.json`),
  e.g. `import { ApiService } from '@shared/core/api.service'`.
- Shared code never imports an environment file. Each app provides its environment under the `GLINT_ENV`
  injection token in its `app.config.ts` (`apiUrl`, `tenant`, `cdnUrl`); `ApiService` and the interceptor read it.
- Admin-only API surface lives in the admin app: `AdminApi` (`projects/admin/src/app/core/admin-api.ts`) extends
  `ApiService` with the `/v1/admin/**` endpoints and media upload; `AdminOpsApi`, `AdminCatalogApi`,
  `RolePermissionsService`, `staffGuard` and the support-session bootstrap are there too.
- The storefront must not import anything from `projects/admin`, and the admin nothing from `src/`.
  Quick check: `grep -rn "projects/admin\|/v1/admin" src/` and, after a build,
  `grep -l "/v1/admin" dist/wilber-angular-app/browser/*.js` should both find nothing.

## Run locally

Start the API first (`glint-commerce-backend`: LocalServer on :8080), then:

```bash
npm install
npm start              # storefront → http://localhost:4200   (same as npm run start:store)
npm run start:admin    # admin      → http://localhost:4400
```

Staff sign in on the admin app's own `/login` (phone OTP); customer numbers are signed out again with a message.
`/admin` on the storefront redirects to the admin app (`environment.adminUrl`, query string kept).

## Build

```bash
npm run build:store    # → dist/wilber-angular-app/browser
npm run build:admin    # → dist/admin/browser
npm run build          # both
```

## Admin app details

- Routes: `/login` (staff OTP sign-in), `/` (admin shell, `staffGuard`; screens switch with `?section=`, e.g.
  `/?section=orders&order=<id>`); `/admin?…` redirects to `/?…`.
- The platform console's "Open admin" opens `<adminUrl>#support=<token>`; `projects/admin/src/main.ts` stores that
  short-lived support session before bootstrap and strips the token from the URL. A "Support session" banner shows
  while the signed-in user id starts with `support-`. The console takes the URL from tenant config `store.adminUrl`
  (`PATCH /v1/platform/tenants/{id}` with `{"adminUrl": "https://wilber-admin.cloudshops.app"}`).
- Environment (`projects/admin/src/environments/`): `apiUrl`, `tenant`, `cdnUrl`, `storefrontUrl` ("View site").
  The admin code names no tenant; the store name comes from `/v1/config`. To host the admin for another tenant, add
  `environment.<tenant>.ts`, a matching build configuration in `angular.json` (fileReplacements), and a site entry in
  the backend's `InfraApp.ADMIN_SITES`.

## Deploy

- Storefront: `tools/deploy-store.sh <aws-profile> [tenant=wilber-stage] [stage=prod]` — builds `wilber-angular-app`,
  syncs `dist/wilber-angular-app/browser` to `wibler-angular` (hashed files kept, no `--delete`: pre-rendered pages
  from the previous publish still reference them), uploads `index.html` (no-cache) **and** the same file to the CDN
  bucket as `seo/<tenant>/_shell.html`, republishes the tenant (`POST /v1/platform/tenants/<tenant>/publish`, key
  from SSM) so every SEO page picks up the new bundle names, then invalidates `EBUFHWO6SEHTO`. Check
  `src/environments/environment.prod.ts` (`tenant`) first.
- Admin: from `glint-commerce-backend`, once the `GlintAdminSite-wilber` stack exists:
  `tools/deploy-admin-site.sh wilber <aws-profile> <path-to-this-repo>` (builds `admin`, syncs to the stack's
  bucket, invalidates its distribution).

## SEO

**URLs** (storefront): `/category/<slug>`, `/product/<slug>`, `/blog/<slug>`, plus `/`, `/stone-solutions`, `/blogs`.
Old links keep working: `/stone-solution/<x>` → route redirect to `/category/<x>` (CloudFront answers it with a
**301** once the SEO routing is applied); `/product/<id>` and `/category/<id>` load the item and replace the URL with
the slug (`replaceUrl`), and their canonical tag points at the slug URL (S3/CloudFront cannot 301 an id without a
lookup table, so canonical + in-app redirect is what Google sees for those). `/home` redirects to `/`.

**Pre-rendered pages**: every catalog publish (backend `SeoPublisher`) writes `seo/<tenant>/<path>/index.html` to the
CDN bucket — this app's own built `index.html` with title, description, canonical, Open Graph/Twitter, JSON-LD and
plain crawler-visible content inside `<app-root>` (Angular clears it on start-up) — plus `sitemap.xml` and
`robots.txt`. `tools/deploy-store.sh` uploads the shell (`seo/<tenant>/_shell.html`) and republishes.

**Serving**: `tools/storefront-seo-cloudfront.sh` (dry run by default; `--apply` to change) adds to `EBUFHWO6SEHTO`:
origin `glint-seo-cdn` (CDN bucket via OAC), cache behaviors for `/product/*`, `/category/*`, `/blog/*`, `/blogs`,
`/stone-solutions`, `/sitemap.xml`, `/robots.txt`, `/stone-solution/*`, the CloudFront Function
`storefront-seo-EBUFHWO6SEHTO` (path → `/seo/<tenant>/…/index.html`; `/` → home page via
`cf.selectRequestOriginById`, skip with `--no-home`; `/stone-solution/x` → 301) and a 403 → `/index.html` (200) error
response so a page that was not pre-rendered still opens the SPA. Everything else is unchanged. The bucket policy
side lives in the backend (`InfraApp.STOREFRONT_DISTRIBUTIONS`, deploy `GlintCommerce-prod`). Order:
CDK deploy → `tools/deploy-store.sh` → `tools/storefront-seo-cloudfront.sh --apply`.

**In the app**: `src/app/core/seo.service.ts` sets title, description, canonical, robots, OG/Twitter and JSON-LD on
every navigation (pages with `data: { seo: 'managed' }` call it once their data is loaded; others get a route title,
private pages `noindex`). Title/description rules are shared with the backend and the admin preview:
`projects/shared/core/seo-rules.ts` ⇄ backend `seo/SeoRules.java` — change both together.

**Admin**: *Products → Publish & SEO* (`?section=seo`): last publish, SEO page count, Publish now, sitemap/robots
links, the issue report from the last publish, per-product/category/blog SEO title + description with a Google-style
preview and counters, and site-wide SEO settings (home/listing titles, share image, on/off). The product, category
and blog editors have the same SEO fields.
