import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CatalogStoreService } from './catalog-store.service';

/**
 * Injects the store's web-analytics tags (Google Analytics 4 + Meta/Facebook Pixel) when the
 * store owner has set their IDs in admin → Settings → Analytics. The IDs come from the published
 * storefront config (config.json / /v1/config), so nothing is hard-coded and the client controls them.
 * No tag is injected when its id is blank.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly doc = inject(DOCUMENT);
  private readonly catalog = inject(CatalogStoreService);
  private started = false;

  init(): void {
    if (this.started) return;
    this.started = true;
    this.catalog.config().subscribe(cfg => {
      const ga = (cfg?.analytics?.googleMeasurementId || '').trim();
      const fb = (cfg?.analytics?.facebookPixelId || '').trim();
      if (ga) this.injectGa(ga);
      if (fb) this.injectFacebookPixel(fb);
    });
  }

  private injectGa(id: string): void {
    const loader = this.doc.createElement('script');
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    this.doc.head.appendChild(loader);
    const init = this.doc.createElement('script');
    init.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});`;
    this.doc.head.appendChild(init);
  }

  private injectFacebookPixel(id: string): void {
    const s = this.doc.createElement('script');
    s.text =
      `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
      `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
      `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
      `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
      `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
      `fbq('init',${JSON.stringify(id)});fbq('track','PageView');`;
    this.doc.head.appendChild(s);
  }
}
