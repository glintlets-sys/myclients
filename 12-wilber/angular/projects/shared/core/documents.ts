// Printable customer documents (GST invoices, quotations) as returned by the API. Shared by the storefront
// (customer's own invoice, quotation link) and the admin app. All money values are paise.
import { Address } from './models';

export interface GstRow {
  kind: 'ITEM' | 'SHIPPING' | 'COD_FEE';
  productId?: string; variantId?: string; description: string; sku?: string; hsn?: string;
  qty: number; unitPricePaise: number; grossPaise: number; discountPaise: number; taxablePaise: number;
  ratePercent: number; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number; totalPaise: number;
}

export interface InvoiceParty {
  name?: string; legalName?: string; gstin?: string; phone?: string; email?: string; address?: string; state?: string; stateCode?: string;
}

export interface Invoice {
  orderId: string; number: string; financialYear: string; serial: number; invoiceDate: string; issuedAt: string;
  status: 'ISSUED' | 'CANCELLED' | 'RETURNED'; orderDate: string; paymentMethod: string; channel: string;
  seller: InvoiceParty; buyer: InvoiceParty; placeOfSupply?: string; placeOfSupplyCode?: string; intraState: boolean;
  lines: GstRow[]; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number; totalPaise: number;
  amountInWords: string;
}

export interface InvoiceSummary {
  orderId: string; number: string; invoiceDate: string; status: string; buyerName?: string; buyerPhone?: string; buyerGstin?: string;
  placeOfSupply?: string; paymentMethod: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  taxPaise: number; totalPaise: number;
}

export interface InvoiceView { invoice: Invoice; html: string; }

export type QuoteStatus = 'DRAFT' | 'SENT' | 'REVISED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface QuotationLine {
  productId: string; variantId: string; name?: string; variantName?: string; sku?: string; hsn?: string; image?: string; qty: number;
  listPricePaise?: number; unitPricePaise?: number | null; discountType?: 'PERCENT' | 'AMOUNT' | null; discountValue?: number;
  grossPaise?: number; lineDiscountPaise?: number; lineTotalPaise?: number; taxRatePercent?: number; taxPaise?: number;
}

export interface Quotation {
  id: string; number: string; revision: number; displayNumber: string; rootId: string; previousId?: string; revisedToId?: string;
  status: QuoteStatus;
  customer: { userId?: string; name?: string; company?: string; phone?: string; email?: string; gstin?: string };
  address?: Partial<Address>;
  lines: QuotationLine[];
  discountType?: 'PERCENT' | 'AMOUNT' | null; discountValue?: number; shippingOverridePaise?: number | null;
  paymentMethod: 'cod' | 'online';
  grossPaise: number; lineDiscountPaise: number; subtotalPaise: number; discountPaise: number; shippingPaise: number; codFeePaise: number;
  taxPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; pricesIncludeTax: boolean; intraState: boolean; totalPaise: number;
  validUntil?: string; notes?: string; terms?: string; internalNote?: string;
  createdAt: string; updatedAt?: string; sentAt?: string; acceptedAt?: string; acceptedVia?: string; rejectedAt?: string; rejectReason?: string;
  expiredAt?: string; orderId?: string;
  /** Admin responses. */
  link?: string; html?: string; versions?: QuoteSummary[];
  /** Customer view. */
  canRespond?: boolean; onlineGateways?: string[]; store?: { name?: string; supportPhone?: string; supportEmail?: string };
}

export interface QuoteSummary {
  id: string; number: string; revision: number; displayNumber: string; status: QuoteStatus; customerName?: string; company?: string;
  customerPhone?: string; totalPaise: number; lines: number; validUntil?: string; paymentMethod: string; orderId?: string; createdAt: string;
}

