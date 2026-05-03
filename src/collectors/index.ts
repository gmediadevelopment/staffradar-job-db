/**
 * Collector Registry – central management of all data sources
 */
import { BACollector } from './ba';
import { AdzunaCollector } from './adzuna';
import { JoobleCollector } from './jooble';
import { CareerJetCollector } from './careerjet';
import { ArbeitnowCollector } from './arbeitnow';
import { GoogleJobsCollector } from './google_jobs';
import {
  CareerPersonioCollector,
  CareerGreenhouseCollector,
  CareerLeverCollector,
  CareerSmartRecruitersCollector,
  CareerRecruiteeCollector,
} from './career_sites';
import type { Collector } from '../types';

// Registry of all available collectors
const collectors: Record<string, Collector> = {
  ba: new BACollector(),
  adzuna: new AdzunaCollector(),
  jooble: new JoobleCollector(),
  careerjet: new CareerJetCollector(),
  arbeitnow: new ArbeitnowCollector(),
  google_jobs: new GoogleJobsCollector(),
  // Career site crawlers (per ATS)
  career_personio: CareerPersonioCollector,
  career_greenhouse: CareerGreenhouseCollector,
  career_lever: CareerLeverCollector,
  career_smartrecruiters: CareerSmartRecruitersCollector,
  career_recruitee: CareerRecruiteeCollector,
};

export function getCollector(source: string): Collector | undefined {
  return collectors[source];
}

export function getAllCollectors(): Collector[] {
  return Object.values(collectors);
}

export function getCollectorNames(): string[] {
  return Object.keys(collectors);
}

