import * as XLSX from 'xlsx';

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

/** Writes one workbook with a sheet per entry (sheet names are trimmed to Excel's 31-character limit). */
export function exportSheets(fileName: string, sheets: { name: string; rows: Record<string, unknown>[] }[]): void {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ '(no data)': '' }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}

/** Paise → rupees number for spreadsheets (keeps two decimals, sums correctly in Excel). */
export function rs(paise: number | null | undefined): number {
  return Math.round(paise ?? 0) / 100;
}

export function paymentMethodLabel(m: string | undefined | null): string {
  switch (m) {
    case 'cod': return 'Cash on delivery';
    case 'offline': return 'Paid offline';
    case 'phonepe': return 'PhonePe';
    case 'razorpay': return 'Razorpay';
    case 'ccavenue': return 'CCAvenue';
    default: return m ?? '';
  }
}

/** "3 h", "2 d" … for queue ages. */
export function ageLabel(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
}
