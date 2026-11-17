import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '@shared/core/session.service';
import { environment } from '../../environments/environment';

/** Customer pages (checkout, account, orders): send guests to login and come back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  if (session.isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Old /admin links (bookmarks, ?section= deep links): the tenant admin is a separate app on its own domain now.
 * Hands the browser over to it, keeping the query string and the fragment (the platform console falls back to
 * <storefrontUrl>/admin#support=<token> when a tenant has no adminUrl; the admin app consumes that fragment).
 */
export const adminRedirectGuard: CanActivateFn = route => {
  const query = new URLSearchParams(route.queryParams as Record<string, string>).toString();
  const fragment = route.fragment ? '#' + route.fragment : '';
  window.location.replace(environment.adminUrl.replace(/\/+$/, '') + '/' + (query ? '?' + query : '') + fragment);
  return false;
};
