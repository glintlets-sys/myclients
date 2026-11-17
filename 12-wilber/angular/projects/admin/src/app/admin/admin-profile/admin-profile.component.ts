import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminCatalogApi, Profile } from '../../core/admin-catalog-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

/** The signed-in staff member's own profile: name and email are editable, the phone is the login id. */
@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-profile.component.html',
  styleUrl: './admin-profile.component.scss'
})
export class AdminProfileComponent implements OnInit {
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly toaster = inject(ToasterService);

  profile: Profile | null = null;
  name = '';
  email = '';
  loading = false;
  saving = false;
  error = '';

  ngOnInit(): void {
    this.loading = true;
    this.catalogApi.profile().subscribe({
      next: p => this.apply(p),
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load your profile');
        this.loading = false;
      }
    });
  }

  private apply(p: Profile): void {
    this.profile = p;
    this.name = p.name ?? '';
    this.email = p.email ?? '';
    this.loading = false;
  }

  /** Up to two letters for the round badge in the header ("System Admin" → "SA"). */
  get initials(): string {
    const words = this.name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return (this.profile?.phone ?? '').slice(-2) || '?';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  get emailInvalid(): boolean {
    const e = this.email.trim();
    return !!e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  }

  /** Put the fields back to what is saved. */
  reset(): void {
    if (!this.profile) return;
    this.name = this.profile.name ?? '';
    this.email = this.profile.email ?? '';
    this.error = '';
  }

  get dirty(): boolean {
    return !!this.profile && (this.name.trim() !== (this.profile.name ?? '') || this.email.trim() !== (this.profile.email ?? ''));
  }

  save(): void {
    const email = this.email.trim();
    if (this.emailInvalid) return;
    this.error = '';
    this.saving = true;
    this.catalogApi.saveProfile({ name: this.name.trim(), email }).subscribe({
      next: p => {
        this.apply(p);
        this.saving = false;
        this.toaster.showToast('Profile saved', ToastType.Success, 2500);
      },
      error: err => {
        this.saving = false;
        this.error = apiErrorMessage(err, 'Could not save your profile');
      }
    });
  }
}
