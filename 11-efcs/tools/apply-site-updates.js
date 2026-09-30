#!/usr/bin/env node
/*
 * Applies the "Website changes EFCS" list (Sep 2026) to every page of the static site.
 *
 *   node apply-site-updates.js <pristine-src-dir> <out-dir>
 *
 * Reads the pristine pages (e.g. a fresh `aws s3 sync s3://efcs`) and writes the updated
 * pages into <out-dir>, so re-running is safe. Also generates about.html, faq.html and
 * projects.html from sections of the home page.
 */
const fs = require('fs');
const path = require('path');

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) { console.error('usage: node apply-site-updates.js <src> <out>'); process.exit(1); }

// Fill these in when the client shares the profile URLs; icons without a URL are not shown.
const SOCIAL = [
  { icon: 'fa-facebook', label: 'Facebook', url: 'https://www.facebook.com/efcs' },
  { icon: 'fa-instagram', label: 'Instagram', url: '' },
  { icon: 'fa-linkedin', label: 'LinkedIn', url: '' },
  { icon: 'fa-youtube', label: 'YouTube', url: '' },
  { icon: 'fa-whatsapp', label: 'WhatsApp', url: 'https://wa.me/918904312966' },
];

const SERVICES = [
  ['marble-restoration-polishing.html', 'Marble Restoration & Polishing'],
  ['granite-restoration-and-polishing.html', 'Granite Restoration & Polishing'],
  ['vinyl-floor-polishing.html', 'Vinyl Floor Polishing'],
  ['epoxy-floor-polishing.html', 'Epoxy Floor Polishing'],
  ['mosaic-polishing.html', 'Mosaic Polishing'],
  ['carpet-shampooing.html', 'Carpet Shampooing'],
  ['sofa-shampooing.html', 'Sofa Shampooing'],
  ['chair-shampooing.html', 'Chair Shampooing'],
  ['painting-services.html', 'Painting Services'],
  ['one-time-deep-cleaning-services.html', 'One-Time Deep Cleaning'],
  ['house-keeping-services.html', 'Housekeeping Services'],
  ['house-keeping-tools-supplies.html', 'Housekeeping Tools & Supplies'],
  ['cleaning-chemical-supplies.html', 'Cleaning Chemical Supplies'],
];
const SERVICE_FILES = SERVICES.map(s => s[0]);

const DEFAULT_BANNER = 'assets/image/Marblepolishingbanner.jpg';
const PAGE_BANNERS = {
  'contact.html': ['Contact Us', 'assets/image/herobanner.jpg'],
  'blogdetail.html': ['Blog', 'assets/image/Granitepolishingbanner.jpg'],
  'privacy-policy.html': ['Privacy Policy', DEFAULT_BANNER],
  'terms.html': ['Terms & Conditions', DEFAULT_BANNER],
  '404.html': ['Page Not Found', DEFAULT_BANNER],
  'about.html': ['About Us', 'assets/image/herobanner1.jpg'],
  'faq.html': ['Frequently Asked Questions', 'assets/image/Granitebanner.jpg'],
  'projects.html': ['Our Projects', 'assets/image/Cementpolishingbanner.jpg'],
};

