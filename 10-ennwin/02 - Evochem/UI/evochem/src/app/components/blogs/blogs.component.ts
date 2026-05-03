import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DOCUMENT } from '@angular/common';

interface Faq { q: string; a: string; }
interface BlogMeta {
  title: string;
  date: string;            // ISO date for <time datetime="...">
  dateFormatted: string;   // Human-readable
  readTime: number;        // minutes
}

@Component({
  selector: 'app-blogs',
  templateUrl: './blogs.component.html',
  styleUrl: './blogs.component.scss'
})
export class BlogsComponent implements OnInit, OnDestroy {

  blogType: string = "healthCare";

  blogMeta: { [key: string]: BlogMeta } = {
    liquidDetergent: { title: 'Liquid Detergent Manufacturers in India: A Complete Guide for Businesses', date: '2026-05-03', dateFormatted: 'May 3, 2026',  readTime: 9 },
    healthCare:      { title: 'Excellence in Healthcare: The Indispensable Role of Cleaning Protocols',     date: '2024-11-14', dateFormatted: 'Nov 14, 2024', readTime: 6 },
    deepcleaning:    { title: 'Deep Cleaning Reset Protocols for Commercial Establishments',                date: '2024-10-22', dateFormatted: 'Oct 22, 2024', readTime: 7 },
    cleanBrand:      { title: 'How Cleanliness Influences Brand Image and Customer Trust',                  date: '2024-09-18', dateFormatted: 'Sep 18, 2024', readTime: 5 },
    cleanKitchen:    { title: 'Clean Kitchen, Safe Kitchen: Essential Tips for a Healthy Cooking Spaces',   date: '2024-08-05', dateFormatted: 'Aug 5, 2024',  readTime: 6 },
  };

