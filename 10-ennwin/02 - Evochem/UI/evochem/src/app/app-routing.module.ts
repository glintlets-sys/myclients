import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { CategoryComponent } from './components/category/category.component';
import { ProductComponent } from './components/product/product.component';
import { ContactusComponent } from './components/contactus/contactus.component';
import { SolutionsComponent } from './components/solutions/solutions.component';
import { BlogsComponent } from './components/blogs/blogs.component';

const routes: Routes = [
  { path: '', component: HomeComponent, pathMatch: 'full' },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  { path: 'categories', component: CategoryComponent },
  { path: 'categories/:id', component: CategoryComponent },
  { path: 'product/:productId', component: ProductComponent,   runGuardsAndResolvers: 'always' },
  { path: 'contactus', component: ContactusComponent },
  { path: 'solutions', component: SolutionsComponent },
  { path: 'solutions/:solutionType', component: SolutionsComponent },
  { path: 'blogs/:type', component: BlogsComponent },
  { path: '**', redirectTo: '' } // Wildcard route for 404
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { onSameUrlNavigation: 'reload' }) ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
