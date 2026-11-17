import { Injectable, computed, signal } from '@angular/core';
import { Session, User } from './models';

const KEY = 'glint.session';

/** The logged-in user and token, persisted in localStorage. Permissions come from the server. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly state = signal<Session | null>(SessionService.load());

  readonly session = this.state.asReadonly();
  readonly user = computed(() => this.state()?.user ?? null);
  readonly isLoggedIn = computed(() => this.state() !== null);
  readonly isStaff = computed(() => !!this.state() && this.state()!.user.role !== 'CUSTOMER');

  token(): string | null {
    return this.state()?.token ?? null;
  }

  can(permission: string): boolean {
    return this.state()?.user.permissions?.includes(permission) ?? false;
  }

  set(session: Session): void {
    localStorage.setItem(KEY, JSON.stringify(session));
    this.state.set(session);
  }

  updateUser(user: User): void {
    const s = this.state();
    if (s) this.set({ ...s, user });
  }

  clear(): void {
    localStorage.removeItem(KEY);
    this.state.set(null);
  }

  private static load(): Session | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as Session;
      return s.expiresAt * 1000 > Date.now() ? s : null;
    } catch {
      return null;
    }
  }
}
