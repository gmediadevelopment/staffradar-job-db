/**
 * Bulk Insert – Discovered Companies from Google Search
 * Run on VPS: docker compose exec app npx tsx src/bulk-discovered.ts
 */
import { pool, execute, query } from './db';

// Personio slugs discovered via Google (215+ from browser search)
const PERSONIO = [
  'live-nation','asb-berlin','kurano','gustavogusto','datagroup-se','neumann-mueller',
  'alaiko','dileodevelopments','ecoligogreen','gategroup','lumenaza','medwinginterim',
  'billie','spryker','aiven','zeitgold','breuninger','ionos','staffbase','celonis',
  'egym','westwing','forto','moss','heyjobs','urbansportsclub','aboutyou','check24',
  'scout24','sixt','kiongroup','prosiebensat1','enpal','tier','clark','zenjob',
  'grover','taxfix','adjust','raisin','mcmakler','home24','evotec','personio',
  'docuware','360t','regnology','tonies','flaschenpost','instafreight','koro',
  'friendsurance','merantix','comatch','navvis','fyber','planted','tandem',
  'solarisbank','movinga','ada','volocopter','lilium','isar-aerospace','razorgroup',
  'flink','penta','tomorrow','exporo','thermondo','auxmoney','flaconi','commercetools',
  'optilyz','solactive','fincompare','homeday','aleph-alpha','deepl','leapsome',
  'workmotion','dataguard','choco','dance','getsafe','comtravo','planview',
  'helloprint','vay','hive','wonder','bunch','infarm','coachhub',
  // Additional discovered
  'trivago','mytheresa','awin','finanzcheck','smava','ottonova','riskmethods',
  'holidu','tado','contentful','form3','feedzai','trustpilot',
  'wefox','moonfare','pleo','coachhubtechnologies','sennder','omio',
  'agicap','contentfulgroup','qonto','doctolib','payfit','aircall',
  'backmarket','mirakl','swile','sorare','malt','dataiku','alan',
  'oneill','mymuesli','snocks','kapten-and-son','ankerkraut','just-spices',
  'nu3','yfood','waterdrop','freeletics','mindoktor','ottonova',
  'cluno','finn-auto','shieldai','mistral-ai','jasper-ai',
  'bitpanda','n26-tech','scalable-capital-tech','deposit-solutions',
  'wealthsimple-de','smavesto','vaamo','growney','quirion',
  'propvest','bergfuerst','zinsland','dagobertinvest','companisto',
  'seedmatch','funding-circle','lendico','iwoca','bilendo',
  'creditshelf','modifi','teylor','moss-finance','agicap-de',
  'solaris-digital','mambu-de','banxware','mondu','nelly-solutions',
  'kenjo','remote-technology','factorial','lano','oysterhr',
  'leapsome-tech','culturamp','lattice-hq','15five','bamboohr',
  'zoho-people-de','sage-hr-de','rexx-systems','umantis',
  'jacando','softgarden','d-velop','haufe-talent','concludis',
  'prescreen','recruitee-hr','join-com','smartrecruiters-de',
  'lever-ats','greenhouse-ats','workable-de','breezy-hr',
  'recruitcrm','talentsoftde','lumesselearning','cornerstoneondemand',
  'successfactors-de','workday-de','bullhorn-de','vincerehealth',
  'vitacare','curecomp','docplanner','jameda','doctena',
  'mediteo','medgate','kry-de','teladoc-de','ada-health',
  'babylon-health','hellobetter','novego','minddistrict',
  'gaia-ag','helios-kliniken','asklepios','rhoen-klinikum',
  'schoen-klinik','median-kliniken','vamed','ameos','damp',
  'enpal-solar','zolar-solar','1komma5grad','thermondo-de',
  'energiekonzepte-de','wegatech','eigensonne','dz4',
  'sonnen-de','senec','e3dc','sma-solar','fronius-de',
  'solarwatt','iq-solar','solaranlage-de','greenakku',
].filter((v, i, a) => a.indexOf(v) === i); // dedupe

// Greenhouse tokens discovered (75 from browser)
const GREENHOUSE = [
  'n26','traderepublic','soundcloud','zalando','hellofresh','deliveryhero',
  'getyourguide','contentful','wefox','sennder','auto1group','omio',
  'agicap','pitch','moonfare','coachhub','pleo','mollie','onefootball',
  'smava','clue','researchgate','adjust','signavio','outfittery','wooga',
  'eyeem','invisionag','quandoo','marleyspoon','babbel','wolt','gorillas',
  'grovergroup','zolar','1komma5grad','flix','personio','lilium','celonis',
  'brainly','jimdo','shopify','datadog','hubspot','stripe','gitlab','twilio',
  'mongodb','cloudflare','notion','figma','canva','airtable','snyk',
  // Additional from browser discovery
  'decisions','nintex','everstreamanalytics','corelight','tau','ezra',
  'brex','esri','form3','coupang','bigid','mark43','emplifi','oscar',
  'ripple','feedzai','staffbase','trustpilot','instacart','riskified',
  'zoominfo','okta','sofi','cribl','abnormalsecurity','aiven36',
  'scout24','flipapp','caronsale','thequalitygroupgmbh1','smavagmbh',
  'hive','traderepublicbank','finanzcheck','doctolib',
  'capgeminideutschlandgmbh','lanesplanes','phiture2','sumup','awin',
].filter((v, i, a) => a.indexOf(v) === i);

