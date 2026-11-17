import { Pipe, PipeTransform } from '@angular/core';

/** Formats integer paise as Indian rupees: 118000 → "₹1,180" (decimals only when non-zero). */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(paise: number | null | undefined): string {
    return formatPaise(paise);
  }
}

export function formatPaise(paise: number | null | undefined): string {
  const rupees = (paise ?? 0) / 100;
  const whole = Number.isInteger(rupees);
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
