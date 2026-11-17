import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, finalize, map, of, tap } from 'rxjs';
import { ApiService } from '@shared/core/api.service';
import { CartLine, Quote } from '@shared/core/models';
import { SessionService } from '@shared/core/session.service';

const GUEST_KEY = 'glint.cart';

/**
 * One cart for the whole app. Guests keep lines in localStorage and get server-side prices from
 * /v1/cart/quote; logged-in customers use the server cart. The guest cart is merged at login (verifyOtp).
 */
@Injectable({ providedIn: 'root' })
export class CartStoreService {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  readonly lines = signal<CartLine[]>(this.loadGuest());
  readonly quote = signal<Quote | null>(null);
  readonly loading = signal(false);
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));

  constructor() {
    // Reload whenever the login state changes (login merges the guest cart on the server).
    effect(() => {
      const loggedIn = this.session.isLoggedIn();
      untracked(() => {
        if (loggedIn) localStorage.removeItem(GUEST_KEY);
        else this.lines.set(this.loadGuest());
        this.refresh().subscribe();
      });
    });
  }

  /** Guest lines to hand to verifyOtp so they merge into the account cart. */
  guestLines(): CartLine[] {
    return this.session.isLoggedIn() ? [] : this.lines();
  }

  refresh(): Observable<Quote | null> {
    this.loading.set(true);
    const done = <T>() => finalize<T>(() => this.loading.set(false));
    if (this.session.isLoggedIn()) {
      return this.api.cart().pipe(tap(c => {
        this.lines.set(c.items);
        this.quote.set(c.quote);
      }), map(c => c.quote), done<Quote>());
    }
    const lines = this.lines();
    if (!lines.length) {
      this.quote.set(null);
      this.loading.set(false);
      return of(null);
    }
    return this.api.quoteGuestCart(lines).pipe(tap(q => this.quote.set(q)), done<Quote>());
  }

  add(productId: string, variantId: string, qty = 1): Observable<Quote | null> {
    const current = this.lines().find(l => l.variantId === variantId)?.qty ?? 0;
    return this.setQty(productId, variantId, Math.min(99, current + qty));
  }

  setQty(productId: string, variantId: string, qty: number): Observable<Quote | null> {
    if (this.session.isLoggedIn()) {
      return this.api.setCartItem({ productId, variantId, qty }).pipe(tap(c => {
        this.lines.set(c.items);
        this.quote.set(c.quote);
      }), map(c => c.quote));
    }
    const next = this.lines().filter(l => l.variantId !== variantId);
    if (qty > 0) next.push({ productId, variantId, qty });
    this.saveGuest(next);
    return this.refresh();
  }

  remove(productId: string, variantId: string): Observable<Quote | null> {
    return this.setQty(productId, variantId, 0);
  }

  clear(): Observable<Quote | null> {
    if (this.session.isLoggedIn()) {
      return this.api.clearCart().pipe(tap(c => {
        this.lines.set(c.items);
        this.quote.set(c.quote);
      }), map(c => c.quote));
    }
    this.saveGuest([]);
    this.quote.set(null);
    return of(null);
  }

  qtyOf(variantId: string): number {
    return this.lines().find(l => l.variantId === variantId)?.qty ?? 0;
  }

  private saveGuest(lines: CartLine[]): void {
    localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
    this.lines.set(lines);
  }

  private loadGuest(): CartLine[] {
    try {
      return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
    } catch {
      return [];
    }
  }
}
