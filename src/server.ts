/**
 * StaffRadar Job Database Server
 * Express server with REST API, cron scheduler, and admin dashboard.
 */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import routes from './api/routes';
import { initScheduler, runAllCollectors } from './scheduler';

const app = express();
const PORT = parseInt(process.env.PORT || '4500');

// Middleware
app.use(cors());
app.use(morgan('short'));
app.use(express.json());

// API Routes
app.use(routes);

// Serve admin dashboard (static files)
// HTML files are in src/dashboard (tsc only compiles .ts)
const dashboardPath = path.join(__dirname, '..', 'src', 'dashboard');
app.use('/admin', express.static(dashboardPath));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  StaffRadar Job Database Server                      ║
║  Port: ${PORT}                                         ║
║  Admin: http://localhost:${PORT}/admin                  ║
║  API:   http://localhost:${PORT}/api/v1/jobs/search     ║
╚══════════════════════════════════════════════════════╝
  `);

  // Initialize cron scheduler
  try {
    await initScheduler();
    console.log('[Server] Scheduler initialized');

    // On first run, collect from all sources
    if (process.env.RUN_ON_START === 'true') {
      console.log('[Server] Running initial collection...');
      runAllCollectors().catch(err => console.error('[Server] Initial collection error:', err));
    }
  } catch (err) {
    console.error('[Server] Scheduler init failed:', err);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Shutting down...');
  process.exit(0);
});
