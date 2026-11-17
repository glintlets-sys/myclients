import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '@shared/core/session.service';

/** The whole admin app is staff only; the API enforces each permission again on every call. */
export const staffGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.isLoggedIn() && session.isStaff()) return true;
  if (session.isLoggedIn()) {
    // A customer session (e.g. left over in this browser) has no business here.
    session.clear();
    return router.createUrlTree(['/login'], { queryParams: { reason: 'not-staff' } });
  }
  const returnUrl = state.url && state.url !== '/' ? state.url : undefined;
  return router.createUrlTree(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
};

/** Support sessions opened from the platform console carry a synthetic user id. */
export function isSupportUser(user: { id?: string } | null | undefined): boolean {
  return !!user?.id?.startsWith('support-');
}
