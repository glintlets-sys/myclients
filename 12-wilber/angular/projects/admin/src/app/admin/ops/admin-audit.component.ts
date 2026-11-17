import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminOpsApi, AuditEntry } from '../../core/admin-ops-api';
import { AdminApi } from '../../core/admin-api';
import { User } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';

/** Who changed what: every admin mutation, newest first (kept 400 days; secrets are never recorded). */
@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="row g-2 align-items-end mb-3">
    <div class="col-md-3"><label class="form-label small">Staff member</label>
      <select class="form-select" [(ngModel)]="actor" (change)="load()"><option value="">Everyone</option>
        <option *ngFor="let u of staff" [value]="u.id">{{ u.name || u.phone }} ({{ u.role }})</option></select></div>
    <div class="col-md-2"><label class="form-label small">Entity type</label>
      <select class="form-select" [(ngModel)]="entityType"><option value="">Any</option>
        <option *ngFor="let t of entityTypes" [value]="t">{{ t }}</option></select></div>
    <div class="col-md-2"><label class="form-label small">Entity id</label><input class="form-control" [(ngModel)]="entityId" placeholder="e.g. order id" (keyup.enter)="load()"></div>
    <div class="col-md-3"><label class="form-label small">Contains</label><input class="form-control" [(ngModel)]="q" placeholder="text search" (keyup.enter)="load()"></div>
    <div class="col-md-2"><button class="btn btn-primary w-100" (click)="load()"><i class="fas fa-search me-1"></i>Search</button></div>
  </div>
  <div *ngIf="error" class="alert alert-danger">{{ error }}</div>
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle small">
      <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th><th>Result</th><th>IP</th></tr></thead>
      <tbody>
        <tr *ngFor="let e of items">
          <td class="text-nowrap">{{ e.at | date:'d MMM y, HH:mm:ss' }}</td>
          <td>{{ e.actorName || '—' }}<br><span class="text-muted">{{ e.actorPhone }} · {{ e.role }}</span></td>
          <td><span class="badge" [class.bg-primary]="e.method === 'POST'" [class.bg-warning]="e.method === 'PUT' || e.method === 'PATCH'"
                [class.text-dark]="e.method === 'PUT' || e.method === 'PATCH'" [class.bg-danger]="e.method === 'DELETE'">{{ e.method }}</span>
            <code class="ms-1">{{ e.route.replace('/v1/admin', '') }}</code></td>
          <td>{{ e.entityType }}<br><code *ngIf="e.entityId">{{ e.entityId }}</code></td>
          <td style="max-width:360px;word-break:break-word">{{ e.summary }}</td>
          <td><span class="badge" [class.bg-success]="e.status < 400" [class.bg-danger]="e.status >= 400">{{ e.status }}</span>
            <div *ngIf="e.error" class="text-danger">{{ e.error }}</div></td>
          <td>{{ e.ip }}</td>
        </tr>
        <tr *ngIf="!items.length && !loading"><td colspan="7" class="text-center text-muted py-4">No entries.</td></tr>
      </tbody>
    </table>
  </div>
  <div class="text-center" *ngIf="nextCursor"><button class="btn btn-outline-primary" (click)="load(true)" [disabled]="loading">Load more</button></div>
  `
})
export class AdminAuditComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly api = inject(AdminApi);
  readonly entityTypes = ['orders', 'products', 'stock', 'categories', 'customers', 'users', 'settings', 'coupons', 'blogs', 'quotes',
    'staff-orders', 'confirmations', 'collections', 'consignments', 'media', 'publish'];

  items: AuditEntry[] = [];
  staff: User[] = [];
  nextCursor: string | null = null;
  actor = '';
  entityType = '';
  entityId = '';
  q = '';
  loading = false;
  error = '';

  ngOnInit(): void {
    this.api.admin.staff().subscribe({ next: r => (this.staff = r.users), error: () => {} });
    this.load();
  }

  load(more = false): void {
    this.loading = true;
    this.error = '';
    const filters = this.actor ? { actor: this.actor } : this.entityType && this.entityId.trim() ? { entityType: this.entityType, entityId: this.entityId.trim() } : {};
    this.ops.audit({ ...filters, q: this.q.trim() || (this.entityType && !this.entityId.trim() ? this.entityType : undefined), size: 50,
      cursor: more ? this.nextCursor : undefined }).subscribe({
      next: r => { this.items = more ? [...this.items, ...r.items] : r.items; this.nextCursor = r.nextCursor ?? null; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e); this.loading = false; }
    });
  }
}
