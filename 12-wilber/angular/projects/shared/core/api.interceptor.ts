import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { GLINT_ENV } from './glint-env';
import { SessionService } from './session.service';

/**
 * Adds X-Tenant and the bearer token to Glint Commerce API calls only — never to the CDN, gateways or any
 * third party. A 401 from the API ends the local session (the token was revoked or expired).
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(GLINT_ENV);
  if (!req.url.startsWith(env.apiUrl)) return next(req);
  const session = inject(SessionService);
  let headers = req.headers.set('X-Tenant', env.tenant);
  const token = session.token();
  if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  return next(req.clone({ headers })).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && token) session.clear();
      return throwError(() => err);
    })
  );
};

/** Pulls the API's human-readable message out of an HttpErrorResponse. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as HttpErrorResponse;
  if (e?.status === 0) return 'Cannot reach the server. Check your connection.';
  // plain errors thrown in the app (e.g. the S3 image upload in AdminApi.upload) carry their own message
  if (err instanceof Error && err.message) {
    return err.message === 'Failed to fetch' ? `${fallback}: could not reach the image storage` : err.message;
  }
  return e?.error?.message || fallback;
}
