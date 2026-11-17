/**
 * Helpers for the server-rendered printable documents (tax invoices, quotations). The HTML comes from the API,
 * is self-contained and escaped server-side; it is shown in a sandboxed-by-origin blank window so the browser's
 * "Print → Save as PDF" produces the PDF. No PDF library is needed.
 */

/** Opens the document in a new window and starts printing. Returns false when pop-ups are blocked. */
export function printHtmlDocument(html: string, autoPrint = true): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  if (autoPrint) {
    // give images (logo) a moment to load before the print dialog
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* window closed */ } }, 700);
  }
  return true;
}

/** Saves the document as an .html file (opens and prints anywhere, offline). */
export function downloadHtmlDocument(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-name friendly form of a document number: INV/26-27/000123 → INV-26-27-000123 */
export function docFileName(number: string, ext = 'html'): string {
  return number.replace(/[\/\s]+/g, '-') + '.' + ext;
}

/** yyyy-MM-dd for <input type="date">, in the browser's (IST for staff) local time. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

export function rupees(paise: number | null | undefined): number {
  return Math.round(paise ?? 0) / 100;
}
