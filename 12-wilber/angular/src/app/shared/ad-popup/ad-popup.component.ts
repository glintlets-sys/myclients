import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CatalogStoreService } from '../../core/catalog-store.service';
import { PublishedBanner } from '@shared/core/models';

/**
 * Advertisement "flash card" popup. Shows the first active banner published to the
 * `home-popup` placement (admin → Marketing → Banners) ~5s after the page loads — a
 * promo / discount card the customer sees before browsing. If the viewer closes it,
 * the dismissal is remembered in localStorage keyed by the banner id, so THAT ad is
 * not shown again, but a NEW campaign (different id) will show once. Renders nothing
 * when no popup banner is published, so it is always safe to mount.
 */
@Component({
  selector: 'app-ad-popup',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ad-popup.component.html',
  styleUrl: './ad-popup.component.scss',
})
export class AdPopupComponent implements OnInit, OnDestroy {
  private readonly catalog = inject(CatalogStoreService);
  private static readonly DISMISS_PREFIX = 'wilber.adPopup.dismissed.';
  private static readonly DELAY_MS = 5000;

  banner?: PublishedBanner;
  route?: string;      // internal routerLink (product/category/site path)
  href?: string;       // external url
  visible = false;
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.catalog.banners('home-popup').subscribe(list => {
      const b = (list || []).sort((a, z) => (a.sortOrder ?? 0) - (z.sortOrder ?? 0))[0];
      if (!b || !b.imageDesktop) return;
      if (this.isDismissed(b.id)) return;
      this.banner = b;
      const t = b.linkTarget ?? '';
      this.route = b.linkType === 'product' && b.linkSlug ? `/product/${b.linkSlug}`
        : b.linkType === 'category' && b.linkSlug ? `/category/${b.linkSlug}`
        : b.linkType === 'url' && t.startsWith('/') ? t : undefined;
      this.href = b.linkType === 'url' && /^https?:\/\//i.test(t) ? t : undefined;
      this.timer = setTimeout(() => { this.visible = true; }, AdPopupComponent.DELAY_MS);
    });
  }

  ngOnDestroy() { if (this.timer) clearTimeout(this.timer); }

  close() {
    this.visible = false;
    if (this.banner) {
      try { localStorage.setItem(AdPopupComponent.DISMISS_PREFIX + this.banner.id, '1'); } catch { /* storage disabled */ }
    }
  }

  /** Clicking the ad (if it links somewhere) counts as acted-on → dismiss too. */
  acted() { this.close(); }

  private isDismissed(id: string): boolean {
    try { return localStorage.getItem(AdPopupComponent.DISMISS_PREFIX + id) === '1'; }
    catch { return false; }
  }
}
