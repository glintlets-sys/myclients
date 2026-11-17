import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/admin-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SessionService } from '@shared/core/session.service';
import { User } from '@shared/core/models';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { AddEditAdminUserComponent } from './add-edit-admin-user/add-edit-admin-user.component';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, AddEditAdminUserComponent],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly session = inject(SessionService);
  private readonly rolePermissionsService = inject(RolePermissionsService);

  adminUsers: User[] = [];
  selectedUser: User | null = null;
  showAddEditModal = false;
  editMode = false;
  count = 0;
  isLoading = false;
  busyId: string | null = null;
  errorMessage = '';

  ngOnInit() {
    this.loadAdminUsers();
  }

  get currentUserId(): string {
    return this.session.user()?.id ?? '';
  }

  get isSuperAdmin(): boolean {
    return this.session.user()?.role === 'SUPER_ADMIN';
  }

  loadAdminUsers() {
    this.isLoading = true;
    this.errorMessage = '';
    this.api.admin.staff().subscribe({
      next: res => {
        this.adminUsers = res.users ?? [];
        this.count = this.adminUsers.length;
        this.isLoading = false;
      },
      error: err => {
        this.errorMessage = apiErrorMessage(err, 'Failed to load admin users');
        this.adminUsers = [];
        this.count = 0;
        this.isLoading = false;
      }
    });
  }

  /** Only super admins may change another super admin; nobody changes themselves here. */
  canManage(user: User): boolean {
    if (user.id === this.currentUserId) return false;
    return user.role !== 'SUPER_ADMIN' || this.isSuperAdmin;
  }

  openAddUserModal() {
    this.editMode = false;
    this.selectedUser = null;
    this.showAddEditModal = true;
  }

  openEditUserModal(user: User) {
    this.selectedUser = user;
    this.editMode = true;
    this.showAddEditModal = true;
  }

  closeModal() {
    this.showAddEditModal = false;
    this.selectedUser = null;
    this.editMode = false;
  }

  onSaveUser() {
    this.loadAdminUsers();
    this.closeModal();
  }

  toggleBlocked(user: User) {
    const next = user.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
    const label = user.name || user.phone;
    if (next === 'BLOCKED' && !confirm(`Block ${label}? They will be signed out and cannot log in until unblocked.`)) return;
    this.busyId = user.id;
    this.api.admin.setUserStatus(user.id, next).subscribe({
      next: updated => {
        this.busyId = null;
        Object.assign(user, updated);
      },
      error: err => {
        this.busyId = null;
        alert(apiErrorMessage(err, 'Could not update the user status'));
      }
    });
  }

  /** Removing admin privileges turns the account back into a regular customer. */
  deleteUser(user: User) {
    if (!confirm(`Remove admin privileges for ${user.name || user.phone}?`)) return;
    this.busyId = user.id;
    this.api.admin.setStaff({ phone: user.phone, role: 'CUSTOMER' }).subscribe({
      next: () => {
        this.busyId = null;
        this.loadAdminUsers();
      },
      error: err => {
        this.busyId = null;
        alert(apiErrorMessage(err, 'Could not remove admin privileges'));
      }
    });
  }

  roleName(role: string): string {
    return this.rolePermissionsService.getRoleDisplayName(role);
  }

  formatDate(date?: string): string {
    if (!date) return '—';
    const d = new Date(date);
    return isNaN(d.getTime()) ? date : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'SUPER_ADMIN': return 'bg-danger';
      case 'ADMIN': return 'bg-primary';
      case 'STORE_MANAGER': return 'bg-success';
      case 'FINANCE_MANAGER': return 'bg-warning';
      case 'ACCOUNTS': return 'bg-info';
      default: return 'bg-secondary';
    }
  }
}
