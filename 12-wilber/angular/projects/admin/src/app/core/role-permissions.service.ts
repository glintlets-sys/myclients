import { Injectable, inject } from '@angular/core';
import { SessionService } from '@shared/core/session.service';

export interface RoleInfo {
  name: string;
  description: string;
}

/** Staff roles the API accepts. Their default permissions are decided by the server. */
export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'FINANCE_MANAGER', 'ACCOUNTS'] as const;

const ROLE_INFO: Record<string, RoleInfo> = {
  SUPER_ADMIN: { name: 'Super Admin', description: 'Full access to all system features and user management' },
  ADMIN: { name: 'Admin', description: 'Products, pricing, discounts, content and general management' },
  STORE_MANAGER: { name: 'Store Manager', description: 'Operational access for stock, orders and customers' },
  FINANCE_MANAGER: { name: 'Finance Manager', description: 'Financial information, pricing, discounts and tax data' },
  ACCOUNTS: { name: 'Accounts', description: 'Order processing and customer accounts' },
  CUSTOMER: { name: 'Customer', description: 'Storefront customer (no admin access)' },
};

/** Admin section → required server permission. */
const SECTION_PERMISSION: Record<string, string> = {
  dashboard: 'dashboard',
  products: 'products',
  categories: 'categories',
  orders: 'orders',
  stock: 'stock_management',
  'stock-consignment': 'stock_management',
  customers: 'customers',
  blogs: 'blogs',
  recommendations: 'recommendations',
  settings: 'settings',
  'admin-users': 'manage_users',
  banners: 'content_management',
  testimonials: 'content_management',
  'access-control': 'access_control',
  confirmations: 'orders',
  'staff-order': 'orders',
  invoices: 'orders',
  collections: 'orders',
  quotes: 'quotes',
  reports: 'reports',
  audit: 'audit',
  seo: 'products',
};

const FEATURE_PERMISSION: Record<string, string> = {
  add_product: 'products',
  edit_product: 'products',
  delete_product: 'products',
  manage_pricing: 'pricing',
  manage_discounts: 'discounts',
  process_orders: 'orders',
  manage_stock: 'stock_management',
  manage_customers: 'customers',
  manage_blogs: 'blogs',
  manage_recommendations: 'recommendations',
  manage_users: 'manage_users',
  access_settings: 'settings',
  view_tax_info: 'tax_information',
  manage_quotes: 'quotes',
  view_reports: 'reports',
  view_audit: 'audit',
};

/**
 * Admin access checks. Permissions come from the logged-in user's session (issued by the server), so the
 * `userRole` arguments kept for template compatibility are only used for display helpers.
 */
@Injectable({ providedIn: 'root' })
export class RolePermissionsService {
  private readonly session = inject(SessionService);

  getAvailableRoles(): string[] {
    return [...STAFF_ROLES];
  }

  getRoleInfo(role: string): RoleInfo | null {
    return ROLE_INFO[role] ?? null;
  }

  /** True when the current user holds `permission`. */
  hasPermission(_userRole: string, permission: string): boolean {
    return !!permission && this.session.can(permission);
  }

  /** Permissions of the current user (from the server). */
  getRolePermissions(_role?: string): string[] {
    return this.session.user()?.permissions ?? [];
  }

  canAccessSection(_userRole: string, section: string): boolean {
    if (section === 'profile') return this.session.isStaff();
    if (section === 'content') return this.session.can('blogs') || this.session.can('recommendations');
    const required = SECTION_PERMISSION[section];
    return !!required && this.session.can(required);
  }

  getAccessibleSections(_userRole?: string): string[] {
    const all = ['dashboard', 'products', 'categories', 'orders', 'confirmations', 'staff-order', 'quotes', 'invoices', 'collections',
      'seo', 'stock-consignment', 'customers', 'blogs', 'recommendations', 'banners', 'testimonials', 'reports', 'audit', 'settings', 'admin-users',
      'access-control', 'profile'];
    return all.filter(s => this.canAccessSection('', s));
  }

  canAccessFeature(_userRole: string, feature: string): boolean {
    const required = FEATURE_PERMISSION[feature];
    return !!required && this.session.can(required);
  }

  getRoleDisplayName(role: string): string {
    return ROLE_INFO[role]?.name ?? role;
  }

  getRoleDescription(role: string): string {
    return ROLE_INFO[role]?.description ?? '';
  }

  currentRole(): string {
    return this.session.user()?.role ?? '';
  }
}
