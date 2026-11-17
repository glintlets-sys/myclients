import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { apiInterceptor } from '@shared/core/api.interceptor';
import { GLINT_ENV } from '@shared/core/glint-env';
import { ToasterService } from '@shared/ui/toaster.service';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiInterceptor])),
    { provide: GLINT_ENV, useValue: environment },
    ToasterService
  ]
};
