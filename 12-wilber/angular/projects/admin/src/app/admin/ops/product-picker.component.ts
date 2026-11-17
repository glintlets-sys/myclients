import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminOpsApi, PickerProduct, PickerVariant } from '../../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';

export interface PickedVariant { product: PickerProduct; variant: PickerVariant; }

/** Searchable list of active products / pack sizes with price and stock; emits the chosen variant. */
@Component({
  selector: 'app-product-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  template: `
  <div class="input-group mb-2">
    <span class="input-group-text"><i class="fas fa-search"></i></span>
    <input class="form-control" [(ngModel)]="q" (ngModelChange)="filter()" placeholder="Search product name, code or SKU">
  </div>
  <div class="picker-list border rounded" style="max-height:280px;overflow:auto">
    <div *ngIf="loading" class="p-3 text-center"><span class="spinner-border spinner-border-sm"></span></div>
    <div *ngFor="let p of shown" class="px-2 py-1 border-bottom">
      <div class="small fw-semibold">{{ p.name }} <span class="text-muted" *ngIf="p.code">· {{ p.code }}</span></div>
      <div class="d-flex flex-wrap gap-1 mt-1">
        <button *ngFor="let v of p.variants" type="button" class="btn btn-sm"
                [class.btn-outline-primary]="!p.stockManaged || (v.stock ?? 0) > 0"
                [class.btn-outline-secondary]="p.stockManaged && (v.stock ?? 0) <= 0"
                (click)="picked.emit({ product: p, variant: v })">
          {{ v.name }} · {{ v.pricePaise | money }}
          <span class="badge ms-1" [class.bg-success]="(v.stock ?? 0) > 5" [class.bg-warning]="(v.stock ?? 0) > 0 && (v.stock ?? 0) <= 5"
                [class.text-dark]="(v.stock ?? 0) > 0 && (v.stock ?? 0) <= 5" [class.bg-danger]="(v.stock ?? 0) <= 0" *ngIf="p.stockManaged">{{ v.stock ?? 0 }}</span>
        </button>
      </div>
    </div>
    <div *ngIf="!loading && !shown.length" class="p-3 text-muted small">No matching products.</div>
  </div>
  `
})
export class ProductPickerComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  @Output() picked = new EventEmitter<PickedVariant>();

  all: PickerProduct[] = [];
  shown: PickerProduct[] = [];
  q = '';
  loading = false;

  ngOnInit(): void { this.reload(); }

  /** Reload prices and stock (call after placing an order). */
  reload(): void {
    this.loading = true;
    this.ops.catalogPicker().subscribe({
      next: r => { this.all = r.products; this.filter(); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  filter(): void {
    const n = this.q.trim().toLowerCase();
    this.shown = (n ? this.all.filter(p => p.name.toLowerCase().includes(n) || (p.code ?? '').toLowerCase().includes(n)
      || p.variants.some(v => (v.sku ?? '').toLowerCase().includes(n))) : this.all).slice(0, 60);
  }

  stockOf(variantId: string): number | undefined {
    for (const p of this.all) {
      const v = p.variants.find(x => x.variantId === variantId);
      if (v) return p.stockManaged ? (v.stock ?? 0) : undefined;
    }
    return undefined;
  }
}
