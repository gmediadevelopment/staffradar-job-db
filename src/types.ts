/**
 * Core type definitions for the Job Database
 */

export interface Job {
  id: string;
  external_id?: string;
  source: string;
  source_url?: string;

  title: string;
  company: string;
  location?: string;
  description?: string;
  requirements?: string[];

  employment_type?: string;
  contract_type?: string;
  salary_min?: number;
  salary_max?: number;
  remote_type?: string;

  skills: Skill[];
  category?: string;
  industry?: string;

  dedup_hash: string;

  published_at?: string;
  expires_at?: string;
  first_seen_at: string;
  last_seen_at: string;
  last_updated_at: string;

  status: 'active' | 'expired' | 'removed';
  is_verified: boolean;
}

export interface Skill {
  name: string;
  level?: string;
}

export interface CrawlerRun {
  id: string;
  source: string;
  started_at: string;
  finished_at?: string;
  status: 'running' | 'success' | 'failed' | 'partial';
  jobs_found: number;
  jobs_new: number;
  jobs_updated: number;
  jobs_expired: number;
  error_message?: string;
  metadata?: Record<string, any>;
}

export interface CrawlerConfig {
  id: string;
  source: string;
  enabled: boolean;
  schedule: string;
  config: Record<string, any>;
  last_run_at?: string;
  next_run_at?: string;
}

// Interface that every collector/crawler must implement
export interface Collector {
  name: string;
  source: string;
  collect(): Promise<CollectorResult>;
}

export interface CollectorResult {
  jobs: Omit<Job, 'id' | 'dedup_hash' | 'first_seen_at' | 'last_seen_at' | 'last_updated_at' | 'status' | 'is_verified'>[];
  totalAvailable?: number;
  errors: string[];
}

export interface SearchParams {
  q?: string;
  location?: string;
  radius?: number;
  skills?: string[];
  source?: string;
  published_after?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
}

export interface DashboardStats {
  total_jobs: number;
  active_jobs: number;
  new_today: number;
  sources: { source: string; count: number; last_run?: string; status?: string }[];
  jobs_by_day: { date: string; count: number }[];
}
