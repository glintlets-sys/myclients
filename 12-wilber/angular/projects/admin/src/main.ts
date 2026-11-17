import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { consumeSupportFragment } from './app/core/support-session';
import { environment } from './environments/environment';

// Tab icon: the tenant's logo mark from the environment (index.html is shared by every tenant's admin).
const icon = (environment as { favicon?: string }).favicon;
if (icon) {
  document.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = icon;
  document.head.appendChild(link);
}

// PWA: offline app shell + "Install app". The install prompt is kept for the mobile More → "Install on this phone" button.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  (window as unknown as { __glintInstallPrompt?: Event }).__glintInstallPrompt = e;
  window.dispatchEvent(new Event('glint-install-ready'));
});

// The platform console's "Open admin" arrives as #support=<token>: store that session before the guards run.
consumeSupportFragment()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error(err));
