import { Component, OnInit } from '@angular/core';
import { DataService } from '../../services/data.service';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

@Component({
  selector: 'app-solutions',
  templateUrl: './solutions.component.html',
  styleUrl: './solutions.component.scss'
})
export class SolutionsComponent implements OnInit{


  solutionTypes: any[] = [];
  selectedSolutionType : any = undefined;
  selectedSolution: any = 1;
  solutions: any[] = [];


  constructor(private dataService: DataService, private route: ActivatedRoute, private router: Router)
  {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // This will refresh the component
        //window.location.reload();
        window.scrollTo(0, 0); // Scroll to the top of the page
      }
    });
    
    this.dataService.getSolutionTypes().subscribe(val=>{
      this.solutionTypes = val;
    
    
      

      this.route.paramMap.subscribe(params => {
        const selectedSolutionType = params.get('solutionType'); // Retrieve the ID here
        if (selectedSolutionType) {
          this.solutionTypes.forEach(solutionType => {
            if(solutionType.code === selectedSolutionType) {
              this.selectedSolutionType = solutionType;
              this.selectedSolution = this.selectedSolutionType.solutions[0];
            }
          }) 
        } 
        if(this.selectedSolutionType == undefined) {
          this.selectedSolutionType = this.solutionTypes[0];
          this.selectedSolution = this.selectedSolutionType.solutions[0];
        }
        console.log("selected solution type: " + JSON.stringify(this.selectedSolutionType))
      });
    })
    this.dataService.getSolutions().subscribe(val=>{
      this.solutions = val;
    })
  }

  ngOnInit()
  {

    
  }

  indexof(solution: any): number
  {
    return this.selectedSolutionType.solutions.findIndex((s: any) => s === solution);
  }

  getProduct(productName: string)
  {
    for (let solution of this.solutions) {
      const product = solution.products.find((p: any) =>
         this.formatCode(p.code) === this.formatCode(productName));
        if(product)
        {
          return product;
        }
    }
    return undefined;
  }

  formatCode(code: string): string {
    return code.replace(/\s+/g, '-').toLowerCase(); // Replace spaces with hyphens and convert to lowercase
  }

  selectSolutionFromIndex(i: number)
  {
    this.selectSolution(this.selectedSolutionType.solutions[i]);
  }

  selectSolution(selectedSolution: any)
  {
    this.selectedSolution = selectedSolution;
  }

  goToProductPage(product: any) {
    const formattedCode = this.formatCode(product.code);
    this.router.navigate(['/product', formattedCode , { solutionType : this.selectedSolutionType.id }]);
  }

  selectSolutionFromLabel(selectedTitle: string) {
    // Find the selected solution by title
    this.selectedSolution = this.selectedSolutionType.solutions.find(
      (solution: any) => solution.title === selectedTitle
    );
  }

  onSelectChange(event: Event) {
    // Use type assertion to let TypeScript know `event.target` is an HTMLSelectElement
    const selectElement = event.target as HTMLSelectElement;
    const selectedValue = selectElement.value;
  
    this.selectSolutionFromLabel(selectedValue);
  }


}
