import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { AdminApi } from '../../core/admin-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { MoneyPipe } from '@shared/core/money.pipe';
import {
  ConsignmentDraft, DraftLine, StockImportReviewComponent, StockRow, emptyDraft
} from './stock-import-review/stock-import-review.component';

/** A supplier delivery as returned by /v1/admin/consignments. Money in paise. */
export interface Consignment {
  id: string;
  supplier: { name?: string; phone?: string; gstin?: string; address?: string };
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceImage?: string;
  shippingCostPaise: number;
  lines: { productId: string; variantId: string; productName?: string; variantName?: string; sku?: string; qty: number; unitCostPaise: number }[];
  status: 'DRAFT' | 'APPLIED';
  appliedAt?: string;
  appliedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Spreadsheet row sent to /v1/admin/stock/import/preview. */
interface ImportRow { sku?: string; code?: string; name?: string; variant?: string; qty: number; unitCost?: number }

const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  sku: ['sku', 'variant sku'],
  code: ['code', 'product code', 'item code'],
  name: ['name', 'product', 'product name', 'item', 'item name'],
  variant: ['variant', 'variant name', 'variation', 'size'],
  qty: ['qty', 'quantity', 'add qty', 'qty to add', 'received qty', 'received'],
  unitCost: ['unit cost', 'unitcost', 'cost', 'purchase price', 'unit price', 'rate'],
};