  faqData: { [key: string]: Faq[] } = {
    liquidDetergent: [
      { q: 'What is the minimum order quantity (MOQ) for bulk liquid detergent purchases in India?', a: 'Most Indian manufacturers accept bulk orders starting from 200–500 litres per SKU for standard formulations. Custom formulations and private-label runs typically require higher MOQs of 1,000 litres or more. Always confirm MOQs upfront, especially when launching a new private-label brand.' },
      { q: 'What certifications should a liquid detergent manufacturer in India hold?', a: 'Look for ISO 9001 (quality management) and ISO 14001 (environmental management) at a minimum. GMP compliance, BIS marking where applicable, and complete MSDS/SDS documentation for every formulation are also essential indicators of a reliable supplier.' },
      { q: 'Can liquid detergent manufacturers in India produce private-label products?', a: 'Yes. Most established Indian manufacturers offer end-to-end private labelling — from custom formulation and packaging design to printing brand-specific labels — making it easier for businesses to launch their own cleaning brand without setting up production infrastructure.' },
      { q: 'How do I evaluate the quality of an industrial liquid detergent before placing a bulk order?', a: 'Always request a sample batch with the official MSDS, run independent in-house performance tests on the surfaces or fabrics you actually clean, and verify pH, active matter percentage, viscosity, and dilution ratios against the technical data sheet provided.' },
      { q: 'Are eco-friendly and biodegradable liquid detergents available from Indian manufacturers?', a: 'Yes. Several Indian manufacturers, including Evochem, now produce phosphate-free, biodegradable formulations that comply with sustainability standards while still delivering industrial-grade cleaning performance for laundry, dishwashing, and surface care applications.' },
      { q: 'What packaging options do liquid detergent manufacturers offer for bulk supply?', a: 'Common bulk options include 5L, 20L and 50L jerry cans, 200L drums, and 1,000L IBC totes. For retail or private-label brands, manufacturers also pack consumer SKUs from 500ml up to 5L in HDPE bottles with custom labelling.' },
      { q: 'How quickly can a liquid detergent manufacturer in India fulfil bulk orders?', a: 'Standard SKU lead times are typically 7–10 working days. Custom-formulated batches usually require 15–21 days from order confirmation. Manufacturers with their own logistics network can offer faster pan-India delivery, especially for repeat orders.' },
      { q: 'What is the difference between liquid laundry detergent and industrial liquid detergent?', a: 'Liquid laundry detergent uses lower-foaming, fabric-safe surfactants formulated for textile care. Industrial liquid detergents use stronger alkaline or acidic chemistries designed for surfaces, equipment, and heavy-soil applications such as kitchens, factory floors, and food-processing lines.' }
    ],
    cleanKitchen: [
      { q: 'How often should commercial kitchen surfaces be deep cleaned?', a: 'Stainless-steel surfaces and high-touch zones should be sanitised after every shift. A deep clean — degreasing hood filters, scrubbing tile grout, sanitising drains — should be done at least weekly. Monthly cleans should target ovens, fryers, and the floor area behind heavy equipment.' },
      { q: 'What are the best non-toxic cleaning products for kitchen use?', a: 'Plant-based dishwashing liquids, vinegar, baking soda, and citric-acid-based cleaners are food-safe and effective for routine surfaces. For commercial kitchens, choose food-contact-safe sanitisers that are certified for use without rinsing on prep surfaces.' },
      { q: 'How can I prevent cross-contamination in my kitchen?', a: 'Use colour-coded cutting boards and cloths for different food types — red for raw meat, blue for fish, green for produce, white for dairy. Wash hands between tasks, and never use the same sponge for raw-meat surfaces and ready-to-eat areas.' },
      { q: 'What is the safest way to dispose of kitchen waste?', a: 'Separate organic waste for composting, recyclables for bin pickup, and food-contaminated packaging for general waste. Sanitise bins weekly with a strong disinfectant, and use sealed liners to prevent pest activity, leaks, and odour build-up.' },
      { q: 'How can I keep pests out of my kitchen naturally?', a: 'Seal entry cracks around pipes and skirting, store dry goods in airtight containers, and wipe up spills immediately. Natural deterrents like bay leaves, peppermint oil, or cloves placed in pantry corners and behind appliances discourage common pests without chemicals.' },
      { q: 'Is daily kitchen cleaning enough or do I need a deep cleaning routine?', a: 'Daily wipe-downs handle visible mess and surface bacteria, but grease, mineral deposits, and biofilms accumulate in extractor hoods, grout lines, and under equipment. These need scheduled weekly and monthly deep cleans to prevent fire hazards, pest infestations, and hygiene failures.' }
    ],
    cleanBrand: [
      { q: 'How does cleanliness affect customer trust in a business?', a: 'Customers correlate visible cleanliness with overall quality, hygiene, and management standards. Clean premises measurably increase perceived professionalism, repeat-visit rates, and willingness to recommend the brand both in person and through online reviews.' },
      { q: 'Which industries are most affected by cleanliness perception?', a: 'Hospitality (hotels, restaurants), healthcare, retail, education, and corporate offices are most directly affected. However, every customer-facing business is impacted — surveys consistently show that 90%+ of consumers say a dirty premise makes them less likely to return.' },
      { q: 'Can poor cleanliness lead to negative online reviews?', a: 'Yes. Cleanliness is one of the top three review topics across hospitality, food service, and healthcare. A single recurring complaint about hygiene can lower aggregate ratings on Google, TripAdvisor, or Zomato by half a star or more, directly impacting visibility and bookings.' },
      { q: 'How can small businesses afford professional cleaning to maintain their brand image?', a: 'Outsource only periodic deep cleans (monthly or quarterly) while training in-house staff on daily routines. Investing in concentrated cleaning chemicals reduces per-litre cost significantly. Most small business owners recover the cost in customer retention and repeat revenue alone.' },
      { q: 'What are the long-term financial benefits of maintaining a clean business environment?', a: 'Benefits include reduced equipment wear and replacement costs, lower employee sick-day rates, stronger customer retention, fewer health-code violations, and a measurable lift in repeat-visit revenue — all of which compound over time into sustained profitability.' },
      { q: 'Does cleanliness influence employee productivity?', a: 'Yes. Studies show that clean, well-organised workspaces reduce employee stress, lower absenteeism by up to 15%, and improve focus and morale — all of which translate directly into higher productivity and lower staff turnover costs.' }
    ],
    deepcleaning: [
      { q: 'How is deep cleaning different from regular cleaning?', a: 'Regular cleaning addresses visible mess and surface dirt on a daily or weekly basis. Deep cleaning targets accumulated grime, biofilm, mineral deposits, and pathogens in hard-to-reach areas using specialised chemicals, equipment, and techniques that go well beyond routine sanitation.' },
      { q: 'How often should commercial establishments perform deep cleaning?', a: 'Most commercial spaces benefit from monthly deep cleans, with quarterly intensive resets for high-traffic facilities like restaurants, gyms, and healthcare premises. The exact schedule depends on footfall, industry, and any local regulatory or accreditation requirements.' },
      { q: 'What are the high-touch areas to prioritise in a deep cleaning protocol?', a: 'Door handles, light switches, lift buttons, faucet handles, payment terminals, shared keyboards, washroom fixtures, and table surfaces accumulate the highest microbial load. These should be disinfected daily — not just during scheduled deep cleans.' },
      { q: 'What PPE is required for staff performing deep cleaning?', a: 'At minimum: nitrile gloves, splash-resistant goggles, closed-toe non-slip footwear, and a chemical-resistant apron. For aerosolised disinfectants or strong acid/alkaline cleaners, add a respirator (N95 or higher) and long sleeves to protect against chemical burns and inhalation risks.' },
      { q: 'Should deep cleaning be done in-house or outsourced to professionals?', a: 'Routine monthly deep cleans can be handled by trained in-house staff with the right chemicals and equipment. Annual or post-incident resets — and any work involving hazardous materials, work at height, or specialised equipment — are typically best outsourced to professionals.' },
      { q: 'How can I document and track deep cleaning compliance?', a: 'Use cleaning logs at each station (paper or digital), schedule recurring tasks in a checklist app, and maintain dated photo records for high-risk zones. This documentation also protects against liability claims and supports audits during health inspections or accreditation reviews.' },
      { q: 'What chemicals should be used for deep cleaning vs daily cleaning?', a: 'Daily cleaning typically uses neutral-pH multipurpose cleaners and standard sanitisers. Deep cleaning calls for stronger formulations — alkaline degreasers for kitchens, acid descalers for washrooms, enzyme cleaners for organic build-up, and hospital-grade disinfectants for high-risk surfaces.' }
    ],
    healthCare: [
      { q: 'What is a Healthcare-Associated Infection (HAI), and how does cleaning prevent it?', a: 'HAIs are infections patients acquire while receiving treatment in hospitals, clinics, or care homes. Rigorous cleaning and disinfection of high-touch surfaces, medical equipment, and shared spaces measurably reduce pathogen transmission and lower HAI incidence rates.' },
      { q: 'Which surfaces in a healthcare facility need the most frequent disinfection?', a: 'Bed rails, IV poles, call buttons, door handles, light switches, tray tables, monitors, and shared diagnostic equipment are the highest-risk surfaces. These should be disinfected at minimum after every patient interaction or contact event.' },
      { q: 'What cleaning chemicals are approved for healthcare environments?', a: 'Hospital-grade disinfectants registered with regulatory bodies — typically containing quaternary ammonium compounds, hydrogen peroxide, sodium hypochlorite (bleach solutions), or peracetic acid — chosen based on the pathogen profile to be controlled (TB, C. difficile, MRSA, and others).' },
      { q: 'How is terminal cleaning different from daily cleaning in hospitals?', a: 'Daily cleaning maintains baseline hygiene during a patient stay. Terminal cleaning is the comprehensive deep-clean and disinfection performed after a patient is discharged or transferred — preparing the room, bed, and all equipment for the next occupant under strict infection-control standards.' },
      { q: 'What training do healthcare cleaning staff need?', a: 'Staff need certification in infection-control basics (hand hygiene, PPE donning/doffing), training in chemical safety and dilution, knowledge of the contact times required by each disinfectant, and understanding of waste segregation across biomedical, sharps, and general waste streams.' },
      { q: 'How often should cleaning protocols in healthcare facilities be audited?', a: 'Internal audits should be performed at least monthly, with random spot-checks weekly. Objective measurement using ATP testing or fluorescent-marker audits is recommended. External accreditation audits (NABH, JCI) typically occur annually or biennially.' }
    ]
  };

