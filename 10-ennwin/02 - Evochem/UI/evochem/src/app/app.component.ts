import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'evochem';

  private readonly baseUrl = 'https://evochem.co.in';
  private readonly defaultTitle = 'Industrial Cleaning Chemical Manufacturer India | Evochem';
  private readonly defaultDescription =
    'Evochem — trusted manufacturer of industrial & hygiene cleaning chemicals in India. ISO-compliant, bulk supply, pan-India delivery. Get a free quote today.';

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private titleService: Title,
    private metaService: Meta,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        let route = this.activatedRoute;
        while (route.firstChild) {
          route = route.firstChild;
        }
        const data = route.snapshot.data || {};
        const pageTitle = data['title'] || this.defaultTitle;
        const description = data['description'] || this.defaultDescription;

        this.titleService.setTitle(pageTitle);
        this.metaService.updateTag({ name: 'description', content: description });
        this.metaService.updateTag({ property: 'og:title', content: pageTitle });
        this.metaService.updateTag({ property: 'og:description', content: description });

        // Per-route canonical (browser only — keeps SSR/prerender safe)
        if (isPlatformBrowser(this.platformId)) {
          const path = this.router.url === '/' ? '/' : this.router.url.split('?')[0].split('#')[0];
          const canonicalUrl = this.baseUrl + path;
          let link = this.document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
          if (!link) {
            link = this.document.createElement('link');
            link.setAttribute('rel', 'canonical');
            this.document.head.appendChild(link);
          }
          link.setAttribute('href', canonicalUrl);
          this.metaService.updateTag({ property: 'og:url', content: canonicalUrl });
        }
      });
  }
}
