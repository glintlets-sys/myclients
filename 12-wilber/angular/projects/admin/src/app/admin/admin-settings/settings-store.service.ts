import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/admin-api';

/** The secrets the API accepts; values are write-only (only "configured" flags come back). */
export type SecretKey =
  | 'phonepe.saltKey' | 'razorpay.keySecret' | 'razorpay.webhookSecret' | 'ccavenue.accessCode'
  | 'ccavenue.workingKey' | 'msg91.authKey' | 'shiprocket.email' | 'shiprocket.password';

/**
 * Tenant settings shared by the settings tabs: loaded once from GET /v1/admin/settings, saved per section
 * (the API replaces each section sent and leaves the others unchanged).
 */
@Injectable()
export class SettingsStore {
  private readonly api = inject(AdminApi);

  readonly settings = signal<any | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<any> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const s = await firstValueFrom(this.api.admin.settings());
      this.settings.set(s);
      return s;
    } catch (e) {
      this.error.set('Could not load settings');
      throw e;
    } finally {
      this.loading.set(false);
    }
  }

  /** Returns a deep copy of one section for editing in a form. */
  section<T = any>(name: string): T {
    return structuredClone(this.settings()?.[name] ?? {}) as T;
  }

  isSecretSet(name: SecretKey): boolean {
    return !!this.settings()?.secrets?.[name];
  }

  async save(sections: Record<string, unknown>): Promise<any> {
    const s = await firstValueFrom(this.api.admin.saveSettings(sections));
    this.settings.set(s);
    return s;
  }

  /** Saves only non-empty secret values; returns how many were sent. */
  async saveSecrets(values: Partial<Record<SecretKey, string>>): Promise<number> {
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) if (v && v.trim()) body[k] = v.trim();
    if (!Object.keys(body).length) return 0;
    const s = await firstValueFrom(this.api.admin.saveSecrets(body));
    this.settings.set(s);
    return Object.keys(body).length;
  }
}

/** Rupees (form input) → integer paise. */
export function toPaise(rupees: number | string | null | undefined): number {
  const n = Number(rupees);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Integer paise → rupees for a form input. */
export function toRupees(paise: number | null | undefined): number {
  return (paise ?? 0) / 100;
}

/** "560001, 560002\n560003" → ["560001","560002","560003"] */
export function parseList(text: string | null | undefined): string[] {
  return (text ?? '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
}