  constructor(private route: ActivatedRoute, @Inject(DOCUMENT) private document: Document) {}

  get currentFaqs(): Faq[] {
    return this.faqData[this.blogType] || [];
  }

  get currentBlogMeta(): BlogMeta | undefined {
    return this.blogMeta[this.blogType];
  }

  /** Two related posts: prev + next in the editorial order. */
  get relatedPosts(): { tag: string; title: string }[] {
    const order = ['liquidDetergent', 'healthCare', 'deepcleaning', 'cleanBrand', 'cleanKitchen'];
    const idx = order.indexOf(this.blogType);
    if (idx === -1) return [];
    const picks: string[] = [];
    if (order[idx + 1]) picks.push(order[idx + 1]);
    if (order[idx - 1]) picks.push(order[idx - 1]);
    if (picks.length < 2) {
      // fall back to the next available so we always show 2 cards
      for (const t of order) {
        if (t !== this.blogType && !picks.includes(t) && picks.length < 2) picks.push(t);
      }
    }
    return picks.map(t => ({ tag: t, title: this.blogMeta[t]?.title || t }));
  }

  get canonicalURL(): string {
    return encodeURIComponent(`https://evochem.co.in/blogs/${this.blogType}`);
  }

  get encodedTitle(): string {
    return encodeURIComponent(this.currentBlogMeta?.title || '');
  }

  ngOnInit(): void {
    window.scrollTo(0, 0);
    this.route.params.subscribe(params => {
      this.blogType = params['type'] || this.blogType;
      this.injectFaqSchema();
    });
  }

  ngOnDestroy(): void {
    this.removeFaqSchema();
  }

  private injectFaqSchema(): void {
    this.removeFaqSchema();
    const faqs = this.currentFaqs;
    if (!faqs.length) return;

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    };

    const script = this.document.createElement('script');
    script.id = 'faq-jsonld';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    this.document.head.appendChild(script);
  }

  private removeFaqSchema(): void {
    const existing = this.document.getElementById('faq-jsonld');
    if (existing) existing.remove();
  }
}
