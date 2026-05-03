import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  private apiSolutionsUrl = 'assets/data/evochem-data.json';  // URL to JSON file
  private apiIndustriesUrl = 'assets/data/industries.json';  // URL to JSON file
  private apiSolutionTypesUrl = 'assets/data/solutionTypes.json';  // URL to JSON file

  getSolutions(): Observable<any[]> {
    return this.http.get<any[]>(this.apiSolutionsUrl);
  }

  getIndustries(): Observable<any[]> {
    return this.http.get<any[]>(this.apiIndustriesUrl);
  }

  getSolutionTypes(): Observable<any[]> {
    return this.http.get<any[]>(this.apiSolutionTypesUrl);
  }


 constructor(private http: HttpClient) { }
}
