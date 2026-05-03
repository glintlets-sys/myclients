import { Component } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-category',
  templateUrl: './category.component.html',
  styleUrl: './category.component.scss'
})
export class CategoryComponent {

  id: string | null = null;
  solutions: any[] = [];
  industries: any[] = [];
  selectedCategory: any;
  selectedIndustry: any;
  selectedSolutions: any[] = [];
  selectedSolution: any;
  constructor(private route: ActivatedRoute, private dataService: DataService, private router: Router) { }


  selectCategory(category: any) {

    // console.trace("calling select category from aaccordian" + category.title);
    this.selectedCategory = JSON.parse(JSON.stringify(category));
    if (this.selectedCategory !== undefined) {
      this.selectedSolutions = this.getSolutionsForCategory(this.selectedCategory);
      this.selectSolution(undefined);
    }
  }
  selectSolution(solution: any) {
    // console.log("selected solution" + JSON.stringify(solution));
    this.selectedSolution = solution;
    
  }
  getSolutionsForCategory(category: any) {
    if (!category || !category.solutions) return [];
    return category?.solutions.map((id: number) => this.getSolution(id))?.filter((solution: any) => solution !== undefined);
  }
  ngOnInit(): void {

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // This will refresh the component
       // window.location.reload();
      }
    });

    this.route.paramMap.subscribe(params => {
      this.id = params.get('id'); // Retrieve the ID here
      if (this.id) {
        // Perform any necessary actions with the ID
        console.log("ID: ", this.id);
      } else {
        this.id = "1";
        
      }
      this.dataService.getSolutions().subscribe(data => {
        this.solutions = data;
        this.dataService.getIndustries().subscribe(data => {
          this.industries = data;
          this.setSelectedIndustry(this.id);
          this.getProductsWithCodes();
        });
      });
      
    });
  }
  productsWithCodes = new Map<string, any>();
  getProductsWithCodes() {
    // Loop through each category and each product to extract code and title
    this.solutions.forEach(solution => {
      solution.products.forEach((product: any) => {
        this.productsWithCodes.set(product.code, product);
      });
    });
  }

  getProduct(code: string)
  {
    return this.productsWithCodes.get(code);
  }

  setSelectedIndustry(id: any) {
   
  
    this.selectedIndustry = this.industries.find(industry => industry.id + "" === id + "");
    //console.log("selectd category: " + JSON.stringify(this.selectedIndustry.categories));
    this.selectCategory(this.selectedIndustry.categories[0]);
   
   
  }

  navigateToIndustry(id: any) {
      this.router.navigate(['../'+ id], { relativeTo: this.route });
  }


  getSolution(id: number) {
    let solution = this.solutions.find(solution => solution.id + "" === id + "");
    return solution;
  }

  // Helper function to normalize ID for comparison
  normalizeId(id: any): string {
    return id ? id.toString() : '';
  }


  // Method to check if the industry is selected
  isIndustrySelected(industryId: any): boolean {
    return this.normalizeId(this.selectedIndustry?.id) === this.normalizeId(industryId);
  }

 
  // Method to check if the solution is selected
  isSolutionSelected(solutionId: any): boolean {
    return this.normalizeId(this.selectedSolution?.id) === this.normalizeId(solutionId);
  }

  formatCode(code: string): string {
    return code.replace(/\s+/g, '-').toLowerCase(); // Replace spaces with hyphens and convert to lowercase
  }

  goToProductPage(product: any) {
    const formattedCode = this.formatCode(product.code);
    this.router.navigate(['/product', formattedCode , { solution: this.selectedIndustry.id }]);
  }
}
