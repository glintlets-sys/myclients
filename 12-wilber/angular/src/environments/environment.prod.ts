// Production build. No secrets belong in this file — payment, SMS and shipping credentials live in the
// backend per tenant. Fill apiUrl / cdnUrl from the GlintCommerce-prod stack outputs (ApiUrl, CdnUrl).
export const environment = {
  production: true,
  /** Glint Commerce API base URL (no trailing slash). */
  apiUrl: 'https://8zjj9tidxa.execute-api.ap-south-1.amazonaws.com',
  /** This storefront's tenant id on the platform. */
  tenant: 'wilber-stage',
  /** CDN base for published catalog JSON; the API's /v1/config also reports it. */
  cdnUrl: 'https://dgc9s3tjkcr84.cloudfront.net',
  /** The tenant admin app (projects/admin); /admin on this site redirects there. */
  adminUrl: 'https://wilber-admin.cloudshops.app',

  // for pagination
  tableSize: 10
};
