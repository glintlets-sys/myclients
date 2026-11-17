// Local development (npm run start:admin → http://localhost:4400; the SaaS console uses :4300): run the Glint Commerce local server
// (glint-commerce-backend, LocalServer) on :8080. No secrets belong in this file.
// The admin code is tenant-agnostic: only the environment names the tenant, so another tenant reuses the same
// app with its own environment file (see README → "Admin app").
export const environment = {
  production: false,
  /** Glint Commerce API base URL (no trailing slash). */
  apiUrl: 'http://localhost:8080',
  /** Tenant this admin manages (sent as X-Tenant). */
  tenant: 'wilber',
  /** CDN base for published catalog JSON and media. */
  cdnUrl: 'http://localhost:8080/cdn',
  /** The tenant's storefront, for "View site" links. */
  storefrontUrl: 'http://localhost:4200',
  /** Browser-tab icon (the tenant's logo mark) — replaces the default Angular favicon. */
  favicon: 'http://localhost:4200/assets/images/faviconlogo.png',
};
