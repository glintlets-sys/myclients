import { Component, OnInit, HostBinding } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ToasterComponent } from '@shared/ui/toaster.component';
import { ToasterService } from '@shared/ui/toaster.service';
import { SeoService } from './core/seo.service';
import { AnalyticsService } from './core/analytics.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToasterComponent],
  providers: [ToasterService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  /** Keeps the app hidden (see index.html) until the first route has rendered, so content never paints
   *  before its component styles are injected (avoids the flash of unstyled content). */
  @HostBinding('class.app-ready') appReady = false;

  constructor(private router: Router, private seo: SeoService, private analytics: AnalyticsService) {}

  ngOnInit() {
    this.seo.init();
    this.analytics.init();   // inject GA / Facebook Pixel if the store owner set their IDs in admin → Settings
    // Subscribe to router events to scroll to top on navigation
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        // Reveal the app once the first routed view has rendered (its styles are now in the DOM).
        if (!this.appReady) setTimeout(() => (this.appReady = true));
        this.scrollToTop();
      });
  }

  private scrollToTop(): void {
    // Use smooth scrolling if supported, otherwise instant scroll
    if ('scrollBehavior' in document.documentElement.style) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
    } else {
      // Fallback for older browsers
      window.scrollTo(0, 0);
    }
  }
}
