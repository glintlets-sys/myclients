import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AccessMatrix, AccessRoleRow, AdminCatalogApi } from '../../core/admin-catalog-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

const PERMISSION_LABEL: Record<string, { label: string; hint: string }> = {
  dashboard: { label: 'Dashboard', hint: 'Open the admin panel and see the overview' },
  manage_users: { label: 'Manage staff', hint: 'Add staff and change their roles' },
  products: { label: 'Products', hint: 'Add/edit products, prices, publishing' },
  categories: { label: 'Categories', hint: 'Add/edit categories' },
  pricing: { label: 'Pricing', hint: 'Pricing information' },
  discounts: { label: 'Coupons', hint: 'Create and edit coupons' },
  orders: { label: 'Orders', hint: 'View and process orders' },
  stock_management: { label: 'Stock', hint: 'Update stock levels' },
  customers: { label: 'Customers', hint: 'Customer list and enquiries' },
  content_management: { label: 'Marketing', hint: 'Banners and marketing content' },
  blogs: { label: 'Blogs', hint: 'Write and publish blog posts' },
  recommendations: { label: 'Recommendations', hint: 'Related / bought-together products' },
  settings: { label: 'Settings', hint: 'Store, payments, shipping, SMS, email' },
  access_control: { label: 'Access control', hint: 'Edit this permission matrix' },
  tax_information: { label: 'Tax information', hint: 'GST / tax reports' },
};

/**
 * Role × permission matrix (permission "access_control"). The server stores per-store overrides, applies them on
 * every request and refuses edits that would lock out the owner or escalate the editor's own access.
 */
@Component({
  selector: 'app-admin-access-control',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-access-control.component.html',
  styleUrl: './admin-access-control.component.scss'
})
export class AdminAccessControlComponent implements OnInit {
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly roles = inject(RolePermissionsService);
  private readonly toaster = inject(ToasterService);

  matrix: AccessMatrix | null = null;
  /** role → permissions being edited */
  draft: Record<string, Set<string>> = {};
  loading = false;
  saving = false;
  error = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.catalogApi.accessControl().subscribe({
      next: m => this.apply(m),
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load access control');
        this.loading = false;
      }
    });
  }

  private apply(m: AccessMatrix): void {
    this.matrix = m;
    this.draft = {};
    for (const r of m.roles) this.draft[r.role] = new Set(r.permissions);
    this.loading = false;
  }

  label(p: string): string { return PERMISSION_LABEL[p]?.label ?? p; }
  hint(p: string): string { return PERMISSION_LABEL[p]?.hint ?? ''; }
  roleName(r: string): string { return this.roles.getRoleDisplayName(r); }

  has(row: AccessRoleRow, p: string): boolean {
    return this.draft[row.role]?.has(p) ?? false;
  }

  isDefault(row: AccessRoleRow, p: string): boolean {
    return row.defaults.includes(p);
  }

  toggle(row: AccessRoleRow, p: string): void {
    if (!row.editable) return;
    const set = this.draft[row.role];
    if (set.has(p)) set.delete(p);
    else set.add(p);
  }

  changed(row: AccessRoleRow): boolean {
    const set = this.draft[row.role];
    return !!set && (set.size !== row.permissions.length || row.permissions.some(p => !set.has(p)));
  }

  get dirtyRoles(): AccessRoleRow[] {
    return (this.matrix?.roles ?? []).filter(r => r.editable && this.changed(r));
  }

  get editableRoles(): AccessRoleRow[] {
    return (this.matrix?.roles ?? []).filter(r => r.editable);
  }

  async save(): Promise<void> {
    const dirty = this.dirtyRoles;
    if (!dirty.length) return;
    const body: Record<string, string[]> = {};
    for (const r of dirty) body[r.role] = [...this.draft[r.role]];
    if (dirty.some(r => !this.draft[r.role].has('dashboard'))
      && !confirm('Roles without "Dashboard" cannot open the admin panel at all. Save anyway?')) return;
    this.saving = true;
    try {
      this.apply(await firstValueFrom(this.catalogApi.saveAccessControl(body)));
      this.toaster.showToast('Access updated. It applies to staff right away.', ToastType.Success, 3500);
      this.catalogApi.profile().subscribe({ error: () => {} });
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Could not save access control'), ToastType.Error, 5000);
    } finally {
      this.saving = false;
    }
  }

  async reset(role?: string): Promise<void> {
    if (!confirm(role ? `Reset ${this.roleName(role)} to its default permissions?` : 'Reset every role to its default permissions?')) return;
    this.saving = true;
    try {
      this.apply(await firstValueFrom(this.catalogApi.resetAccessControl(role)));
      this.toaster.showToast('Defaults restored', ToastType.Success, 3000);
      this.catalogApi.profile().subscribe({ error: () => {} });
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Could not reset'), ToastType.Error, 5000);
    } finally {
      this.saving = false;
    }
  }

  discard(): void {
    if (this.matrix) this.apply(this.matrix);
  }
}
