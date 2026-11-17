import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { Category, ProductCard } from '@shared/core/models';
import { CatalogStoreService } from '../../core/catalog-store.service';
import { productPath } from '../../core/seo.service';
import { categoryNames, searchProducts } from '../../core/product-search';

interface SearchSuggestion { name: string; link: string; image?: string; category: string; fromPrice?: number; }
import { HoverCartComponent } from '../hover-cart/hover-cart.component';
import { SessionService } from '@shared/core/session.service';
import { ApiService } from '@shared/core/api.service';
import { CartStoreService } from '../../core/cart-store.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HoverCartComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit {
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly cart = inject(CartStoreService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly catalog = inject(CatalogStoreService);

  isDropdownOpen = false;
  isUserDropdownOpen = false;
  readonly totalItems = this.cart.count;

  get currentUser() { return this.session.user(); }
  get isAdmin(): boolean { return this.session.isStaff(); }
  /** The tenant admin is its own app on its own domain (separate sign-in). */
  readonly adminUrl = environment.adminUrl;

  ngOnInit() {
    this.initializeHeaderEffects();
    this.initializeDropdownHandlers();
    // Mobile: close the hamburger menu after any page change.
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closeMenu());
  }

  // ---------- product search (header) ----------
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('searchPanel') private searchPanel?: ElementRef<HTMLElement>;
  searchOpen = false;
  searchText = '';
  searchReady = false;
  suggestions: SearchSuggestion[] = [];
  totalHits = 0;
  private searchCatalog: ProductCard[] = [];
  private searchCategories: Category[] = [];

  openSearch() {
    this.isMenuOpen = false;
    this.searchOpen = true;
    // Show + focus right now, inside the tap (Angular re-renders a moment later; iPhones refuse focus/keyboard after the tap).
    this.searchPanel?.nativeElement.classList.add('open');
    this.searchInput?.nativeElement.focus();
    if (!this.searchReady) {
      // Catalogue is published as small JSON files and cached by CatalogStoreService, so this loads once per visit.
      combineLatest([this.catalog.products(), this.catalog.categories()]).pipe(take(1)).subscribe({
        next: ([products, categories]) => {
          this.searchCatalog = products;
          this.searchCategories = categories;
          this.searchReady = true;
          this.updateSuggestions();
        },
        error: () => (this.searchReady = true)
      });
    }
  }

  closeSearch() { this.searchOpen = false; }

  updateSuggestions() {
    const hits = searchProducts(this.searchText, this.searchCatalog, this.searchCategories)
      .sort((a, b) => a.name.localeCompare(b.name));
    const names = categoryNames(this.searchCategories);
    this.totalHits = hits.length;
    this.suggestions = hits.slice(0, 6).map(p => ({
      name: p.name,
      link: productPath(p),
      image: p.thumbnail,
      category: p.categoryIds.map(id => names.get(id)).filter(Boolean).join(', '),
      fromPrice: p.minPricePaise > 0 ? p.minPricePaise / 100 : undefined
    }));
  }

  /** Enter / "See all": the full results grid on the category page (it searches every product). */
  submitSearch() {
    const q = this.searchText.trim();
    if (!q) return;
    if (this.totalHits === 1 && this.suggestions.length === 1) {
      this.router.navigateByUrl(this.suggestions[0].link);
    } else {
      this.router.navigate(['/category', 'stone-solutions'], { queryParams: { q } });
    }
    this.closeSearch();
  }

  /** Mobile hamburger menu (collapsed navbar). */
  isMenuOpen = false;
  toggleMenu() { this.isMenuOpen = !this.isMenuOpen; }
  closeMenu() {
    this.isMenuOpen = false;
    this.searchOpen = false;
    this.closeDropdown();
    this.closeUserDropdown();
  }
  /** Tapping a real link in the menu closes it, even if it's the page you're already on.
   *  Dropdown toggles (Products, user name) keep the menu open. */
  onMenuClick(event: Event) {
    const link = (event.target as HTMLElement).closest('a');
    if (!link || link.classList.contains('dropdown-toggle')) return;
    this.isMenuOpen = false;
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
    // Prevent Bootstrap from interfering
    setTimeout(() => {
      const dropdownMenu = document.querySelector('.nav-item.dropdown .dropdown-menu');
      if (dropdownMenu && dropdownMenu.classList) {
        dropdownMenu.classList.toggle('show', this.isDropdownOpen);
      }
    }, 0);
  }

  closeDropdown() {
    this.isDropdownOpen = false;
    // Ensure dropdown is closed
    setTimeout(() => {
      const dropdownMenu = document.querySelector('.nav-item.dropdown .dropdown-menu');
      if (dropdownMenu && dropdownMenu.classList) {
        dropdownMenu.classList.remove('show');
      }
    }, 0);
  }

  toggleUserDropdown() {
    this.isUserDropdownOpen = !this.isUserDropdownOpen;
    // Prevent Bootstrap from interfering
    setTimeout(() => {
      const dropdownMenu = document.querySelector('.user-account .dropdown-menu');
      if (dropdownMenu && dropdownMenu.classList) {
        dropdownMenu.classList.toggle('show', this.isUserDropdownOpen);
      }
    }, 0);
  }

  closeUserDropdown() {
    this.isUserDropdownOpen = false;
    // Ensure dropdown is closed
    setTimeout(() => {
      const dropdownMenu = document.querySelector('.user-account .dropdown-menu');
      if (dropdownMenu && dropdownMenu.classList) {
        dropdownMenu.classList.remove('show');
      }
    }, 0);
  }

  logout(): void {
    const done = () => {
      this.session.clear();
      this.router.navigate(['/']);
    };
    this.api.logout().subscribe({ next: done, error: done });
  }

  navigateToAccount(): void {
    this.router.navigate(['/account']);
  }

  getUserDisplayName(): string {
    const user = this.currentUser;
    if (!user) return 'User';
    if (user.name && user.name.trim() !== '') return user.name;
    if (user.phone && user.phone.length >= 4) return `User ${user.phone.slice(-4)}`;
    return 'User';
  }

  private initializeHeaderEffects() {
    const header = document.querySelector('.main-header');
    if (header && header.setAttribute) {
      window.addEventListener('scroll', () => {
        // Re-check if header still exists before modifying
        const currentHeader = document.querySelector('.main-header');
        if (currentHeader && currentHeader.setAttribute) {
          if (window.pageYOffset > 100) {
            currentHeader.setAttribute('style', 'box-shadow: 0 2px 20px rgba(0,0,0,0.1)');
          } else {
            currentHeader.setAttribute('style', 'box-shadow: 0 2px 15px rgba(0,0,0,0.05)');
          }
        }
      });
    }
  }

  private initializeDropdownHandlers() {
    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const userAccount = document.querySelector('.user-account');
      const productsDropdown = document.querySelector('.nav-item.dropdown');
      
      if (userAccount && !userAccount.contains(target)) {
        this.closeUserDropdown();
      }
      
      if (productsDropdown && !productsDropdown.contains(target)) {
        this.closeDropdown();
      }
    });

    // Prevent Bootstrap from initializing dropdowns
    const dropdownElements = document.querySelectorAll('[data-bs-toggle="dropdown"]');
    dropdownElements.forEach(element => {
      if (element && element.removeAttribute) {
        element.removeAttribute('data-bs-toggle');
      }
    });
  }
}
