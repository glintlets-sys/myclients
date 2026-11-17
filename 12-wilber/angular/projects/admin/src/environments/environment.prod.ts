// Production build for the Wilber tenant admin (wilber-admin.cloudshops.app). No secrets belong in this file.
// apiUrl / cdnUrl come from the GlintCommerce-prod stack outputs (ApiUrl, CdnUrl).
export const environment = {
  production: true,
  /** Glint Commerce API base URL (no trailing slash). */
  apiUrl: 'https://8zjj9tidxa.execute-api.ap-south-1.amazonaws.com',
  /** Tenant this admin manages (sent as X-Tenant). Switch to wilber-prod together with the storefront. */
  tenant: 'wilber-stage',
  /** CDN base for published catalog JSON and media. */
  cdnUrl: 'https://dgc9s3tjkcr84.cloudfront.net',
  /** The tenant's storefront, for "View site" links. */
  storefrontUrl: 'https://wilber.cloudshops.app',
  /** Browser-tab icon (the tenant's logo mark) — replaces the default Angular favicon. */
  favicon: 'https://wilber.cloudshops.app/assets/images/faviconlogo.png',
};
