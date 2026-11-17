import { Component, Input, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../../core/admin-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SessionService } from '@shared/core/session.service';
import { User } from '@shared/core/models';
import { RolePermissionsService, STAFF_ROLES } from '../../../core/role-permissions.service';

interface RoleOption {
  role: string;
  displayName: string;
  description: string;
}

/** Grants a staff role to a phone number (the account is created if it does not exist yet). */
@Component({
  selector: 'app-add-edit-admin-user',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-edit-admin-user.component.html',
  styleUrl: './add-edit-admin-user.component.scss'
})
export class AddEditAdminUserComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly session = inject(SessionService);
  private readonly rolePermissionsService = inject(RolePermissionsService);

  @Input() editUser: User | null = null;
  @Input() existingAdminUsers: User[] = [];
  @Output() closePopup = new EventEmitter<void>();
  @Output() saveUser = new EventEmitter<void>();

  form = { phone: '', name: '', email: '', role: '' };
  userRoles: RoleOption[] = [];
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    const isSuper = this.session.user()?.role === 'SUPER_ADMIN';
    this.userRoles = STAFF_ROLES
      .filter(r => r !== 'SUPER_ADMIN' || isSuper)
      .map(r => ({
        role: r,
        displayName: this.rolePermissionsService.getRoleDisplayName(r),
        description: this.rolePermissionsService.getRoleDescription(r),
      }));
    if (this.editUser) {
      this.form = {
        phone: this.editUser.phone,
        name: this.editUser.name ?? '',
        email: this.editUser.email ?? '',
        role: this.editUser.role,
      };
    }
  }

  get selectedRoleDescription(): string {
    return this.userRoles.find(r => r.role === this.form.role)?.description ?? '';
  }

  saveUserData() {
    this.errorMessage = '';
    const phone = this.form.phone.replace(/[\s-]/g, '');
    if (!/^(\+?91)?[6-9]\d{9}$/.test(phone)) {
      this.errorMessage = 'Enter a valid 10-digit mobile number.';
      return;
    }
    if (!this.form.role) {
      this.errorMessage = 'Please select a role for the user.';
      return;
    }
    const email = this.form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage = 'Enter a valid email address or leave it blank.';
      return;
    }
    if (!this.editUser && this.existingAdminUsers.some(u => u.phone.endsWith(phone.slice(-10)))) {
      if (!confirm('This number already has staff access. Change their role instead?')) return;
    }
    this.isLoading = true;
    this.api.admin.setStaff({
      phone,
      role: this.form.role,
      name: this.form.name.trim() || undefined,
      email: email || undefined,
    }).subscribe({
      next: () => {
        this.isLoading = false;
        this.saveUser.emit();
      },
      error: err => {
        this.isLoading = false;
        this.errorMessage = apiErrorMessage(err, 'Error updating user role. Please try again.');
      }
    });
  }

  onCancel() {
    this.closePopup.emit();
  }
}
