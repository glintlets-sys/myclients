import { Component, Renderer2 } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {


  isSubmenuVisible = false;
  industries: any[] = [];

  isActive = false; // Track if the menu is active

  // Sample data for industries and cleaning areas
  
  cleaningAreas = [
    {
      "area": 'Bathroom Cleaning',
      "code": 'BathroomCleaning'
    },
    {
      "area": 'Kitchen Cleaning',
      "code": 'KitchenCleaning'
    },
    {
      "area": 'Laundry Cleaning',
      "code": 'LaundryCleaning'
    },
    {
      "area": 'Surface & Air Clean',
      "code": 'Surface&AirClean'
    }
  ];
 

  constructor(private router: Router, private dataService: DataService, private route: ActivatedRoute, private renderer: Renderer2) {
    this.dataService.getIndustries().subscribe(val=>{
      this.industries = val;
    })
  }


  ngAfterViewInit() {
    // Subscribe to router events to detect changes in the fragment
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        // Check for fragment in URL after navigation
        const fragment = this.route.snapshot.fragment;
        if (fragment) {
          // Delay to ensure the DOM is fully rendered
          setTimeout(() => {
            const element = document.getElementById(fragment);
            if (element) {
              // Smooth scroll to element
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              
              // Fallback for mobile or unsupported cases
              this.renderer.setProperty(window, 'scrollTop', element.offsetTop);
            }
          }, 100); // Adjust delay if needed for rendering
        }
      });
  }

  toggleActive() {
    this.isActive = !this.isActive; // Toggle the active state
  }
  
  navigateToCatgory(industry: any)
  {
    this.router.navigate(['/categories', industry.id]);
  }

  navigateToSolutions(solution: string)
  {
    this.router.navigate(['/solutions', solution]);
  }

  toggleSubmenu(): void {
    this.isSubmenuVisible = !this.isSubmenuVisible;
  }

  navigateToProduct(product: any): void {
    const sanitizedCode = product.code.replace(/\s+/g, '-').toLowerCase();
    this.router.navigate(['/products', sanitizedCode]);
  }

 

  
}
