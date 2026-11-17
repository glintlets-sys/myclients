// Local development: run the Glint Commerce local server (glint-commerce-backend, LocalServer) on :8080.
// No secrets belong in this file — payment, SMS and shipping credentials live in the backend per tenant.
export const environment = {
  production: false,
  /** Glint Commerce API base URL (no trailing slash). */
  apiUrl: 'http://localhost:8080',
  /** This storefront's tenant id on the platform. */
  tenant: 'wilber',
  /** CDN base for published catalog JSON; the API's /v1/config also reports it. */
  cdnUrl: 'http://localhost:8080/cdn',
  /** The tenant admin app (projects/admin, `npm run start:admin` on :4400); /admin on this site redirects there. */
  adminUrl: 'http://localhost:4400',

  // for pagination
  tableSize: 10
};