@Component({
  selector: 'app-admin-stock-consignment',
  standalone: true,
  imports: [CommonModule, FormsModule, StockImportReviewComponent, MoneyPipe],
  templateUrl: './admin-stock-consignment.component.html',
  styleUrls: ['./admin-stock-consignment.component.scss']
})
export class AdminStockConsignmentComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toasterService = inject(ToasterService);

  public stockConsignments: Consignment[] = [];
  public filteredConsignments: Consignment[] = [];
  public searchConsignment = '';
  public loading = false;
  public currentPage = 1;
  public itemsPerPage = 10;
  public totalItems = 0;
  public Math = Math;
  public busyId: string | null = null;

  // Review / editor modal
  public showImportReview = false;
  public draft: ConsignmentDraft | null = null;
  public importFileName = '';
  public saving = false;
  public stockRows: StockRow[] = [];

  public get pendingCount(): number {
    return this.stockConsignments.filter(c => c.status !== 'APPLIED').length;
  }

  public get activatedCount(): number {
    return this.stockConsignments.filter(c => c.status === 'APPLIED').length;
  }

  public get totalCount(): number {
    return this.stockConsignments.length;
  }

  ngOnInit(): void {
    this.loadStockConsignments();
  }

  public loadStockConsignments(): void {
    this.loading = true;
    this.api.admin.consignments().subscribe({
      next: res => {
        this.stockConsignments = (res.items ?? []) as Consignment[];
        this.filterData(false);
        this.loading = false;
      },
      error: err => {
        this.toasterService.showToast(apiErrorMessage(err, 'Failed to load stock consignments'), ToastType.Error);
        this.loading = false;
        this.stockConsignments = [];
        this.filterData();
      }
    });
  }

  private async loadStockRows(): Promise<void> {
    const res = await firstValueFrom(this.api.admin.stock());
    this.stockRows = (res.items ?? []) as StockRow[];
  }

  public filterData(resetPage = true): void {
    const q = this.searchConsignment.trim().toLowerCase();
    this.filteredConsignments = !q ? [...this.stockConsignments] : this.stockConsignments.filter(c =>
      c.supplier?.name?.toLowerCase().includes(q) ||
      c.invoiceNumber?.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q));
    this.totalItems = this.filteredConsignments.length;
    if (resetPage || this.currentPage > this.totalPages) this.currentPage = 1;
  }

  public get paginatedConsignments(): Consignment[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredConsignments.slice(start, start + this.itemsPerPage);
  }

  public get totalPages(): number {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  public onPageChange(page: number): void {
    this.currentPage = page;
  }

  // ---------- create / edit ----------

  public async addStockConsignment(): Promise<void> {
    try {
      await this.loadStockRows();
    } catch (err) {
      this.toasterService.showToast(apiErrorMessage(err, 'Failed to load products'), ToastType.Error);
      return;
    }
    this.importFileName = '';
    this.draft = emptyDraft();
    this.showImportReview = true;
  }

  public async editStockConsignment(c: Consignment): Promise<void> {
    if (c.status === 'APPLIED') {
      this.toasterService.showToast('Stock has already been added for this consignment', ToastType.Warn);
      return;
    }
    try {
      await this.loadStockRows();
    } catch (err) {
      this.toasterService.showToast(apiErrorMessage(err, 'Failed to load products'), ToastType.Error);
      return;
    }
    const stockOf = new Map(this.stockRows.map(r => [r.variantId, r.qty]));
    this.importFileName = '';
    this.draft = {
      id: c.id,
      supplier: { name: c.supplier?.name ?? '', phone: c.supplier?.phone ?? '', gstin: c.supplier?.gstin ?? '', address: c.supplier?.address ?? '' },
      invoiceNumber: c.invoiceNumber ?? '',
      invoiceDate: c.invoiceDate ?? '',
      invoiceImage: c.invoiceImage,
      shippingCost: (c.shippingCostPaise ?? 0) / 100,
      lines: c.lines.map(l => ({
        productId: l.productId, variantId: l.variantId, productName: l.productName, variantName: l.variantName, sku: l.sku,
        qty: l.qty, unitCost: (l.unitCostPaise ?? 0) / 100, status: 'OK', currentStock: stockOf.get(l.variantId),
      })),
    };
    this.showImportReview = true;
  }

  public deleteStockConsignment(c: Consignment): void {
    if (c.status === 'APPLIED') {
      this.toasterService.showToast('Applied consignments cannot be deleted', ToastType.Warn);
      return;
    }
    if (!confirm('Are you sure you want to delete this consignment?')) return;
    this.busyId = c.id;
    this.api.admin.deleteConsignment(c.id).subscribe({
      next: () => {
        this.busyId = null;
        this.toasterService.showToast('Consignment deleted successfully', ToastType.Success);
        this.loadStockConsignments();
      },
      error: err => {
        this.busyId = null;
        this.toasterService.showToast(apiErrorMessage(err, 'Failed to delete consignment'), ToastType.Error);
      }
    });
  }

  /** Adds the consignment's quantities to stock (exactly once; the server refuses a second apply). */
  public activateStock(c: Consignment): void {
    if (c.status === 'APPLIED') {
      this.toasterService.showToast('Stock has already been added for this consignment', ToastType.Warn);
      return;
    }
    const units = c.lines.reduce((s, l) => s + l.qty, 0);
    if (!confirm(`Add ${units} unit(s) across ${c.lines.length} line(s) to stock? This cannot be undone.`)) return;
    this.busyId = c.id;
    this.api.admin.applyConsignment(c.id).subscribe({
      next: () => {
        this.busyId = null;
        this.toasterService.showToast('Stock added successfully', ToastType.Success);
        this.loadStockConsignments();
      },
      error: err => {
        this.busyId = null;
        this.toasterService.showToast(apiErrorMessage(err, 'Failed to add stock'), ToastType.Error);
      }
    });
  }

  // ---------- export / import ----------

  /** Downloads current stock as a sheet that can be filled in (Qty, Unit Cost) and imported back. */
  public exportStock(): void {
    this.api.admin.stock().subscribe({
      next: res => {
        const rows = (res.items as StockRow[]).map(r => ({
          'SKU': r.sku ?? '',
          'Code': r.code ?? '',
          'Product': r.productName,
          'Variant': r.variantName,
          'Price (₹)': (r.pricePaise ?? 0) / 100,
          'Current Stock': r.qty,
          'Active': r.active ? 'Yes' : 'No',
          'Qty': '',
          'Unit Cost': '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Stock');
        XLSX.writeFile(wb, `stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.toasterService.showToast('Stock exported. Fill in Qty (and Unit Cost) to import a delivery.', ToastType.Success);
      },
      error: err => this.toasterService.showToast(apiErrorMessage(err, 'Failed to export stock data'), ToastType.Error)
    });
  }

  public importStock(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls,.csv';
    fileInput.style.display = 'none';
    fileInput.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      document.body.removeChild(fileInput);
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['xls', 'xlsx', 'csv'].includes(ext)) {
        this.toasterService.showToast('Please select a valid Excel file (.xls or .xlsx)', ToastType.Error);
        return;
      }
      this.importFileName = file.name;
      this.processExcelFile(file);
    };
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  private processExcelFile(file: File): void {
    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const { rows, supplier } = this.parseSheet(sheet);
        if (rows.length === 0) {
          this.toasterService.showToast('No rows with a quantity were found. Use the exported stock sheet and fill in Qty.', ToastType.Warn);
          return;
        }
        await this.loadStockRows();
        const preview = await firstValueFrom(this.api.admin.previewImport(rows));
        const draft = emptyDraft();
        draft.supplier.name = supplier;
        draft.lines = (preview.rows ?? []).map((r: any): DraftLine => ({
          productId: r.productId,
          variantId: r.variantId,
          productName: r.productName,
          variantName: r.variantName,
          sku: r.sku,
          qty: Number(r.qty) || 0,
          unitCost: Number(r.unitCost) || 0,
          status: r.status,
          source: [r.sku, r.code, r.name, r.variant].filter(Boolean).join(' / '),
          variantOptions: r.variantOptions,
          currentStock: r.currentStock,
        }));
        this.draft = draft;
        this.showImportReview = true;
      } catch (err) {
        this.toasterService.showToast(apiErrorMessage(err, 'Error processing Excel file'), ToastType.Error);
      }
    };
    reader.onerror = () => this.toasterService.showToast('Error reading file', ToastType.Error);
    reader.readAsArrayBuffer(file);
  }

  /**
   * Reads a sheet with a header row (SKU / Code / Product / Variant / Qty / Unit Cost, any order, case-insensitive).
   * Also understands the legacy consignment template (labels in col3, values in col4; items: col3 name, col10 qty, col11 cost).
   */
  private parseSheet(sheet: XLSX.WorkSheet): { rows: ImportRow[]; supplier: string } {
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const legacy = raw.some(r => 'col3' in r && 'col10' in r);
    if (legacy) return this.parseLegacy(raw);

    const rows: ImportRow[] = [];
    for (const r of raw) {
      const get = (field: keyof ImportRow): string => {
        for (const [k, v] of Object.entries(r)) {
          if (HEADER_ALIASES[field].includes(k.trim().toLowerCase())) return String(v ?? '').trim();
        }
        return '';
      };
      const qty = Math.round(Number(get('qty')) || 0);
      if (qty === 0) continue;
      const row: ImportRow = { qty };
      const sku = get('sku'), code = get('code'), name = get('name'), variant = get('variant'), cost = get('unitCost');
      if (sku) row.sku = sku;
      if (code) row.code = code;
      if (name) row.name = name;
      if (variant) row.variant = variant;
      if (cost !== '' && !isNaN(Number(cost))) row.unitCost = Number(cost);
      if (row.sku || row.code || row.name) rows.push(row);
    }
    return { rows, supplier: '' };
  }

  private parseLegacy(raw: Record<string, unknown>[]): { rows: ImportRow[]; supplier: string } {
    let supplier = '';
    const rows: ImportRow[] = [];
    for (const r of raw) {
      const label = String(r['col3'] ?? '').trim();
      if (label === 'Dealer name') supplier = String(r['col4'] ?? '').trim();
      const qty = Math.round(Number(r['col10']) || 0);
      if (r['col2'] && qty > 0 && label) {
        const cost = Number(r['col11']);
        rows.push({ name: label, qty, ...(isNaN(cost) ? {} : { unitCost: cost }) });
      }
    }
    return { rows, supplier };
  }

  /** Saves the reviewed draft (create or update) and optionally applies it to stock. */
  public async confirmImport(event: { applyNow: boolean }): Promise<void> {
    const d = this.draft;
    if (!d) return;
    const lines = d.lines
      .filter(l => l.productId && l.variantId && l.qty > 0)
      .map(l => ({ productId: l.productId!, variantId: l.variantId!, qty: Math.round(l.qty), unitCostPaise: Math.round((l.unitCost || 0) * 100) }));
    if (!d.supplier.name.trim() || lines.length === 0) {
      this.toasterService.showToast('A supplier name and at least one matched line are required', ToastType.Warn);
      return;
    }
    const body = {
      supplier: {
        name: d.supplier.name.trim(),
        phone: d.supplier.phone.trim() || null,
        gstin: d.supplier.gstin.trim() || null,
        address: d.supplier.address.trim() || null,
      },
      invoiceNumber: d.invoiceNumber.trim() || null,
      invoiceDate: d.invoiceDate || null,
      invoiceImage: d.invoiceImage || null,
      shippingCostPaise: Math.round((d.shippingCost || 0) * 100),
      lines,
    };
    if (event.applyNow && !confirm(`Save and add ${lines.reduce((s, l) => s + l.qty, 0)} unit(s) to stock now? This cannot be undone.`)) return;
    this.saving = true;
    try {
      const saved = await firstValueFrom(d.id
        ? this.api.admin.updateConsignment(d.id, { id: d.id, ...body })
        : this.api.admin.createConsignment(body)) as Consignment;
      if (event.applyNow) {
        await firstValueFrom(this.api.admin.applyConsignment(saved.id));
        this.toasterService.showToast('Consignment saved and stock added', ToastType.Success);
      } else {
        this.toasterService.showToast('Consignment saved as draft', ToastType.Success);
      }
      this.cancelImportReview();
      this.loadStockConsignments();
    } catch (err) {
      this.toasterService.showToast(apiErrorMessage(err, 'Failed to save consignment'), ToastType.Error);
      this.loadStockConsignments();
    } finally {
      this.saving = false;
    }
  }

  public cancelImportReview(): void {
    this.showImportReview = false;
    this.draft = null;
    this.importFileName = '';
  }

  public getStatusBadgeClass(c: Consignment): string {
    return c.status === 'APPLIED' ? 'badge-success' : 'badge-warning';
  }

  public getStatusText(c: Consignment): string {
    return c.status === 'APPLIED' ? 'Applied' : 'Draft';
  }

  public totalUnits(c: Consignment): number {
    return c.lines.reduce((s, l) => s + l.qty, 0);
  }

  public totalCostPaise(c: Consignment): number {
    return c.lines.reduce((s, l) => s + l.qty * (l.unitCostPaise || 0), 0) + (c.shippingCostPaise || 0);
  }

  public formatDate(date?: string | null): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-IN');
  }
}
