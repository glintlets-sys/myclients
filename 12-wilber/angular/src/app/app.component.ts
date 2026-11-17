import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ToasterComponent } from '@shared/ui/toaster.component';
import { ToasterService } from '@shared/ui/toaster.service';
import { SeoService } from './core/seo.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToasterComponent],
  providers: [ToasterService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  constructor(private router: Router, private seo: SeoService) {}

  ngOnInit() {
    this.seo.init();
    // Subscribe to router events to scroll to top on navigation
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
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
