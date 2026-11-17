import { Component, EventEmitter, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, forkJoin, of, switchMap } from 'rxjs';
import { AdminApi } from '../../core/admin-api';
import { AdminOpsApi, QUOTE_STATUS_LABEL, Quotation, QuotationLine, QuoteStatus, QuoteSummary } from '../../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { docFileName, downloadHtmlDocument, printHtmlDocument } from '@shared/core/print-doc';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { INDIAN_STATES, exportSheets, rs } from './ops-shared';
import { PickedVariant } from './product-picker.component';
import { ProductCardsComponent } from './product-cards.component';

interface EditLine extends QuotationLine { unitRupees: number; discountInput: number; }

/** One row in the "Existing customer" search: from a past quotation or a store account. */
interface CustomerHit { source: 'quote' | 'account'; id: string; ref?: string; name?: string; company?: string; phone?: string; email?: string; }

function blankQuote(): Partial<Quotation> {
  return {
    customer: { name: '', company: '', phone: '', email: '', gstin: '' },
    address: { name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' },
    lines: [], discountType: null, discountValue: 0, shippingOverridePaise: null, paymentMethod: 'cod', notes: '', terms: '', internalNote: '',
  };
}

/** Quotations: list with status filter/search, editor with live server totals, versions and lifecycle actions. */
@Component({
  selector: 'app-admin-quotes',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe, ProductCardsComponent],
  styles: [`
    .qe { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 18px; align-items: start; }
    @media (max-width: 1199px) { .qe { grid-template-columns: 1fr; } }
    .qe-left { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
    /* right pane = customer + cart; stays in view and scrolls on its own when taller than the screen */
    .qe-right { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto; padding-right: 2px; }
    @media (max-width: 1199px) { .qe-right { position: static; max-height: none; overflow: visible; } }
    .qe-customer { margin-bottom: 12px; }
    .qe-customer .qe-summary { flex: 1; min-width: 0; }
    /* existing-customer picker */
    .cp-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
    .cp-tabs button { flex: 1; border: 1px solid #ced4da; background: #fff; border-radius: 8px; padding: 5px 8px; font-size: .82rem; color: #495057; }
    .cp-tabs button.on { border-color: #065baa; background: #eaf2fb; color: #065baa; font-weight: 600; }
    .cp-search { position: relative; }
    .cp-search > i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #8a94a0; font-size: .8rem; }
    .cp-search input { padding-left: 30px; }
    .cp-results { border: 1px solid #e6e9ee; border-radius: 8px; margin-top: 6px; max-height: 260px; overflow-y: auto; }
    .cp-item { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; border: none; border-bottom: 1px solid #f0f2f4; background: #fff; padding: 7px 10px; font-size: .82rem; }
    .cp-item:last-child { border-bottom: none; }
    .cp-item:hover { background: #f4f8fd; }
    .cp-item .cp-main { flex: 1; min-width: 0; }
    .cp-item .cp-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cp-item .cp-sub { color: #6c757d; font-size: .75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cp-tag { flex: 0 0 auto; font-size: .68rem; border-radius: 4px; padding: 1px 6px; background: #f1f3f5; color: #495057; }
    .cp-tag.acc { background: #e7f6ec; color: #1e7b3c; }
    .cp-hint { font-size: .8rem; color: #8a94a0; padding: 8px 2px; }
    .cp-picked { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: #1e7b3c; background: #eef9f1; border-radius: 6px; padding: 5px 8px; margin-bottom: 10px; }
    .cp-picked button { margin-left: auto; border: none; background: none; color: #065baa; font-size: .78rem; padding: 0; }

    .qe-card { background: #fff; border: 1px solid #e6e9ee; border-radius: 12px; }
    .qe-card-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; font-weight: 600; cursor: pointer; user-select: none; }
    .qe-card-head.static { cursor: default; }
    .qe-card-head .fa-chevron-up, .qe-card-head .fa-chevron-down { color: #8a94a0; font-size: .8rem; }
    .qe-card-body { padding: 4px 16px 16px; }
    .qe-summary { font-weight: 400; color: #6c757d; font-size: .85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qe-sub { font-weight: 600; font-size: .85rem; margin-bottom: 6px; }

    .qe-cart { background: #fff; border: 1px solid #c9dbef; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(6, 91, 170, .08); }
    .qe-cart-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: linear-gradient(135deg, #065baa, #054a8a); color: #fff; font-weight: 600; }
    .qe-pill { background: rgba(255,255,255,.2); border-radius: 999px; padding: 1px 9px; font-size: .75rem; font-weight: 500; }
    .qe-lines { max-height: 42vh; overflow-y: auto; }
    .qe-empty { text-align: center; color: #9aa1a9; padding: 28px 12px; font-size: .9rem; }
    .qe-empty i { font-size: 1.8rem; display: block; margin-bottom: 6px; color: #c3cad3; }
    .qe-line { display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #eef0f2; }
    .ql-thumb { flex: 0 0 46px; height: 46px; border: 1px solid #e9ecef; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; }
    .ql-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .ql-thumb i { color: #c3cad3; }
    .ql-main { flex: 1; min-width: 0; }
    .ql-top { display: flex; align-items: flex-start; gap: 6px; }
    .ql-name { flex: 1; font-weight: 600; font-size: .85rem; line-height: 1.25; }
    .ql-variant { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 4px; background: #f1f3f5; color: #495057; font-weight: 400; font-size: .72rem; }
    .ql-remove { border: none; background: none; color: #adb5bd; padding: 0 2px; }
    .ql-remove:hover { color: #dc3545; }
    .ql-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
    .ql-qty { display: inline-flex; border: 1px solid #ced4da; border-radius: 6px; overflow: hidden; }
    .ql-qty button { border: none; background: #f1f5f9; width: 26px; font-weight: 700; color: #065baa; }
    .ql-qty button:disabled { color: #c3cad3; }
    .ql-qty input { width: 46px; border: none; text-align: center; font-size: .85rem; -moz-appearance: textfield; }
    .ql-qty input::-webkit-inner-spin-button, .ql-price input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .ql-x { color: #8a94a0; font-size: .8rem; }
    .ql-price { display: inline-flex; align-items: center; border: 1px solid #ced4da; border-radius: 6px; padding-left: 6px; font-size: .8rem; color: #6c757d; }
    .ql-price input { width: 78px; border: none; padding: 2px 4px; font-size: .85rem; -moz-appearance: textfield; }
    .ql-total { margin-left: auto; font-weight: 700; font-size: .9rem; white-space: nowrap; }
    .ql-meta { font-size: .72rem; color: #8a94a0; margin-top: 4px; }
    .ql-disc { margin-top: 6px; max-width: 220px; }

    .qe-opts { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #eef0f2; }
    .qe-totals { padding: 10px 16px; font-size: .85rem; }
    .qe-totals > div { display: flex; justify-content: space-between; padding: 3px 0; }
    .qe-totals .grand { border-top: 1px solid #e6e9ee; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 1.05rem; }
    .qe-totals .grand small { font-weight: 400; color: #8a94a0; font-size: .72rem; }
    .qe-actions { display: grid; gap: 8px; padding: 0 16px 16px; }
    /* %/₹ picker next to a discount box: wide enough that the arrow doesn't cover the symbol */
    .qe-unit { flex: 0 0 72px !important; width: 72px; max-width: 72px; padding-left: 10px; padding-right: 26px;
               background-position: right 6px center; font-weight: 600; color: #065baa; text-align: center; }
  `],
  template: `
  <!-- ============ LIST ============ -->
  <ng-container *ngIf="!editing">
    <div class="row g-2 align-items-end mb-3">
      <div class="col-auto"><button class="btn btn-primary" (click)="newQuote()"><i class="fas fa-plus me-1"></i>New quotation</button></div>
      <div class="col-auto"><select class="form-select" [(ngModel)]="status" (change)="load()"><option value="">All statuses</option>
        <option *ngFor="let s of statuses" [value]="s">{{ label(s) }}</option></select></div>
      <div class="col"><input class="form-control" [(ngModel)]="q" (ngModelChange)="search$.next()" placeholder="Search number, customer, company, phone"></div>
      <div class="col-auto"><button class="btn btn-outline-primary" (click)="exportList()" [disabled]="!items.length"><i class="fas fa-file-excel me-1"></i>Excel</button></div>
    </div>
    <div *ngIf="error" class="alert alert-danger">{{ error }}</div>
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead><tr><th>Number</th><th>Status</th><th>Customer</th><th>Lines</th><th>Valid until</th><th>Payment</th><th class="text-end">Total</th><th>Order</th></tr></thead>
        <tbody>
          <tr *ngFor="let s of items" (click)="open(s.id)" style="cursor:pointer">
            <td><strong>{{ s.displayNumber }}</strong><br><small class="text-muted">{{ s.createdAt | date:'d MMM y' }}</small></td>
            <td><span [class]="badge(s.status)">{{ label(s.status) }}</span></td>
            <td>{{ s.company || s.customerName }}<br><small class="text-muted">{{ s.company ? s.customerName + ' · ' : '' }}{{ s.customerPhone }}</small></td>
            <td>{{ s.lines }}</td>
            <td>{{ s.validUntil | date:'d MMM y' }}</td>
            <td>{{ s.paymentMethod === 'online' ? 'Online' : 'COD' }}</td>
            <td class="text-end fw-semibold">{{ s.totalPaise | money }}</td>
            <td><code *ngIf="s.orderId">{{ s.orderId }}</code></td>
          </tr>
          <tr *ngIf="!items.length && !loading"><td colspan="8" class="text-center text-muted py-4">No quotations yet.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="text-center" *ngIf="nextCursor"><button class="btn btn-outline-primary" (click)="load(true)">Load more</button></div>
  </ng-container>

  <!-- ============ EDITOR / VIEW ============ -->
  <ng-container *ngIf="editing">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <button class="btn btn-outline-secondary" (click)="close()"><i class="fas fa-arrow-left me-1"></i>All quotations</button>
      <h5 class="mb-0 ms-2">{{ current?.displayNumber || 'New quotation' }}</h5>
      <span *ngIf="current" [class]="badge(current.status)">{{ label(current.status) }}</span>
      <span class="ms-auto"></span>
      <ng-container *ngIf="current">
        <button class="btn btn-sm btn-outline-primary" (click)="print()"><i class="fas fa-print me-1"></i>Print</button>
        <button class="btn btn-sm btn-outline-secondary" (click)="download()"><i class="fas fa-download me-1"></i>Download</button>
        <button class="btn btn-sm btn-outline-secondary" (click)="duplicate()"><i class="fas fa-copy me-1"></i>Duplicate</button>
        <button class="btn btn-sm btn-outline-warning" *ngIf="canRevise()" (click)="revise()"><i class="fas fa-code-branch me-1"></i>Revise</button>
        <button class="btn btn-sm btn-outline-danger" *ngIf="current.status === 'DRAFT'" (click)="remove()"><i class="fas fa-trash me-1"></i>Delete draft</button>
      </ng-container>
    </div>
    <div *ngIf="error" class="alert alert-danger">{{ error }}</div>
    <div *ngIf="current?.orderId" class="alert alert-success py-2">
      Accepted {{ current?.acceptedAt | date:'d MMM y, h:mm a' }} by {{ current?.acceptedVia }} → order
      <a href="javascript:void(0)" (click)="openOrder.emit(current!.orderId!)"><code>{{ current?.orderId }}</code></a>
    </div>
    <div *ngIf="current?.status === 'REJECTED'" class="alert alert-secondary py-2">Rejected {{ current?.rejectedAt | date:'d MMM y' }}{{ current?.rejectReason ? ': ' + current?.rejectReason : '' }}</div>
    <div *ngIf="current?.status === 'REVISED'" class="alert alert-info py-2">Superseded by a newer version <a href="javascript:void(0)" (click)="open(current!.revisedToId!)">open it</a>.</div>

    <div class="qe">
      <!-- ===== LEFT PANE: customer + product cards ===== -->
      <div class="qe-left">
        <div class="qe-card" *ngIf="editable">
          <div class="qe-card-head static"><span><i class="fas fa-th-large me-2 text-primary"></i>Products</span>
            <small class="text-muted ms-2">click a pack size to add it to the quote</small></div>
          <div class="qe-card-body">
            <app-product-cards #cards [inCart]="inCart" (picked)="addLine($event)"></app-product-cards>
          </div>
        </div>

        <div class="qe-card">
          <div class="qe-card-head" (click)="showNotes = !showNotes">
            <span><i class="fas fa-sticky-note me-2 text-primary"></i>Notes &amp; terms</span>
            <span class="qe-summary" *ngIf="!showNotes && (draft.notes || draft.terms || draft.internalNote)">filled</span>
            <i class="fas ms-auto" [class.fa-chevron-up]="showNotes" [class.fa-chevron-down]="!showNotes"></i>
          </div>
          <div class="qe-card-body" *ngIf="showNotes">
            <div class="row g-2">
              <div class="col-md-6"><label class="form-label small">Notes (shown to the customer)</label><textarea class="form-control form-control-sm" rows="3" [(ngModel)]="draft.notes" [disabled]="!editable"></textarea></div>
              <div class="col-md-6"><label class="form-label small">Terms</label><textarea class="form-control form-control-sm" rows="3" [(ngModel)]="draft.terms" [disabled]="!editable"></textarea></div>
              <div class="col-12"><label class="form-label small">Internal note (staff only)</label><input class="form-control form-control-sm" [(ngModel)]="draft.internalNote" [disabled]="!editable"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== RIGHT PANE: quote cart ===== -->
      <div class="qe-right">
        <div class="qe-card qe-customer">
          <div class="qe-card-head" (click)="showCustomer = !showCustomer">
            <span><i class="fas fa-user me-2 text-primary"></i>Customer &amp; delivery</span>
            <span class="qe-summary" *ngIf="!showCustomer">
              {{ draft.customer!.company || draft.customer!.name || 'Not filled yet' }}
              <span *ngIf="draft.customer!.phone"> · {{ draft.customer!.phone }}</span>
              <span *ngIf="draft.address!.city"> · {{ draft.address!.city }}</span>
            </span>
            <i class="fas ms-auto" [class.fa-chevron-up]="showCustomer" [class.fa-chevron-down]="!showCustomer"></i>
          </div>
          <div class="qe-card-body" *ngIf="showCustomer">
            <!-- choose: existing customer (search) or new customer (blank form) -->
            <div class="cp-tabs" *ngIf="editable">
              <button type="button" [class.on]="custMode === 'search'" (click)="startCustomerSearch()"><i class="fas fa-search me-1"></i>Existing customer</button>
              <button type="button" [class.on]="custMode === 'form' && !custPicked" (click)="newCustomer()"><i class="fas fa-user-plus me-1"></i>New customer</button>
            </div>

            <ng-container *ngIf="editable && custMode === 'search'">
              <div class="cp-search">
                <i class="fas fa-search"></i>
                <input class="form-control form-control-sm" [(ngModel)]="custQ" (ngModelChange)="custSearch$.next()" placeholder="Search name, company or mobile" autofocus>
              </div>
              <div class="cp-hint" *ngIf="custQ.trim().length < 2">Type at least 2 letters or digits to find an old customer.</div>
              <div class="cp-hint" *ngIf="custQ.trim().length >= 2 && custLoading"><i class="fas fa-spinner fa-spin me-1"></i>Searching…</div>
              <div class="cp-hint" *ngIf="custQ.trim().length >= 2 && !custLoading && !custResults.length">
                No customer found. <a href="" (click)="$event.preventDefault(); newCustomer(true)">Add as new customer</a>
              </div>
              <div class="cp-results" *ngIf="custResults.length">
                <button type="button" class="cp-item" *ngFor="let r of custResults" (click)="pickCustomer(r)">
                  <span class="cp-main">
                    <div class="cp-name">{{ r.company || r.name || r.phone }}</div>
                    <div class="cp-sub">{{ r.company && r.name ? r.name + ' · ' : '' }}{{ r.phone }}{{ r.email ? ' · ' + r.email : '' }}</div>
                  </span>
                  <span class="cp-tag" [class.acc]="r.source === 'account'">{{ r.source === 'account' ? 'Store account' : 'Quote ' + r.ref }}</span>
                </button>
              </div>
            </ng-container>

            <ng-container *ngIf="!editable || custMode === 'form'">
            <div class="cp-picked" *ngIf="editable && custPicked">
              <i class="fas fa-user-check"></i>Old customer: {{ custPicked }}
              <button type="button" (click)="startCustomerSearch()">Change</button>
            </div>
            <div class="row g-2">
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.customer!.name" [disabled]="!editable" placeholder="Contact name *"></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.customer!.company" [disabled]="!editable" placeholder="Company"></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.customer!.phone" [disabled]="!editable" placeholder="Mobile *" maxlength="14"></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.customer!.email" [disabled]="!editable" placeholder="Email"></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.customer!.gstin" [disabled]="!editable" placeholder="GSTIN (B2B)" maxlength="15"></div>
            </div>
            <div class="qe-sub mt-3">Delivery address <small class="text-muted fw-normal">(state sets the GST type)</small></div>
            <div class="row g-2">
              <div class="col-12"><input class="form-control form-control-sm" [(ngModel)]="draft.address!.line1" [disabled]="!editable" placeholder="Address 1 *"></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.address!.line2" [disabled]="!editable" placeholder="Address 2"></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.address!.landmark" [disabled]="!editable" placeholder="Landmark"></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.address!.city" [disabled]="!editable" placeholder="City *"></div>
              <div class="col-6"><select class="form-select form-select-sm" [(ngModel)]="draft.address!.state" [disabled]="!editable" (change)="recalc()">
                <option value="">State *</option><option *ngFor="let s of states" [value]="s">{{ s }}</option></select></div>
              <div class="col-6"><input class="form-control form-control-sm" [(ngModel)]="draft.address!.pincode" [disabled]="!editable" placeholder="Pincode *" maxlength="6"></div>
            </div>
            </ng-container>
          </div>
        </div>

        <div class="qe-cart">
          <div class="qe-cart-head">
            <span><i class="fas fa-file-invoice me-2"></i>Quote cart</span>
            <span class="qe-pill">{{ lines.length }} {{ lines.length === 1 ? 'item' : 'items' }}</span>
            <span *ngIf="calculating" class="spinner-border spinner-border-sm ms-auto"></span>
          </div>

          <div class="qe-lines">
            <div *ngIf="!lines.length" class="qe-empty">
              <i class="fas fa-cart-plus"></i>
              <div>{{ editable ? 'Add products from the left' : 'No items' }}</div>
            </div>
            <div *ngFor="let l of lines; let i = index" class="qe-line">
              <div class="ql-thumb">
                <img *ngIf="thumbOf(l); else noThumb" [src]="thumbOf(l)" alt="">
                <ng-template #noThumb><i class="fas fa-box"></i></ng-template>
              </div>
              <div class="ql-main">
                <div class="ql-top">
                  <div class="ql-name">{{ l.name }}<span class="ql-variant">{{ l.variantName }}</span></div>
                  <button *ngIf="editable" class="ql-remove" title="Remove" (click)="lines.splice(i, 1); recalc()"><i class="fas fa-times"></i></button>
                </div>
                <div class="ql-row">
                  <div class="ql-qty" *ngIf="editable">
                    <button (click)="step(l, -1)" [disabled]="l.qty <= 1">−</button>
                    <input type="number" min="1" [(ngModel)]="l.qty" (ngModelChange)="recalc()">
                    <button (click)="step(l, 1)">+</button>
                  </div>
                  <span *ngIf="!editable" class="text-muted small">Qty {{ l.qty }}</span>
                  <span class="ql-x">×</span>
                  <div class="ql-price" *ngIf="editable">
                    <span>₹</span><input type="number" min="0" step="0.01" [(ngModel)]="l.unitRupees" (ngModelChange)="recalc()" title="Unit price (edit to negotiate)">
                  </div>
                  <span *ngIf="!editable" class="small">{{ (l.unitPricePaise ?? 0) | money }}</span>
                  <span class="ql-total">{{ (l.lineTotalPaise ?? 0) | money }}</span>
                </div>
                <div class="ql-meta">
                  <span *ngIf="l.listPricePaise !== l.unitPricePaise && l.listPricePaise">list {{ l.listPricePaise | money }} · </span>GST {{ l.taxRatePercent ?? '—' }}%
                  <span *ngIf="stockOf(l) !== undefined" [class.text-danger]="l.qty > (stockOf(l) ?? 0)"> · stock {{ stockOf(l) }}</span>
                  <span *ngIf="l.lineDiscountPaise" class="text-success"> · −{{ l.lineDiscountPaise | money }}</span>
                  <a *ngIf="editable && !discountOpen[l.variantId] && !l.discountInput" href="javascript:void(0)" class="ms-2" (click)="discountOpen[l.variantId] = true">Discount</a>
                </div>
                <div class="ql-disc input-group input-group-sm" *ngIf="editable && (discountOpen[l.variantId] || l.discountInput)">
                  <span class="input-group-text">Discount</span>
                  <input type="number" min="0" class="form-control" [(ngModel)]="l.discountInput" (ngModelChange)="recalc()">
                  <select class="form-select qe-unit" [(ngModel)]="l.discountType" (change)="recalc()">
                    <option [ngValue]="'PERCENT'">%</option><option [ngValue]="'AMOUNT'">₹</option></select>
                </div>
              </div>
            </div>
          </div>

          <div class="qe-opts">
            <div class="row g-2">
              <div class="col-6"><label class="form-label small mb-1">Overall discount</label><div class="input-group input-group-sm">
                <input type="number" min="0" class="form-control" [(ngModel)]="overallInput" [disabled]="!editable" (ngModelChange)="recalc()">
                <select class="form-select qe-unit" [(ngModel)]="draft.discountType" [disabled]="!editable" (change)="recalc()">
                  <option [ngValue]="null">—</option><option [ngValue]="'PERCENT'">%</option><option [ngValue]="'AMOUNT'">₹</option></select></div></div>
              <div class="col-6"><label class="form-label small mb-1">Shipping ₹ <small class="text-muted">(blank = rule)</small></label>
                <input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="shippingInput" [disabled]="!editable" (ngModelChange)="recalc()"></div>
              <div class="col-6"><label class="form-label small mb-1">Payment</label><select class="form-select form-select-sm" [(ngModel)]="draft.paymentMethod" [disabled]="!editable" (change)="recalc()">
                <option value="cod">Cash on delivery</option><option value="online">Online (prepaid)</option></select></div>
              <div class="col-6"><label class="form-label small mb-1">Valid until</label><input type="date" class="form-control form-control-sm" [(ngModel)]="draft.validUntil" [disabled]="!editable"></div>
            </div>
          </div>

          <div class="qe-totals" *ngIf="totals">
            <div><span>Value before discounts</span><span>{{ totals.grossPaise | money }}</span></div>
            <div *ngIf="totals.lineDiscountPaise" class="text-success"><span>Line discounts</span><span>−{{ totals.lineDiscountPaise | money }}</span></div>
            <div *ngIf="totals.discountPaise" class="text-success"><span>Overall discount</span><span>−{{ totals.discountPaise | money }}</span></div>
            <div><span>Shipping</span><span>{{ totals.shippingPaise | money }}</span></div>
            <div *ngIf="totals.codFeePaise"><span>COD fee</span><span>{{ totals.codFeePaise | money }}</span></div>
            <div *ngIf="totals.intraState"><span>CGST + SGST</span><span>{{ totals.cgstPaise + totals.sgstPaise | money }}</span></div>
            <div *ngIf="!totals.intraState"><span>IGST</span><span>{{ totals.igstPaise | money }}</span></div>
            <div class="grand"><span>Total <small *ngIf="totals.pricesIncludeTax">(incl. GST)</small></span><span>{{ totals.totalPaise | money }}</span></div>
          </div>

          <div class="qe-actions" *ngIf="editable">
            <button class="btn btn-primary" (click)="save()" [disabled]="saving"><i class="fas fa-save me-1"></i>Save draft</button>
            <button *ngIf="current" class="btn btn-success" (click)="send()" [disabled]="saving"><i class="fas fa-paper-plane me-1"></i>Save &amp; send to customer</button>
          </div>
        </div>

        <div class="qe-card mt-3" *ngIf="current && current.status === 'SENT'">
          <div class="qe-card-body">
            <div class="qe-sub">Customer link</div>
            <div class="input-group input-group-sm mb-2"><input class="form-control" [value]="current.link" readonly>
              <button class="btn btn-outline-secondary" (click)="copyLink()"><i class="fas fa-copy"></i></button></div>
            <a class="btn btn-sm btn-outline-success" [href]="whatsapp()" target="_blank" rel="noopener"><i class="fab fa-whatsapp me-1"></i>Share on WhatsApp</a>
            <hr>
            <div class="qe-sub">Record the customer's answer</div>
            <div class="row g-2">
              <div class="col-6"><select class="form-select form-select-sm" [(ngModel)]="acceptPay">
                <option value="cod">Cash on delivery</option><option value="offline">Paid offline</option></select></div>
              <div class="col-6" *ngIf="acceptPay === 'offline'"><select class="form-select form-select-sm" [(ngModel)]="acceptMode">
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="cheque">Cheque</option></select></div>
              <div class="col-12" *ngIf="acceptPay === 'offline'"><input class="form-control form-control-sm" [(ngModel)]="acceptRef" placeholder="Payment reference"></div>
              <div class="col-12"><input class="form-control form-control-sm" [(ngModel)]="acceptNote" placeholder="Note, e.g. confirmed on phone with Mr. Rao"></div>
            </div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-sm btn-success" (click)="accept()" [disabled]="saving"><i class="fas fa-check me-1"></i>Mark accepted → create order</button>
              <button class="btn btn-sm btn-outline-danger" (click)="reject()" [disabled]="saving">Mark rejected</button>
            </div>
          </div>
        </div>

        <div class="qe-card mt-3" *ngIf="current?.versions?.length">
          <div class="qe-card-body">
            <div class="qe-sub">Versions</div>
            <div *ngFor="let v of current!.versions" class="d-flex justify-content-between small py-1 border-bottom">
              <a href="javascript:void(0)" (click)="open(v.id)" [class.fw-bold]="v.id === current!.id">v{{ v.revision }}</a>
              <span [class]="badge(v.status)">{{ label(v.status) }}</span><span>{{ v.totalPaise | money }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ng-container>
  `
})
export class AdminQuotesComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly toaster = inject(ToasterService);
  private readonly api = inject(AdminApi);
  @Output() openOrder = new EventEmitter<string>();
  @Input() set openQuoteId(id: string | null | undefined) { if (id) this.open(id); }

  readonly states = INDIAN_STATES;
  readonly statuses = Object.keys(QUOTE_STATUS_LABEL) as QuoteStatus[];
  readonly search$ = new Subject<void>();
  private readonly recalc$ = new Subject<void>();

  // list
  items: QuoteSummary[] = [];
  nextCursor: string | null = null;
  status = '';
  q = '';
  loading = false;
  error = '';

  // editor
  editing = false;
  current: Quotation | null = null;
  draft: Partial<Quotation> = blankQuote();
  lines: EditLine[] = [];
  overallInput = 0;
  shippingInput: number | null = null;
  totals: Quotation | null = null;
  calculating = false;
  saving = false;
  private stock: Record<string, number | undefined> = {};
  acceptPay = 'cod';
  acceptMode = 'cash';
  acceptRef = '';
  acceptNote = '';
  showCustomer = true;
  showNotes = false;
  discountOpen: Record<string, boolean> = {};
  // customer picker: 'search' = find an old customer, 'form' = fields (new customer, picked one, or saved quote)
  custMode: 'search' | 'form' = 'search';
  custQ = '';
  custResults: CustomerHit[] = [];
  custLoading = false;
  custPicked = '';
  readonly custSearch$ = new Subject<void>();
  @ViewChild('cards') cards?: ProductCardsComponent;

  get editable(): boolean { return !this.current || this.current.status === 'DRAFT'; }

  ngOnInit(): void {
    this.search$.pipe(debounceTime(350)).subscribe(() => this.load());
    this.recalc$.pipe(debounceTime(400)).subscribe(() => this.preview());
    this.custSearch$.pipe(debounceTime(300), switchMap(() => this.findCustomers(this.custQ.trim())))
      .subscribe(r => { this.custResults = r; this.custLoading = false; });
    this.load();
  }

  /** Old customers matching q: past quotations (one row per mobile/company) + store accounts. Either source may fail silently. */
  private findCustomers(q: string) {
    if (q.length < 2) return of([] as CustomerHit[]);
    this.custLoading = true;
    const quotes$ = this.ops.quotes({ q, size: 50 }).pipe(catchError(() => of({ items: [] as QuoteSummary[] })));
    const accounts$ = this.api.admin.customers({ q, size: 20 }).pipe(catchError(() => of({ items: [] as any[] })));
    return forkJoin([quotes$, accounts$]).pipe(switchMap(([qs, acc]) => {
      const seen = new Set<string>();
      const out: CustomerHit[] = [];
      const key = (phone?: string, name?: string, company?: string) =>
        (phone || '').replace(/\D/g, '').slice(-10) || ((company || '') + '|' + (name || '')).toLowerCase();
      // newest quote first, so the latest details win
      for (const s of [...qs.items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))) {
        const k = key(s.customerPhone, s.customerName, s.company);
        if (!s.customerName && !s.company && !s.customerPhone || seen.has(k)) continue;
        seen.add(k);
        out.push({ source: 'quote', id: s.id, ref: s.displayNumber, name: s.customerName, company: s.company, phone: s.customerPhone });
      }
      for (const u of acc.items) {
        const k = key(u.phone, u.name);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ source: 'account', id: u.id, name: u.name, phone: u.phone, email: u.email });
      }
      return of(out.slice(0, 30));
    }));
  }

  startCustomerSearch(): void { this.custMode = 'search'; this.custResults = []; this.custQ = ''; }

  /** Blank customer + address form. fromSearch: carry what was typed into name or mobile. */
  newCustomer(fromSearch = false): void {
    const typed = fromSearch ? this.custQ.trim() : '';
    const blank = blankQuote();
    this.draft.customer = { ...blank.customer! };
    this.draft.address = { ...blank.address! };
    if (typed) {
      if (/^[\d\s+]+$/.test(typed)) this.draft.customer.phone = typed.replace(/\D/g, '').slice(-10);
      else this.draft.customer.name = typed;
    }
    this.custPicked = '';
    this.custMode = 'form';
    this.recalc();
  }

  /** Fill the customer card from an old quotation (customer + delivery address) or a store account (+ its default address). */
  pickCustomer(h: CustomerHit): void {
    this.custLoading = true;
    const done = () => { this.custLoading = false; this.custPicked = h.company || h.name || h.phone || ''; this.custMode = 'form'; this.recalc(); };
    const fail = (e: any) => { this.custLoading = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); };
    const blank = blankQuote();
    if (h.source === 'quote') {
      this.ops.quote(h.id).subscribe({
        next: q => {
          this.draft.customer = { ...blank.customer!, ...(q.customer ?? {}) };
          this.draft.address = { ...blank.address!, ...(q.address ?? {}) };
          done();
        },
        error: fail
      });
    } else {
      this.ops.lookupCustomer(h.phone || '').pipe(catchError(() => of(null))).subscribe({
        next: c => {
          this.draft.customer = { ...blank.customer!, name: c?.user?.name ?? h.name ?? '', phone: c?.user?.phone ?? h.phone ?? '', email: c?.user?.email ?? h.email ?? '' };
          const a = c?.addresses?.find(x => x.isDefault) ?? c?.addresses?.[0];
          this.draft.address = a
            ? { ...blank.address!, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? '', landmark: a.landmark ?? '', city: a.city, state: a.state, pincode: a.pincode }
            : { ...blank.address! };
          done();
        },
        error: fail
      });
    }
  }

  label(s: QuoteStatus) { return QUOTE_STATUS_LABEL[s] ?? s; }
  badge(s: QuoteStatus): string {
    return 'badge ' + ({ DRAFT: 'bg-secondary', SENT: 'bg-primary', REVISED: 'bg-light text-dark', ACCEPTED: 'bg-success', REJECTED: 'bg-danger', EXPIRED: 'bg-warning text-dark' }[s] ?? 'bg-secondary');
  }

  load(more = false): void {
    this.loading = true;
    this.error = '';
    this.ops.quotes({ status: this.status, q: this.q.trim(), size: 25, cursor: more ? this.nextCursor : undefined }).subscribe({
      next: r => { this.items = more ? [...this.items, ...r.items] : r.items; this.nextCursor = r.nextCursor ?? null; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e); this.loading = false; }
    });
  }

  newQuote(): void {
    this.current = null;
    this.setDraft(blankQuote() as Quotation);
    this.totals = null;
    this.showCustomer = true;
    this.startCustomerSearch();
    this.custPicked = '';
    this.editing = true;
  }

  open(id: string): void {
    this.error = '';
    this.ops.quote(id).subscribe({
      next: q => { this.current = q; this.setDraft(q); this.totals = q; this.showCustomer = !q.customer?.name;
        this.custPicked = ''; this.custQ = ''; this.custResults = []; this.custMode = q.customer?.name ? 'form' : 'search'; this.editing = true; },
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }

  close(): void { this.editing = false; this.current = null; this.load(); }

  private setDraft(q: Partial<Quotation>): void {
    this.draft = structuredClone({ ...blankQuote(), ...q, customer: { ...blankQuote().customer, ...(q.customer ?? {}) },
      address: { ...blankQuote().address, ...(q.address ?? {}) } });
    this.lines = (q.lines ?? []).map(l => ({ ...l, discountType: l.discountType ?? 'PERCENT',
      unitRupees: (l.unitPricePaise ?? l.listPricePaise ?? 0) / 100,
      discountInput: l.discountType === 'AMOUNT' ? (l.discountValue ?? 0) / 100 : (l.discountValue ?? 0) }));
    this.overallInput = q.discountType === 'AMOUNT' ? (q.discountValue ?? 0) / 100 : (q.discountValue ?? 0);
    this.shippingInput = q.shippingOverridePaise == null ? null : q.shippingOverridePaise / 100;
  }

  addLine(p: PickedVariant): void {
    this.stock[p.variant.variantId] = p.product.stockManaged ? (p.variant.stock ?? 0) : undefined;
    const existing = this.lines.find(l => l.variantId === p.variant.variantId);
    if (existing) existing.qty++;
    else this.lines.push({ productId: p.product.productId, variantId: p.variant.variantId, name: p.product.name, variantName: p.variant.name,
      image: p.product.thumbnail, qty: 1, listPricePaise: p.variant.pricePaise, unitPricePaise: p.variant.pricePaise, unitRupees: p.variant.pricePaise / 100,
      discountType: 'PERCENT', discountValue: 0, discountInput: 0 });
    this.recalc();
  }

  step(l: EditLine, d: number): void {
    l.qty = Math.max(1, (Number(l.qty) || 1) + d);
    this.recalc();
  }

  stockOf(l: EditLine): number | undefined {
    return l.variantId in this.stock ? this.stock[l.variantId] : this.cards?.infoOf(l.variantId)?.stock;
  }

  thumbOf(l: EditLine): string | undefined { return l.image || this.cards?.infoOf(l.variantId)?.thumbnail; }

  /** qty per variant, for the "in quote" badges on the product cards */
  get inCart(): Record<string, number> {
    const m: Record<string, number> = {};
    for (const l of this.lines) m[l.variantId] = (m[l.variantId] ?? 0) + (Number(l.qty) || 0);
    return m;
  }

  recalc(): void { this.recalc$.next(); }

  /** Body for the API: only editable fields, money in paise. */
  private body(): Partial<Quotation> {
    const d = this.draft;
    const c = d.customer!;
    return {
      customer: { name: c.name?.trim(), company: c.company?.trim() || undefined, phone: c.phone?.trim() || undefined, email: c.email?.trim() || undefined,
        gstin: c.gstin?.trim() || undefined },
      address: { ...d.address, name: d.address?.name || c.name, phone: d.address?.phone || c.phone },
      lines: this.lines.map(l => ({ productId: l.productId, variantId: l.variantId, qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
        unitPricePaise: Math.round(Number(l.unitRupees) * 100), discountType: Number(l.discountInput) > 0 ? l.discountType : null,
        discountValue: l.discountType === 'AMOUNT' ? Math.round(Number(l.discountInput) * 100) : Number(l.discountInput) || 0 })),
      discountType: Number(this.overallInput) > 0 ? d.discountType : null,
      discountValue: d.discountType === 'AMOUNT' ? Math.round(Number(this.overallInput) * 100) : Number(this.overallInput) || 0,
      shippingOverridePaise: this.shippingInput === null || (this.shippingInput as any) === '' ? null : Math.round(Number(this.shippingInput) * 100),
      paymentMethod: d.paymentMethod, validUntil: d.validUntil || undefined, notes: d.notes, terms: d.terms, internalNote: d.internalNote,
    };
  }

  private preview(): void {
    if (!this.editable) return;
    this.calculating = true;
    this.ops.previewQuote(this.body()).subscribe({
      next: q => {
        this.calculating = false;
        this.totals = q;
        this.error = '';
        q.lines.forEach((sl, i) => { if (this.lines[i]) Object.assign(this.lines[i], { lineTotalPaise: sl.lineTotalPaise, lineDiscountPaise: sl.lineDiscountPaise,
          taxRatePercent: sl.taxRatePercent, listPricePaise: sl.listPricePaise }); });
      },
      error: e => { this.calculating = false; this.error = apiErrorMessage(e); }
    });
  }

  save(then?: () => void): void {
    this.saving = true;
    const req = this.current ? this.ops.updateQuote(this.current.id, this.body()) : this.ops.createQuote(this.body());
    req.subscribe({
      next: q => {
        this.saving = false;
        this.current = q; this.setDraft(q); this.totals = q;
        if (then) then(); else this.toaster.showToast('Saved ' + q.displayNumber, ToastType.Success);
      },
      error: e => { this.saving = false; this.error = apiErrorMessage(e); }
    });
  }

  send(): void {
    if (!window.confirm('Send this quotation to the customer by SMS / email? It cannot be edited afterwards (revise instead).')) return;
    this.save(() => {
      this.saving = true;
      this.ops.sendQuote(this.current!.id).subscribe({
        next: q => { this.saving = false; this.current = q; this.setDraft(q); this.toaster.showToast('Sent to ' + q.customer.phone, ToastType.Success); },
        error: e => { this.saving = false; this.error = apiErrorMessage(e); }
      });
    });
  }

  canRevise(): boolean { return !!this.current && ['SENT', 'REJECTED', 'EXPIRED'].includes(this.current.status); }

  revise(): void {
    this.act(this.ops.reviseQuote(this.current!.id), 'New version created');
  }
  duplicate(): void { this.act(this.ops.duplicateQuote(this.current!.id), 'Copied to a new quotation'); }

  private act(req: ReturnType<AdminOpsApi['reviseQuote']>, msg: string): void {
    this.saving = true;
    req.subscribe({
      next: q => { this.saving = false; this.current = q; this.setDraft(q); this.totals = q; this.toaster.showToast(msg, ToastType.Success); },
      error: e => { this.saving = false; this.error = apiErrorMessage(e); }
    });
  }

  remove(): void {
    if (!this.current || !window.confirm('Delete this draft?')) return;
    this.ops.deleteQuote(this.current.id).subscribe({
      next: () => { this.toaster.showToast('Draft deleted', ToastType.Success); this.close(); },
      error: e => (this.error = apiErrorMessage(e))
    });
  }

  accept(): void {
    if (!this.current || !window.confirm('Create the order now from this quotation (stock will be reserved)?')) return;
    this.saving = true;
    this.ops.acceptQuote(this.current.id, { paymentMethod: this.acceptPay, mode: this.acceptPay === 'offline' ? this.acceptMode : undefined,
      reference: this.acceptRef || undefined, note: this.acceptNote || undefined }).subscribe({
      next: r => { this.saving = false; this.current = r.quote; this.toaster.showToast('Order ' + r.order.id + ' created', ToastType.Success, 4000); },
      error: e => { this.saving = false; this.error = apiErrorMessage(e); }
    });
  }

  reject(): void {
    const reason = window.prompt('Reason (optional)') ?? undefined;
    this.ops.rejectQuote(this.current!.id, reason).subscribe({
      next: q => { this.current = q; this.toaster.showToast('Marked rejected', ToastType.Info); },
      error: e => (this.error = apiErrorMessage(e))
    });
  }

  print(): void {
    if (this.current?.html && !printHtmlDocument(this.current.html)) this.toaster.showToast('Allow pop-ups to print', ToastType.Warn, 4000);
  }
  download(): void { if (this.current?.html) downloadHtmlDocument(this.current.html, docFileName(this.current.displayNumber)); }

  copyLink(): void {
    navigator.clipboard?.writeText(this.current?.link ?? '').then(() => this.toaster.showToast('Link copied', ToastType.Info));
  }

  whatsapp(): string {
    const q = this.current!;
    const text = `Quotation ${q.displayNumber} for ${(q.totalPaise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}: ${q.link}`;
    return 'https://wa.me/91' + (q.customer.phone ?? '') + '?text=' + encodeURIComponent(text);
  }

  exportList(): void {
    exportSheets('quotations.xlsx', [{ name: 'Quotations', rows: this.items.map(s => ({
      Number: s.displayNumber, Status: this.label(s.status), Date: s.createdAt.slice(0, 10), Customer: s.customerName ?? '', Company: s.company ?? '',
      Phone: s.customerPhone ?? '', Lines: s.lines, 'Valid Until': s.validUntil ?? '', Payment: s.paymentMethod, Total: rs(s.totalPaise), Order: s.orderId ?? '',
    })) }]);
  }
}
