import { InjectionToken } from '@angular/core';

/**
 * What the shared core needs from the app that hosts it. Each app (storefront, admin) provides its own
 * environment under this token in its app.config, so the shared code never imports an environment file and
 * the same build works for any tenant given a different environment.
 */
export interface GlintEnv {
  production: boolean;
  /** Glint Commerce API base URL (no trailing slash). */
  apiUrl: string;
  /** Tenant id sent as X-Tenant on every API call. */
  tenant: string;
  /** CDN base for published catalog JSON and media. */
  cdnUrl: string;
}

export const GLINT_ENV = new InjectionToken<GlintEnv>('GLINT_ENV');