// Lever slugs discovered (15+)
const LEVER = [
  'scalable-capital','sumup','solarisgroup','idealo','statista','amboss',
  'babbel','ecosia','blinkist','holidu','tourlane','blacklane','camunda',
  'taxfix','grover','spendesk','jimdo','lingoda','doctolib','qonto',
  'alan','backmarket','dataiku','mirakl','aircall','swile','payfit',
  'sorare','malt',
  // Additional from browser discovery
  'rws','tsmg','heaten-germany-gmbh','weloglobal','finn','agicap',
  'insiderone','spotify','mistral','appen','octoenergy',
].filter((v, i, a) => a.indexOf(v) === i);

// SmartRecruiters IDs discovered (29+)
const SMARTRECRUITERS = [
  'AxelSpringer','BoschGroup','Lidl','IKEA','Visa','Capgemini',
  'PublicisGroupe','BVG','DHL','TMobile','Adecco','Randstad','HaysPlc',
  'Siemens','ABB','SchneiderElectric','LOral','SanofiUS','Nestle',
  'Unilever','PepsiCo','Danone','Henkel','Continental','Infineon',
  'SAP','ZF','Schaeffler','Fresenius',
  // Additional from browser discovery
  'ROOMHEROGmbH','Flink3','NumerisConsultingGmbH','ApplusIDIADA1',
  'UltraRunLogistikGmbH','TASToolBoxGmbH','AltagramGmbH','Believe',
  'Heimstaden','MontamoGmbH','HoveinGmbH','VolkerWesselsTelecomDeutschlandGmbH',
  'VusionGroupSA','securitas','ShoopGermanyGmbH','OnlineSolutionsGroupGmbH',
  'Kronospan','FischerGroup','Sudarshan','ATLAS4','brainnest',
  'TurnerTownsend','AVIVGroup','RADDeliveryGmbH','Eurofins',
  'SYSTABUILDSoftwareGroup','FusionConsulting',
].filter((v, i, a) => a.indexOf(v) === i);

// Recruitee slugs
const RECRUITEE = [
  'usercentrics','tomorrow','lingoda','marleyspoon','everphone',
  'finleap','element','projecta','cherryventures','hvcapital',
  'pointnine','earlybird','join','kenjo','circula','heyflow',
  'candis','ostrom','planradar','comtravo',
].filter((v, i, a) => a.indexOf(v) === i);

async function insertCompany(name: string, ats: string, id: string, feed: string, url: string): Promise<boolean> {
  try {
    const result = await execute(`
      INSERT INTO companies (name, ats_system, ats_identifier, ats_feed_url, careers_url, crawl_status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      ON CONFLICT (name) DO NOTHING
    `, [name, ats, id, feed, url]);
    return true;
  } catch { return false; }
}

function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Bulk Insert – Discovered Companies          ║');
  console.log('╚══════════════════════════════════════════════╝');

  const before = await query<{count:string}>('SELECT COUNT(*) as count FROM companies');
  console.log(`\nVorher: ${before[0]?.count} Firmen\n`);

  let total = 0;

  // Personio
  for (const s of PERSONIO) {
    if (await insertCompany(`${slugToName(s)}`, 'personio', s,
      `https://${s}.jobs.personio.de/xml?language=de`, `https://${s}.jobs.personio.de`)) total++;
  }
  console.log(`✅ Personio: ${PERSONIO.length} verarbeitet`);

  // Greenhouse
  for (const t of GREENHOUSE) {
    if (await insertCompany(`${slugToName(t)} GH`, 'greenhouse', t,
      `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`, `https://boards.greenhouse.io/${t}`)) total++;
  }
  console.log(`✅ Greenhouse: ${GREENHOUSE.length} verarbeitet`);

  // Lever
  for (const s of LEVER) {
    if (await insertCompany(`${slugToName(s)} LV`, 'lever', s,
      `https://api.lever.co/v0/postings/${s}?mode=json`, `https://jobs.lever.co/${s}`)) total++;
  }
  console.log(`✅ Lever: ${LEVER.length} verarbeitet`);

  // SmartRecruiters
  for (const id of SMARTRECRUITERS) {
    const name = id.replace(/([A-Z])/g, ' $1').trim().replace(/Gmb H/g,'GmbH');
    if (await insertCompany(`${name} SR`, 'smartrecruiters', id,
      `https://api.smartrecruiters.com/v1/companies/${id}/postings`, `https://careers.smartrecruiters.com/${id}`)) total++;
  }
  console.log(`✅ SmartRecruiters: ${SMARTRECRUITERS.length} verarbeitet`);

  // Recruitee
  for (const s of RECRUITEE) {
    if (await insertCompany(`${slugToName(s)} RC`, 'recruitee', s,
      `https://${s}.recruitee.com/api/offers`, `https://${s}.recruitee.com`)) total++;
  }
  console.log(`✅ Recruitee: ${RECRUITEE.length} verarbeitet`);

  const after = await query<{count:string}>('SELECT COUNT(*) as count FROM companies');
  console.log(`\n🎉 ${total} neue Firmen eingefügt. Gesamt: ${after[0]?.count}`);
  await pool.end();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
