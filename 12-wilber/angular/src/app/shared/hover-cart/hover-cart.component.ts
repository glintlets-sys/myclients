import { Component, HostListener, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CartStoreService } from '../../core/cart-store.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { QuoteLine } from '@shared/core/models';

@Component({
  selector: 'app-hover-cart',
  standalone: true,
  imports: [CommonModule, RouterModule, MoneyPipe],
  templateUrl: './hover-cart.component.html',
  styleUrls: ['./hover-cart.component.scss']
})
export class HoverCartComponent {
  private readonly cart = inject(CartStoreService);

  isOpen = false;

  /** Server-priced lines (the quote); never priced on the client. */
  readonly cartItems = computed<QuoteLine[]>(() => this.cart.quote()?.lines ?? []);
  readonly displayItems = computed(() => this.cartItems().slice(0, 3));
  readonly remainingItemsCount = computed(() => Math.max(0, this.cartItems().length - 3));
  readonly totalItems = this.cart.count;
  readonly subtotalPaise = computed(() => this.cart.quote()?.subtotalPaise ?? 0);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.hover-cart-container')) {
      this.isOpen = false;
    }
  }

  toggleCart(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) this.cart.refresh().subscribe({ error: err => console.error('Cart refresh failed', err) });
  }

  removeItem(line: QuoteLine): void {
    this.cart.remove(line.productId, line.variantId).subscribe({ error: err => console.error('Could not remove item', err) });
  }
}
