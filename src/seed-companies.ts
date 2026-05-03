/**
 * Seed Script – Top German Companies
 * Run: npx tsx src/seed-companies.ts
 */
import { pool } from './db';
import { upsertCompany } from './companyRepo';

const COMPANIES = [
  // DAX 40
  { name: 'Siemens', domain: 'siemens.com', careers_url: 'https://jobs.siemens.com', industry: 'Technologie', hq_location: 'München', employees_approx: 311000 },
  { name: 'SAP', domain: 'sap.com', careers_url: 'https://jobs.sap.com', industry: 'Software', hq_location: 'Walldorf', employees_approx: 107000 },
  { name: 'Deutsche Telekom', domain: 'telekom.de', careers_url: 'https://jobs.telekom.com', industry: 'Telekommunikation', hq_location: 'Bonn', employees_approx: 207000 },
  { name: 'Allianz', domain: 'allianz.com', careers_url: 'https://careers.allianz.com', industry: 'Versicherung', hq_location: 'München', employees_approx: 159000 },
  { name: 'BMW', domain: 'bmw.com', careers_url: 'https://www.bmwgroup.jobs', industry: 'Automobil', hq_location: 'München', employees_approx: 149000 },
  { name: 'Mercedes-Benz', domain: 'mercedes-benz.com', careers_url: 'https://jobs.mercedes-benz.com', industry: 'Automobil', hq_location: 'Stuttgart', employees_approx: 170000 },
  { name: 'Volkswagen', domain: 'volkswagen.de', careers_url: 'https://www.volkswagen-karriere.de', industry: 'Automobil', hq_location: 'Wolfsburg', employees_approx: 675000 },
  { name: 'BASF', domain: 'basf.com', careers_url: 'https://www.basf.com/global/en/careers.html', industry: 'Chemie', hq_location: 'Ludwigshafen', employees_approx: 111000 },
  { name: 'Bayer', domain: 'bayer.com', careers_url: 'https://career.bayer.com', industry: 'Pharma', hq_location: 'Leverkusen', employees_approx: 101000 },
  { name: 'Deutsche Bank', domain: 'db.com', careers_url: 'https://careers.db.com', industry: 'Banken', hq_location: 'Frankfurt', employees_approx: 84000 },
  { name: 'Infineon', domain: 'infineon.com', careers_url: 'https://www.infineon.com/careers', industry: 'Halbleiter', hq_location: 'Neubiberg', employees_approx: 58000 },
  { name: 'Deutsche Post DHL', domain: 'dpdhl.com', careers_url: 'https://careers.dhl.com', industry: 'Logistik', hq_location: 'Bonn', employees_approx: 590000 },
  { name: 'Adidas', domain: 'adidas.com', careers_url: 'https://careers.adidas-group.com', industry: 'Sportartikel', hq_location: 'Herzogenaurach', employees_approx: 59000 },
  { name: 'Henkel', domain: 'henkel.de', careers_url: 'https://www.henkel.de/karriere', industry: 'Konsumgüter', hq_location: 'Düsseldorf', employees_approx: 50000 },
  { name: 'Continental', domain: 'continental.com', careers_url: 'https://www.continental.com/de/karriere', industry: 'Automobil', hq_location: 'Hannover', employees_approx: 199000 },
  { name: 'Merck KGaA', domain: 'merckgroup.com', careers_url: 'https://www.merckgroup.com/de/careers.html', industry: 'Pharma', hq_location: 'Darmstadt', employees_approx: 64000 },
  { name: 'Munich Re', domain: 'munichre.com', careers_url: 'https://www.munichre.com/en/careers.html', industry: 'Versicherung', hq_location: 'München', employees_approx: 43000 },
  { name: 'E.ON', domain: 'eon.com', careers_url: 'https://www.eon.com/de/ueber-uns/karriere.html', industry: 'Energie', hq_location: 'Essen', employees_approx: 72000 },
  { name: 'RWE', domain: 'rwe.com', careers_url: 'https://www.rwe.com/karriere', industry: 'Energie', hq_location: 'Essen', employees_approx: 20000 },
  { name: 'Fresenius', domain: 'fresenius.com', careers_url: 'https://karriere.fresenius.de', industry: 'Gesundheit', hq_location: 'Bad Homburg', employees_approx: 190000 },
  { name: 'Deutsche Börse', domain: 'deutsche-boerse.com', careers_url: 'https://careers.deutsche-boerse.com', industry: 'Finanzen', hq_location: 'Frankfurt', employees_approx: 11000 },
  { name: 'Vonovia', domain: 'vonovia.de', careers_url: 'https://karriere.vonovia.de', industry: 'Immobilien', hq_location: 'Bochum', employees_approx: 16000 },
  { name: 'Porsche', domain: 'porsche.com', careers_url: 'https://jobs.porsche.com', industry: 'Automobil', hq_location: 'Stuttgart', employees_approx: 42000 },
  { name: 'Zalando', domain: 'zalando.de', careers_url: 'https://jobs.zalando.com', industry: 'E-Commerce', hq_location: 'Berlin', employees_approx: 17000 },
  { name: 'Hannover Rück', domain: 'hannover-re.com', careers_url: 'https://www.hannover-re.com/careers', industry: 'Versicherung', hq_location: 'Hannover', employees_approx: 3600 },
  // MDAX / TecDAX / Large Cap
  { name: 'Delivery Hero', domain: 'deliveryhero.com', careers_url: 'https://careers.deliveryhero.com', industry: 'E-Commerce', hq_location: 'Berlin', employees_approx: 53000 },
  { name: 'HelloFresh', domain: 'hellofresh.de', careers_url: 'https://www.hellofresh.com/careers', industry: 'E-Commerce', hq_location: 'Berlin', employees_approx: 21000 },
  { name: 'TeamViewer', domain: 'teamviewer.com', careers_url: 'https://www.teamviewer.com/de/karriere', industry: 'Software', hq_location: 'Göppingen', employees_approx: 1500 },
  { name: 'Nemetschek', domain: 'nemetschek.com', careers_url: 'https://www.nemetschek.com/de/karriere', industry: 'Software', hq_location: 'München', employees_approx: 3400 },
  { name: 'Carl Zeiss', domain: 'zeiss.de', careers_url: 'https://www.zeiss.de/corporate/karriere.html', industry: 'Optik', hq_location: 'Oberkochen', employees_approx: 43000 },
  { name: 'Bosch', domain: 'bosch.de', careers_url: 'https://www.bosch.de/karriere', industry: 'Technologie', hq_location: 'Stuttgart', employees_approx: 421000 },
  { name: 'Lidl', domain: 'lidl.de', careers_url: 'https://jobs.lidl.de', industry: 'Einzelhandel', hq_location: 'Neckarsulm', employees_approx: 360000 },
  { name: 'Aldi Süd', domain: 'aldi-sued.de', careers_url: 'https://karriere.aldi-sued.de', industry: 'Einzelhandel', hq_location: 'Mülheim', employees_approx: 175000 },
  { name: 'REWE Group', domain: 'rewe-group.com', careers_url: 'https://karriere.rewe-group.com', industry: 'Einzelhandel', hq_location: 'Köln', employees_approx: 384000 },
  { name: 'Edeka', domain: 'edeka.de', careers_url: 'https://verbund.edeka/karriere', industry: 'Einzelhandel', hq_location: 'Hamburg', employees_approx: 402000 },
  { name: 'Schwarz Gruppe', domain: 'gruppe.schwarz', careers_url: 'https://gruppe.schwarz/karriere', industry: 'Einzelhandel', hq_location: 'Neckarsulm', employees_approx: 575000 },
  { name: 'ThyssenKrupp', domain: 'thyssenkrupp.com', careers_url: 'https://karriere.thyssenkrupp.com', industry: 'Industrie', hq_location: 'Essen', employees_approx: 96000 },
  { name: 'Daimler Truck', domain: 'daimlertruck.com', careers_url: 'https://jobs.daimlertruck.com', industry: 'Automobil', hq_location: 'Stuttgart', employees_approx: 103000 },
  { name: 'Commerzbank', domain: 'commerzbank.de', careers_url: 'https://karriere.commerzbank.de', industry: 'Banken', hq_location: 'Frankfurt', employees_approx: 36000 },
  { name: 'Covestro', domain: 'covestro.com', careers_url: 'https://careers.covestro.com', industry: 'Chemie', hq_location: 'Leverkusen', employees_approx: 18000 },
  // Tech & Startups
  { name: 'Celonis', domain: 'celonis.com', careers_url: 'https://www.celonis.com/careers', industry: 'Software', hq_location: 'München', employees_approx: 3000 },
  { name: 'Personio', domain: 'personio.de', careers_url: 'https://www.personio.com/about-personio/careers', industry: 'Software', hq_location: 'München', employees_approx: 2000 },
  { name: 'FlixBus', domain: 'flixbus.de', careers_url: 'https://www.flixbus.com/company/career', industry: 'Mobilität', hq_location: 'München', employees_approx: 3000 },
  { name: 'N26', domain: 'n26.com', careers_url: 'https://n26.com/en/careers', industry: 'FinTech', hq_location: 'Berlin', employees_approx: 1500 },
  { name: 'Trade Republic', domain: 'traderepublic.com', careers_url: 'https://traderepublic.com/careers', industry: 'FinTech', hq_location: 'Berlin', employees_approx: 800 },
  { name: 'Scalable Capital', domain: 'scalable.capital', careers_url: 'https://de.scalable.capital/karriere', industry: 'FinTech', hq_location: 'München', employees_approx: 500 },
  { name: 'AUTO1 Group', domain: 'auto1-group.com', careers_url: 'https://www.auto1-group.com/careers', industry: 'E-Commerce', hq_location: 'Berlin', employees_approx: 6000 },
  { name: 'Wolt', domain: 'wolt.com', careers_url: 'https://careers.wolt.com', industry: 'E-Commerce', hq_location: 'Berlin', employees_approx: 8000 },
  { name: 'GetYourGuide', domain: 'getyourguide.com', careers_url: 'https://careers.getyourguide.com', industry: 'Tourismus', hq_location: 'Berlin', employees_approx: 800 },
  { name: 'SumUp', domain: 'sumup.com', careers_url: 'https://www.sumup.com/careers', industry: 'FinTech', hq_location: 'Berlin', employees_approx: 3000 },
  // Mittelstand / Hidden Champions
  { name: 'Würth', domain: 'wuerth.com', careers_url: 'https://karriere.wuerth.com', industry: 'Handel', hq_location: 'Künzelsau', employees_approx: 87000 },
  { name: 'Trumpf', domain: 'trumpf.com', careers_url: 'https://www.trumpf.com/de_DE/karriere', industry: 'Maschinenbau', hq_location: 'Ditzingen', employees_approx: 18000 },
  { name: 'Festo', domain: 'festo.com', careers_url: 'https://www.festo.com/de/de/e/karriere', industry: 'Automatisierung', hq_location: 'Esslingen', employees_approx: 20000 },
  { name: 'Heraeus', domain: 'heraeus.com', careers_url: 'https://www.heraeus.com/de/group/careers', industry: 'Technologie', hq_location: 'Hanau', employees_approx: 17000 },
  { name: 'Kärcher', domain: 'kaercher.com', careers_url: 'https://www.kaercher.com/de/inside-kaercher/karriere.html', industry: 'Reinigungstechnik', hq_location: 'Winnenden', employees_approx: 15000 },
  { name: 'Stihl', domain: 'stihl.de', careers_url: 'https://www.stihl.de/karriere.aspx', industry: 'Maschinenbau', hq_location: 'Waiblingen', employees_approx: 20000 },
  { name: 'Miele', domain: 'miele.de', careers_url: 'https://www.miele.de/karriere', industry: 'Hausgeräte', hq_location: 'Gütersloh', employees_approx: 23000 },
  { name: 'Bertelsmann', domain: 'bertelsmann.de', careers_url: 'https://www.bertelsmann.de/karriere', industry: 'Medien', hq_location: 'Gütersloh', employees_approx: 145000 },
  { name: 'Otto Group', domain: 'ottogroup.com', careers_url: 'https://www.ottogroup.com/de/karriere.html', industry: 'E-Commerce', hq_location: 'Hamburg', employees_approx: 43000 },
  { name: 'Axel Springer', domain: 'axelspringer.com', careers_url: 'https://career.axelspringer.com', industry: 'Medien', hq_location: 'Berlin', employees_approx: 16000 },
  // Consulting & Services
  { name: 'McKinsey Deutschland', domain: 'mckinsey.de', careers_url: 'https://www.mckinsey.de/karriere', industry: 'Beratung', hq_location: 'Düsseldorf', employees_approx: 3000 },
  { name: 'BCG Deutschland', domain: 'bcg.com', careers_url: 'https://careers.bcg.com', industry: 'Beratung', hq_location: 'München', employees_approx: 2500 },
  { name: 'Deloitte Deutschland', domain: 'deloitte.com', careers_url: 'https://jobs.deloitte.de', industry: 'Beratung', hq_location: 'Düsseldorf', employees_approx: 12000 },
  { name: 'PwC Deutschland', domain: 'pwc.de', careers_url: 'https://karriere.pwc.de', industry: 'Beratung', hq_location: 'Frankfurt', employees_approx: 14000 },
  { name: 'EY Deutschland', domain: 'ey.com', careers_url: 'https://www.ey.com/de_de/careers', industry: 'Beratung', hq_location: 'Stuttgart', employees_approx: 11000 },
  { name: 'KPMG Deutschland', domain: 'kpmg.de', careers_url: 'https://home.kpmg/de/de/home/karriere.html', industry: 'Beratung', hq_location: 'Frankfurt', employees_approx: 14000 },
  { name: 'Accenture Deutschland', domain: 'accenture.com', careers_url: 'https://www.accenture.com/de-de/careers', industry: 'IT-Beratung', hq_location: 'Kronberg', employees_approx: 10000 },
  // Healthcare
  { name: 'Fresenius Medical Care', domain: 'freseniusmedicalcare.com', careers_url: 'https://careers.freseniusmedicalcare.com', industry: 'Gesundheit', hq_location: 'Bad Homburg', employees_approx: 125000 },
  { name: 'BioNTech', domain: 'biontech.de', careers_url: 'https://biontech.de/de/karriere', industry: 'Pharma', hq_location: 'Mainz', employees_approx: 6000 },
  { name: 'Boehringer Ingelheim', domain: 'boehringer-ingelheim.com', careers_url: 'https://www.boehringer-ingelheim.com/de/karriere', industry: 'Pharma', hq_location: 'Ingelheim', employees_approx: 53000 },
  { name: 'B. Braun', domain: 'bbraun.de', careers_url: 'https://www.bbraun.de/de/karriere.html', industry: 'Medizintechnik', hq_location: 'Melsungen', employees_approx: 66000 },
  // IT & Tech Services
  { name: 'T-Systems', domain: 't-systems.com', careers_url: 'https://www.t-systems.com/de/de/karriere', industry: 'IT-Services', hq_location: 'Frankfurt', employees_approx: 28000 },
  { name: 'Capgemini Deutschland', domain: 'capgemini.com', careers_url: 'https://www.capgemini.com/de-de/karriere', industry: 'IT-Beratung', hq_location: 'München', employees_approx: 10000 },
  { name: 'CGI Deutschland', domain: 'cgi.com', careers_url: 'https://www.cgi.com/de/de/karriere', industry: 'IT-Services', hq_location: 'Sulzbach', employees_approx: 5000 },
  { name: 'msg systems', domain: 'msg.group', careers_url: 'https://karriere.msg.group', industry: 'IT-Beratung', hq_location: 'Ismaning', employees_approx: 10000 },
  // Insurance
  { name: 'Talanx', domain: 'talanx.com', careers_url: 'https://www.talanx.com/karriere', industry: 'Versicherung', hq_location: 'Hannover', employees_approx: 24000 },
  { name: 'Ergo', domain: 'ergo.com', careers_url: 'https://www.ergo.com/de/Karriere', industry: 'Versicherung', hq_location: 'Düsseldorf', employees_approx: 40000 },
  { name: 'HUK-Coburg', domain: 'huk.de', careers_url: 'https://www.huk.de/karriere.html', industry: 'Versicherung', hq_location: 'Coburg', employees_approx: 10000 },
  // Logistics & Transport
  { name: 'DB Schenker', domain: 'dbschenker.com', careers_url: 'https://www.dbschenker.com/de-de/karriere', industry: 'Logistik', hq_location: 'Essen', employees_approx: 76000 },
  { name: 'Deutsche Bahn', domain: 'deutschebahn.com', careers_url: 'https://karriere.deutschebahn.com', industry: 'Transport', hq_location: 'Berlin', employees_approx: 340000 },
  { name: 'Lufthansa Group', domain: 'lufthansagroup.com', careers_url: 'https://www.be-lufthansa.com', industry: 'Luftfahrt', hq_location: 'Frankfurt', employees_approx: 109000 },
  // Energy
  { name: 'EnBW', domain: 'enbw.com', careers_url: 'https://www.enbw.com/karriere', industry: 'Energie', hq_location: 'Karlsruhe', employees_approx: 27000 },
  { name: 'Uniper', domain: 'uniper.energy', careers_url: 'https://www.uniper.energy/careers', industry: 'Energie', hq_location: 'Düsseldorf', employees_approx: 7000 },
  { name: 'Vattenfall Deutschland', domain: 'vattenfall.de', careers_url: 'https://careers.vattenfall.com', industry: 'Energie', hq_location: 'Berlin', employees_approx: 20000 },
];

async function seed() {
  console.log(`[Seed] Seeding ${COMPANIES.length} companies...`);
  let count = 0;
  for (const c of COMPANIES) {
    try {
      await upsertCompany(c);
      count++;
    } catch (err: any) {
      console.warn(`[Seed] ✗ ${c.name}: ${err.message?.substring(0, 60)}`);
    }
  }
  console.log(`[Seed] ✅ ${count}/${COMPANIES.length} companies seeded`);
  await pool.end();
}

seed().catch(err => { console.error('[Seed] ❌ Failed:', err); process.exit(1); });
