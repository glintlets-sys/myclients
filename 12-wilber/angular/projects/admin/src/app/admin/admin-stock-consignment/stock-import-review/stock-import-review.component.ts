import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/** One stock row from GET /v1/admin/stock (used to pick products for manual lines). */
export interface StockRow {
  productId: string;
  productName: string;
  code?: string;
  variantId: string;
  variantName: string;
  sku?: string;
  pricePaise: number;
  qty: number;
  stockManaged: boolean;
  active: boolean;
}

/** A consignment line while it is being reviewed. Unit cost is edited in rupees and sent as paise. */
export interface DraftLine {
  productId?: string;
  variantId?: string;
  productName?: string;
  variantName?: string;
  sku?: string;
  qty: number;
  unitCost: number;
  /** Import preview result: OK, NO_MATCH, AMBIGUOUS_VARIANT, INVALID_QTY (manual lines: OK). */
  status?: string;
  /** What the spreadsheet row said, for unmatched rows. */
  source?: string;
  variantOptions?: { id: string; name: string }[];
  currentStock?: number;
}

export interface ConsignmentDraft {
  id?: string;
  supplier: { name: string; phone: string; gstin: string; address: string };
  invoiceNumber: string;
  invoiceDate: string;
  invoiceImage?: string;
  /** Rupees in the form. */
  shippingCost: number;
  lines: DraftLine[];
}

export function emptyDraft(): ConsignmentDraft {
  return {
    supplier: { name: '', phone: '', gstin: '', address: '' },
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    shippingCost: 0,
    lines: [],
  };
}

@Component({
  selector: 'app-stock-import-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stock-import-review.component.html',
  styleUrls: ['./stock-import-review.component.scss']
})
export class StockImportReviewComponent implements OnChanges {
  @Input() showModal = false;
  @Input() draft: ConsignmentDraft | null = null;
  @Input() importFileName = '';
  /** Every variant, for the product picker on manual lines. */
  @Input() stockRows: StockRow[] = [];
  @Input() saving = false;

  /** applyNow: also add the quantities to stock right after saving. */
  @Output() confirmImport = new EventEmitter<{ applyNow: boolean }>();
  @Output() cancelImport = new EventEmitter<void>();

  public isEditing = false;
  public validationErrors: Record<string, string> = {};
  public pickerVariantId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['showModal']?.currentValue) {
      this.validationErrors = {};
      this.pickerVariantId = '';
      // Manual entry and edits open straight in edit mode; imports open as a preview.
      this.isEditing = !this.importFileName;
    }
  }

  get title(): string {
    if (this.importFileName) return 'Review Import Data';
    return this.draft?.id ? 'Edit Consignment' : 'New Consignment';
  }

  get okCount(): number {
    return this.draft?.lines.filter(l => this.lineReady(l)).length ?? 0;
  }

  get skippedCount(): number {
    return (this.draft?.lines.length ?? 0) - this.okCount;
  }

  get totalCost(): number {
    return (this.draft?.lines ?? []).filter(l => this.lineReady(l)).reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0);
  }

  lineReady(l: DraftLine): boolean {
    return !!l.productId && !!l.variantId && l.qty > 0;
  }

  statusLabel(l: DraftLine): string {
    if (this.lineReady(l)) return 'Matched';
    switch (l.status) {
      case 'NO_MATCH': return 'No match';
      case 'AMBIGUOUS_VARIANT': return 'Pick variant';
      case 'INVALID_QTY': return 'Invalid qty';
      default: return l.variantId ? 'Invalid qty' : 'Pick product';
    }
  }

  public onConfirm(applyNow: boolean): void {
    if (this.validateData()) this.confirmImport.emit({ applyNow });
  }

  public onCancel(): void {
    this.cancelImport.emit();
  }

  public toggleEdit(): void {
    this.isEditing = !this.isEditing;
  }

  public validateData(): boolean {
    this.validationErrors = {};
    if (!this.draft) {
      this.validationErrors['general'] = 'No data to validate';
      return false;
    }
    if (!this.draft.supplier.name?.trim()) this.validationErrors['dealerName'] = 'Supplier name is required';
    if (this.okCount === 0) this.validationErrors['consignmentItems'] = 'At least one matched line with a quantity is required';
    this.draft.lines.forEach((l, i) => {
      // In manual mode a matched line must have a quantity; imported rows without one are just skipped.
      if (!this.importFileName && l.variantId && !(l.qty > 0)) this.validationErrors[`quantity_${i}`] = 'Quantity must be greater than 0';
      if (l.unitCost < 0) this.validationErrors[`purchasePrice_${i}`] = 'Cost cannot be negative';
    });
    return Object.keys(this.validationErrors).length === 0;
  }

  public isDataValid(): boolean {
    if (!this.draft || !this.draft.supplier.name?.trim() || this.okCount === 0) return false;
    return this.draft.lines.every(l => !(!this.importFileName && l.variantId && !(l.qty > 0)) && !(l.unitCost < 0));
  }

  public hasError(fieldName: string): boolean {
    return !!this.validationErrors[fieldName];
  }

  public getError(fieldName: string): string {
    return this.validationErrors[fieldName] || '';
  }

  public get hasValidationErrors(): boolean {
    return Object.keys(this.validationErrors).length > 0;
  }

  /** Resolves an ambiguous import row to one of the matched product's variants. */
  public chooseVariant(line: DraftLine, variantId: string): void {
    const opt = line.variantOptions?.find(o => o.id === variantId);
    line.variantId = opt?.id;
    line.variantName = opt?.name;
    const row = this.stockRows.find(r => r.variantId === variantId);
    line.currentStock = row?.qty;
    line.sku = row?.sku;
    if (opt) line.status = line.qty > 0 ? 'OK' : 'INVALID_QTY';
  }

  /** Points a line (manual or unmatched) at any variant in the catalogue. */
  public assignVariant(line: DraftLine, variantId: string): void {
    const row = this.stockRows.find(r => r.variantId === variantId);
    if (!row) return;
    line.productId = row.productId;
    line.productName = row.productName;
    line.variantId = row.variantId;
    line.variantName = row.variantName;
    line.sku = row.sku;
    line.currentStock = row.qty;
    line.variantOptions = undefined;
    line.status = line.qty > 0 ? 'OK' : 'INVALID_QTY';
  }

  public removeItem(index: number): void {
    this.draft?.lines.splice(index, 1);
  }

  public addItem(): void {
    if (!this.draft) return;
    const line: DraftLine = { qty: 1, unitCost: 0, status: 'OK' };
    if (this.pickerVariantId) this.assignVariant(line, this.pickerVariantId);
    this.draft.lines.push(line);
    this.pickerVariantId = '';
  }

  variantLabel(r: StockRow): string {
    return `${r.productName} — ${r.variantName}${r.sku ? ' (' + r.sku + ')' : ''}`;
  }

  trackByIndex(i: number): number {
    return i;
  }
}
