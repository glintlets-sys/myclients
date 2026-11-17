import { Injectable, inject } from '@angular/core';
import { tap } from 'rxjs';
import { ApiService } from '@shared/core/api.service';
import { User } from '@shared/core/models';
import { SessionService } from '@shared/core/session.service';

/** Marketing banner as stored by the API (see docs/API.md "Banner"). */
export interface Banner {
  id?: string;
  title: string;
  subtitle?: string;
  placement: string;
  categoryId?: string | null;
  imageDesktop: string;
  imageMobile?: string | null;
  altText?: string;
  linkType: 'none' | 'product' | 'category' | 'url';
  linkTarget?: string | null;
  ctaLabel?: string;
  sortOrder: number;
  active: boolean;
  startAt?: string | null;
  endAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessRoleRow {
  role: string;
  defaults: string[];
  permissions: string[];
  overridden: boolean;
  editable: boolean;
}

export interface AccessMatrix {
  permissions: string[];
  roles: AccessRoleRow[];
}

/** Signed-in user's own profile (GET /v1/me/profile). */
export interface Profile extends User {
  staff: boolean;
  superAdmin: boolean;
  phoneEditable: boolean;
}

/**
 * Admin endpoints for catalog rules, banners, the access-control matrix and the profile page. Kept apart from
 * ApiService so these features don't touch the shared client.
 */
@Injectable({ providedIn: 'root' })
export class AdminCatalogApi {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  catalogSettings() { return this.api.get<{ hideOutOfStock: boolean }>('/v1/admin/catalog-settings'); }
  saveCatalogSettings(body: { hideOutOfStock: boolean }) { return this.api.put<{ hideOutOfStock: boolean }>('/v1/admin/catalog-settings', body); }

  banners() { return this.api.get<{ banners: Banner[]; placements: string[]; now: string }>('/v1/admin/banners'); }
  createBanner(b: Banner) { return this.api.post<Banner>('/v1/admin/banners', b); }
  updateBanner(id: string, b: Banner) { return this.api.put<Banner>(`/v1/admin/banners/${encodeURIComponent(id)}`, b); }
  deleteBanner(id: string) { return this.api.delete(`/v1/admin/banners/${encodeURIComponent(id)}`); }

  accessControl() { return this.api.get<AccessMatrix>('/v1/admin/access-control'); }
  saveAccessControl(rolePermissions: Record<string, string[]>) {
    return this.api.put<AccessMatrix>('/v1/admin/access-control', { rolePermissions });
  }
  resetAccessControl(role?: string) { return this.api.post<AccessMatrix>('/v1/admin/access-control/reset', role ? { role } : {}); }

  /** Also refreshes the session's user, so the sidebar reflects the current effective permissions. */
  profile() { return this.api.get<Profile>('/v1/me/profile').pipe(tap(p => this.session.updateUser(toUser(p)))); }
  saveProfile(body: { name?: string; email?: string }) {
    return this.api.put<Profile>('/v1/me/profile', body).pipe(tap(p => this.session.updateUser(toUser(p))));
  }
}

function toUser(p: Profile): User {
  const { staff, superAdmin, phoneEditable, ...user } = p;
  return user;
}