const NEW_PAGES = {
  'about.html': {
    title: 'About EFCS | Floor Polishing & Facility Services in Bangalore',
    description: 'About Excellent Facility Connect Services (EFCS) — marble, granite and floor polishing, deep cleaning and housekeeping for homes and businesses across Bangalore.',
  },
  'faq.html': {
    title: 'FAQ | Floor Polishing Questions Answered | EFCS Bangalore',
    description: 'Answers to common questions about marble, granite and floor polishing, pricing, timelines and maintenance contracts from EFCS, Bangalore.',
  },
  'projects.html': {
    title: 'Projects | Residential & Commercial Floor Polishing | EFCS',
    description: 'See residential and commercial floor polishing and restoration projects completed by EFCS across Bangalore.',
  },
};

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const esc = s => s.replace(/&(?!amp;|#?\w+;)/g, '&amp;');
const stripTags = s => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
function truncate(s, n) { if (s.length <= n) return s; const cut = s.slice(0, n); return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '') + '…'; }
function mustReplace(html, re, rep, what, file) {
  if (!re.test(html)) throw new Error(`${file}: could not find ${what}`);
  return html.replace(re, rep);
}

const pages = fs.readdirSync(SRC).filter(f => f.endsWith('.html') && f !== 'EFCStemplate.html');
const BLOG_POSTS = pages.filter(f => read(f).includes('class="bog-detailpage"'));

// ---------- shared markup ----------
function socialLinks(cls = '') {
  return SOCIAL.filter(s => s.url).map(s =>
    `<a href="${s.url}" target="_blank" rel="noopener"${cls} aria-label="${s.label}"><i class="fa-brands ${s.icon}"></i></a>`).join('');
}

const NAV = [
  ['/', 'Home', ['index.html']],
  ['about.html', 'About Us', ['about.html']],
  ['/#services1', 'Services', SERVICE_FILES, true],
  ['projects.html', 'Projects', ['projects.html']],
  ['faq.html', 'FAQ', ['faq.html']],
  ['blogdetail.html', 'Blog', ['blogdetail.html', ...BLOG_POSTS]],
  ['contact.html', 'Contact', ['contact.html']],
];

const HEADER = `<header class="efcs-header">
        <div class="efcs-topbar"><div class="container">
            <div class="efcs-follow"><span>Follow Us:</span>${socialLinks()}</div>
            <div class="efcs-call"><i class="fa-solid fa-phone"></i><a href="tel:+918904312966">+91 89043 12966</a><span class="efcs-alt">/ <a href="tel:+918848072224">+91 88480 72224</a></span></div>
        </div></div>
        <div class="efcs-mainbar"><div class="container">
            <a class="efcs-logo" href="/"><img src="assets/image/logo.png" alt="EFCS - Excellent Facility Connect Services" width="220" height="52"></a>
            <nav aria-label="Main"><ul class="efcs-nav">
${NAV.map(([href, label, pagesFor, sub]) => sub
  ? `                <li data-pages="${pagesFor.join(' ')}"><a href="${href}">${label}<i class="fa-solid fa-chevron-down efcs-caret"></i></a>
                    <ul class="efcs-sub">
${SERVICES.map(([f, n]) => `                        <li><a href="${f}">${esc(n)}</a></li>`).join('\n')}
                    </ul></li>`
  : `                <li data-pages="${pagesFor.join(' ')}"><a href="${href}">${label}</a></li>`).join('\n')}
            </ul></nav>
            <div class="efcs-actions">
                <button type="button" class="efcs-enquiry" data-bs-toggle="modal" data-bs-target="#exampleModal"><i class="fa-regular fa-bell"></i> Enquiry</button>
                <button type="button" class="efcs-burger" data-bs-toggle="offcanvas" data-bs-target="#offcanvasExample" aria-controls="offcanvasExample" aria-label="Open menu"><i class="fa-solid fa-bars"></i></button>
            </div>
        </div></div>
    </header>`;

function mobileItem(href, label) {
  return `                <li>
                    <div class="div-ulsec">
                        <div class="systumm-hai caret">
                            <div class="div-name"><a href="${href}"><p>${label.toUpperCase()}</p></a></div>
                        </div>
                    </div>
                </li>`;
}
const MOBILE_MENU = `<ul>
${NAV.map(([href, label, , sub]) => sub
  ? `                <li>
                    <div class="div-ulsec">
                        <div class="systumm-hai caret">
                            <div class="div-name"><a href="${href}"><p>SERVICES</p></a></div>
                            <div class="div-arrow"><i class="fa-solid fa-chevron-right"></i></div>
                        </div>
                        <div class="nested">
${SERVICES.map(([f, n]) => `                            <a href="${f}"><p>${esc(n)}</p></a>`).join('\n')}
                        </div>
                    </div>
                </li>`
  : mobileItem(href, label)).join('\n')}
              </ul>`;

function banner(title, bg, crumbs, tag = 'p') {
  const trail = [['/', 'Home'], ...crumbs].map(([h, t], i, a) =>
    i === a.length - 1 ? esc(t) : `<a href="${h}">${esc(t)}</a><span>/</span>`).join('');
  return `\n    <section class="efcs-page-banner" style="background-image:url('${bg}')">
        <${tag} class="efcs-banner-title">${esc(title)}</${tag}>
        <p class="efcs-crumbs">${trail}</p>
    </section>`;
}

const COPYRIGHT = `
            <div class="efcs-copyright">&copy; <span class="efcs-year">2026</span> Excellent Facility Connect Services (EFCS). All rights reserved. &middot; <a href="privacy-policy.html">Privacy Policy</a> &middot; <a href="terms.html">Terms &amp; Conditions</a></div>
            <script>document.querySelectorAll('.efcs-year').forEach(function(e){e.textContent=new Date().getFullYear();});</script>`;

// ---------- home-page services scroller ----------
function serviceCard([file, name]) {
  const html = read(file);
  const img = (html.match(/services-circle-item-img[\s\S]*?<img src="([^"]+)"/) || [])[1] || DEFAULT_BANNER;
  const firstP = (html.match(/<p class="description-p">([\s\S]*?)<\/p>/) || [])[1] || '';
  const desc = truncate(stripTags(firstP), 150);
  return `                    <div class="swiper-slide">
                        <div class="efcs-service-card">
                            <a class="efcs-sc-img" href="${file}"><img src="${img}" alt="${esc(name)}" loading="lazy"></a>
                            <div class="efcs-sc-body">
                                <h3>${esc(name)}</h3>
                                <p>${desc}</p>
                                <a href="${file}"><div class="btn-readmore">Read More</div></a>
                            </div>
                        </div>
                    </div>`;
}
const SERVICES_SECTION = `<section class="Cleaning_service class-section" id="services1">
            <div class="container-fluid">
                <h2 class="main_tittle">Comprehensive Polishing Care for Residential and Commercial</h2>
                <div class="efcs-services-swiper">
                    <div class="swiper"><div class="swiper-wrapper">
${SERVICES.map(serviceCard).join('\n')}
                    </div></div>
                    <button type="button" class="efcs-swiper-btn efcs-swiper-prev" aria-label="Previous services"><i class="fa-solid fa-chevron-left"></i></button>
                    <button type="button" class="efcs-swiper-btn efcs-swiper-next" aria-label="Next services"><i class="fa-solid fa-chevron-right"></i></button>
                    <div class="swiper-pagination"></div>
                </div>
            </div>
        </section>`;

// ---------- contact page details ----------
const CONTACT_DETAILS = `<p class="intouct">Get In Touch With Us</p>
                                <div class="efcs-contact-cards">
                                    <div class="efcs-contact-card"><div class="efcs-ci"><i class="fa-solid fa-location-dot"></i></div><div><h3>Our Office</h3><p>49/1, 1st Main Road, Palace Guttahalli, Bangalore - 560003</p></div></div>
                                    <div class="efcs-contact-card"><div class="efcs-ci"><i class="fa-solid fa-phone"></i></div><div><h3>Call Us</h3><p><a href="tel:+918904312966">+91 89043 12966</a><br><a href="tel:+918848072224">+91 88480 72224</a></p></div></div>
                                    <div class="efcs-contact-card"><div class="efcs-ci"><i class="fa-solid fa-envelope"></i></div><div><h3>Email Us</h3><p><a href="mailto:vinesh@efcs.co.in">vinesh@efcs.co.in</a></p></div></div>
                                    <div class="efcs-contact-card"><div class="efcs-ci"><i class="fa-regular fa-clock"></i></div><div><h3>Working Hours</h3><p>Mon - Sat: 10 AM to 7 PM<br>Sunday: By appointment only</p></div></div>
                                </div>
                                <div class="efcs-map">
                                    <iframe title="EFCS office location" src="https://www.google.com/maps?q=49%2F1%2C%201st%20Main%20Road%2C%20Palace%20Guttahalli%2C%20Bangalore%20560003&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
                                </div>
                                `;

// ---------- build the three new pages from the home page ----------
function sliceBetween(html, startMarker, endMarker, file) {
  const s = html.indexOf(startMarker);
  const e = html.indexOf(endMarker, s + 1);
  if (s < 0 || e < 0) throw new Error(`${file}: missing section ${startMarker}`);
  return html.slice(s, e);
}
function buildNewPage(file, sectionsHtml) {
  const home = read('index.html');
  const start = home.indexOf('<section class="introduction_slider">');
  const nlForm = home.indexOf('<form class="newsletter-form"');
  const tail = home.lastIndexOf('<section', nlForm);
  let page = home.slice(0, start).replace('<div class="main_section-website">', '<div class="main_section-website efcs-page">')
    + sectionsHtml + '\n        ' + home.slice(tail);
  const meta = NEW_PAGES[file];
  const url = `https://www.efcs.co.in/${file}`;
  page = page.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${meta.description}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(meta.title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${meta.description}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/(<link rel="canonical" href=")[^"]*(" \/>)\s*<link rel="canonical"[^>]*>/, `$1${url}$2`)
    .replace(/<script>\s*if \(window\.location\.pathname\.endsWith\('index\.html'\)\)[\s\S]*?<\/script>\n?/, '');
  return page;
}
function newPageSources() {
  const home = read('index.html');
  const about = sliceBetween(home, '<section class=" Aboutus class-section" id="Aboutus1">', '<!-- Gallery -->', 'index.html')
    + sliceBetween(home, '<section class="advertse class-section">', '<!-- testimonial -->', 'index.html');
  const faq = sliceBetween(home, '<div class="faqsection class-section" id="faq1">', '<section style="margin-bottom: -80px', 'index.html');
  const projects = sliceBetween(home, '<section class="gallery-section class-section" id="project1">', '<section class="blogsection', 'index.html')
    + sliceBetween(home, '<!-- testimonial -->', '<!-- <section class="partnerwithus', 'index.html');
  return {
    'about.html': buildNewPage('about.html', about),
    'faq.html': buildNewPage('faq.html', faq),
    'projects.html': buildNewPage('projects.html', projects),
  };
}

// ---------- per-page transform ----------
function transform(file, html) {
  // 1. Header: logo + nav on one line, Contact last, no tagline/timings, social icons top-left.
  html = mustReplace(html, /<header class=" page-header header-sticky">[\s\S]*?<\/header>/, HEADER, 'page header', file);
  html = mustReplace(html, /(<div class="div-menulink-phone">\s*)<ul>[\s\S]*?<\/ul>/, `$1${MOBILE_MENU}`, 'mobile menu', file);
  html = mustReplace(html, /<script>\s*window\.addEventListener\("scroll",\s*function\s*\(\)\s*\{\s*const header = document\.querySelector\("\.page-header"\);[\s\S]*?<\/script>/, '', 'old sticky script', file);

  // 13. Banner with page title (blog articles get theirs from the post image, via CSS).
  const isPost = BLOG_POSTS.includes(file);
  if (file !== 'index.html' && !isPost) {
    let b;
    const tag = /<h1[\s>]/.test(html.replace(/<!--[\s\S]*?-->/g, '')) ? 'p' : 'h1';
    const svc = SERVICES.find(s => s[0] === file);
    if (svc) {
      const img = (html.match(/services-circle-item-img[\s\S]*?<img src="([^"]+)"/) || [])[1] || DEFAULT_BANNER;
      b = banner(svc[1], img, [['/#services1', 'Services'], ['', svc[1]]], tag);
    } else {
      const [t, bg] = PAGE_BANNERS[file] || [stripTags((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'EFCS').split('|')[0], DEFAULT_BANNER];
      b = banner(t, bg, [['', t]], tag);
    }
    html = html.replace('</header>', '</header>' + b);
  }

  // Internal links to the new standalone pages.
  html = html.replace(/href="\/#Aboutus1 ?"/g, 'href="about.html"')
    .replace(/href="\/#project1 ?"/g, 'href="projects.html"')
    .replace(/href="\/#faq1 ?"/g, 'href="faq.html"');

  // 15. Social icons (footer + contact page) share one list.
  html = html.replace(/<div class="ot-social">[\s\S]*?<\/div>/g, `<div class="ot-social">${socialLinks()}</div>`);

  // 4. Forms: phone must be 10 digits, date of visit mandatory.
  html = html.replace(/<input([^>]*?)maxlength="10"([^>]*)>/g, (m, a, b) =>
    /pattern=/.test(m) ? m : `<input${a}maxlength="10" minlength="10" pattern="[0-9]{10}" inputmode="numeric" title="Enter a 10-digit phone number"${b}>`);
  html = html.replace(/<input([^>]*?)type="date"([^>]*)>/g, (m, a, b) => /required/.test(m) ? m : `<input${a}type="date" required${b}>`);

  // 16. Copyright at the bottom of every page.
  html = mustReplace(html, /(<section class="footer-section">[\s\S]*?)(\s*<\/section>)/, `$1${COPYRIGHT}$2`, 'footer', file);

  // 3b. Service pages: one CTA per page (keep the last, next to the FAQ).
  const ctas = html.match(/<section class="cta-section">[\s\S]*?<\/section>\s*/g) || [];
  for (let i = 0; i < ctas.length - 1; i++) html = html.replace(ctas[i], '');

  if (file === 'index.html') {
    // 3. Services section as a scroller with every service.
    html = mustReplace(html, /<section class="Cleaning_service class-section" id="services1">[\s\S]*?<\/section>/, SERVICES_SECTION, 'services section', file);
    // 5. "Get service now" goes to the contact page form.
    html = html.replace(/<a data-bs-toggle="modal" data-bs-target="#exampleModal">\s*<div class="tt-btn tt-btn__top">GET SERVICE NOW <\/div>\s*<\/a>/g,
      '<a href="contact.html#contactusform">\n                                            <div class="tt-btn tt-btn__top">GET SERVICE NOW</div>\n                                        </a>');
  }

  if (file === 'contact.html') {
    // 14. Highlighted contact details with icons + timings; map pointed at the actual office.
    html = mustReplace(html, /<p class="intouct">Get In Touch With Us<\/p>[\s\S]*?(<div class="foolow0nus">)/, `${CONTACT_DETAILS}$1`, 'contact details', file);
    html = html.replace('<input id="inputEmail" type="text"', '<input id="inputEmail" type="email"');
  }

  // Shared stylesheet + script.
  if (!html.includes('efcs-updates.css')) html = html.replace('</head>', '    <link rel="stylesheet" href="assets/css/efcs-updates.css">\n</head>');
  if (!html.includes('efcs-updates.js')) html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, '<script src="assets/js/efcs-updates.js"></script>\n</body>');
  return html;
}

const all = Object.fromEntries(pages.map(f => [f, read(f)]));
Object.assign(all, newPageSources());
for (const [file, html] of Object.entries(all)) {
  fs.writeFileSync(path.join(OUT, file), transform(file, html));
  console.log('updated', file);
}
