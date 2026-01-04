#!/usr/bin/env node

/**
 * FDA Drug Shortage Intelligence Dashboard Server
 *
 * Dedicated HTTP/REST API server for the shortage dashboard web application.
 * Runs on port 3001 (separate from general MCP HTTP server on port 3000).
 *
 * Provides endpoints for:
 * - Shortage list with search/filtering
 * - Shortage detail with enrichment
 * - Analytics and trends
 * - Geographic distribution
 * - Metadata (categories, manufacturers)
 */

import http from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';

// Services and tools
import { CacheService } from './cache-service.js';
import { FDATool } from './fda-tool.js';
import { FDAShortageTool } from './fda-shortage-tool.js';
import { PubMedTool } from './pubmed-tool.js';
import { HealthTopicsTool } from './health-topics-tool.js';
import { ClinicalTrialsTool } from './clinical-trials-tool.js';
import { MedicalTerminologyTool } from './medical-terminology-tool.js';
import { MedRxivTool } from './medrxiv-tool.js';
import { NcbiBookshelfTool } from './ncbi-bookshelf-tool.js';
import { UsageService } from './usage-service.js';
import { ShortageService } from './services/shortage-service.js';

const PORT = parseInt(process.env.DASHBOARD_PORT || '3001', 10);
const sessionId = randomUUID();

// Initialize services
const cacheService = new CacheService(parseInt(process.env.CACHE_TTL) || 86400);
const usageService = new UsageService();

// Initialize MCP tools
const fdaTool = new FDATool(cacheService);
const fdaShortageTool = new FDAShortageTool(cacheService);
const pubmedTool = new PubMedTool(cacheService);
const healthTopicsTool = new HealthTopicsTool(cacheService);
const clinicalTrialsTool = new ClinicalTrialsTool(cacheService);
const medicalTerminologyTool = new MedicalTerminologyTool(cacheService);
const medrxivTool = new MedRxivTool(cacheService);
const ncbiBookshelfTool = new NcbiBookshelfTool(cacheService);

// Initialize shortage service with all tools
const shortageService = new ShortageService(
  {
    fdaShortage: fdaShortageTool,
    fdaDrug: fdaTool,
    pubmed: pubmedTool,
    healthTopics: healthTopicsTool,
    clinicalTrials: clinicalTrialsTool,
    medicalTerminology: medicalTerminologyTool,
    medrxiv: medrxivTool,
    ncbiBookshelf: ncbiBookshelfTool
  },
  cacheService
);

/**
 * Write JSON response with CORS headers
 */
function writeJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(body, null, 2));
}

/**
 * Parse query parameters into typed values
 */
function parseQueryParams(url) {
  return {
    query: url.searchParams.get('q') || url.searchParams.get('query') || undefined,
    status: url.searchParams.get('status') || 'all',
    therapeutic_category: url.searchParams.get('therapeutic_category') || url.searchParams.get('category') || undefined,
    dosage_form: url.searchParams.get('dosage_form') || url.searchParams.get('form') || undefined,
    route: url.searchParams.get('route') || undefined,
    company_name: url.searchParams.get('company_name') || url.searchParams.get('manufacturer') || undefined,
    page: parseInt(url.searchParams.get('page') || '1', 10),
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    sort: url.searchParams.get('sort') || 'initial_posting_date:desc'
  };
}

/**
 * Main HTTP server
 */
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  console.error(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  try {
    // Health check
    if (req.method === 'GET' && pathname === '/api/dashboard/health') {
      usageService.recordUsage(sessionId, 'dashboard_health');
      return writeJson(res, 200, {
        status: 'ok',
        service: 'fda-shortage-dashboard',
        version: '1.0.0',
        session_id: sessionId,
        cache_ttl_seconds: cacheService.cache.options.stdTTL,
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    }

    // Get shortage list with search/filter
    if (req.method === 'GET' && pathname === '/api/dashboard/shortages') {
      usageService.recordUsage(sessionId, 'dashboard_shortages_list');

      const params = parseQueryParams(url);

      // Convert page to skip for API
      const skip = (params.page - 1) * params.limit;

      const result = await shortageService.fetchShortages({
        query: params.query,
        status: params.status,
        therapeutic_category: params.therapeutic_category,
        dosage_form: params.dosage_form,
        company_name: params.company_name,
        limit: params.limit,
        skip: skip,
        sort: params.sort
      });

      if (result.status === 'success') {
        return writeJson(res, 200, {
          status: 'success',
          data: result.data,
          pagination: {
            page: params.page,
            limit: params.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / params.limit),
            hasNext: result.pagination.hasMore,
            hasPrev: params.page > 1
          },
          filters: {
            query: params.query,
            status: params.status,
            therapeutic_category: params.therapeutic_category,
            dosage_form: params.dosage_form,
            manufacturer: params.company_name
          }
        });
      } else {
        return writeJson(res, 500, result);
      }
    }

    // Get shortage detail with enrichment
    if (req.method === 'GET' && pathname.match(/^\/api\/dashboard\/shortages\/(.+)$/)) {
      usageService.recordUsage(sessionId, 'dashboard_shortage_detail');

      const ndc = pathname.split('/').pop();
      const includeEnrichment = url.searchParams.get('enrich') !== 'false'; // Default: true

      // First get the shortage detail
      const detailResult = await shortageService.getShortageDetail(ndc);

      if (detailResult.status === 'error') {
        return writeJson(res, 404, detailResult);
      }

      // If enrichment requested, enrich the shortage
      if (includeEnrichment && detailResult.shortage) {
        const enrichedResult = await shortageService.enrichShortage(detailResult.shortage);

        if (enrichedResult.status === 'success') {
          return writeJson(res, 200, enrichedResult);
        } else {
          // Return basic shortage even if enrichment fails
          return writeJson(res, 200, detailResult);
        }
      }

      return writeJson(res, 200, detailResult);
    }

    // Get analytics and aggregated statistics
    if (req.method === 'GET' && pathname === '/api/dashboard/analytics') {
      usageService.recordUsage(sessionId, 'dashboard_analytics');

      const result = await shortageService.getAnalytics();
      return writeJson(res, 200, result);
    }

    // Get geographic distribution
    if (req.method === 'GET' && pathname === '/api/dashboard/map') {
      usageService.recordUsage(sessionId, 'dashboard_map');

      const result = await shortageService.getGeographicDistribution();
      return writeJson(res, 200, result);
    }

    // Get available therapeutic categories (for filter dropdowns)
    if (req.method === 'GET' && pathname === '/api/dashboard/therapeutic-classes') {
      usageService.recordUsage(sessionId, 'dashboard_categories');

      const result = await fdaShortageTool.getTherapeuticCategories();
      return writeJson(res, 200, result);
    }

    // Get available manufacturers (for filter dropdowns)
    if (req.method === 'GET' && pathname === '/api/dashboard/manufacturers') {
      usageService.recordUsage(sessionId, 'dashboard_manufacturers');

      const result = await fdaShortageTool.getManufacturers();
      return writeJson(res, 200, result);
    }

    // Get summary statistics
    if (req.method === 'GET' && pathname === '/api/dashboard/stats') {
      usageService.recordUsage(sessionId, 'dashboard_stats');

      const result = await fdaShortageTool.getSummaryStats();
      return writeJson(res, 200, result);
    }

    // Get usage statistics
    if (req.method === 'GET' && pathname === '/api/dashboard/usage') {
      const result = usageService.getSessionUsage(sessionId);
      return writeJson(res, 200, result);
    }

    // API documentation / available endpoints
    if (req.method === 'GET' && pathname === '/api/dashboard') {
      return writeJson(res, 200, {
        service: 'FDA Drug Shortage Intelligence Dashboard API',
        version: '1.0.0',
        endpoints: [
          {
            method: 'GET',
            path: '/api/dashboard/health',
            description: 'Health check and server status'
          },
          {
            method: 'GET',
            path: '/api/dashboard/shortages',
            description: 'List shortages with search and filtering',
            query_params: {
              q: 'Search query (drug name, NDC)',
              status: 'active | resolved | all (default: all)',
              therapeutic_category: 'Filter by therapeutic category',
              dosage_form: 'Filter by dosage form',
              manufacturer: 'Filter by manufacturer name',
              page: 'Page number (default: 1)',
              limit: 'Results per page (default: 20, max: 100)',
              sort: 'Sort field:direction (default: initial_posting_date:desc)'
            }
          },
          {
            method: 'GET',
            path: '/api/dashboard/shortages/:ndc',
            description: 'Get detailed shortage information with enrichment',
            query_params: {
              enrich: 'Include enrichment from PubMed, Health.gov, etc. (default: true)'
            }
          },
          {
            method: 'GET',
            path: '/api/dashboard/analytics',
            description: 'Get analytics and aggregated statistics'
          },
          {
            method: 'GET',
            path: '/api/dashboard/map',
            description: 'Get geographic distribution of shortages'
          },
          {
            method: 'GET',
            path: '/api/dashboard/therapeutic-classes',
            description: 'Get list of available therapeutic categories'
          },
          {
            method: 'GET',
            path: '/api/dashboard/manufacturers',
            description: 'Get list of manufacturers with shortages'
          },
          {
            method: 'GET',
            path: '/api/dashboard/stats',
            description: 'Get summary statistics (active, resolved counts)'
          },
          {
            method: 'GET',
            path: '/api/dashboard/usage',
            description: 'Get API usage statistics for this session'
          }
        ],
        data_source: 'openFDA Drug Shortages API',
        documentation: 'https://github.com/Jerempire/healthcare-mcp-public'
      });
    }

    // 404 - Not Found
    return writeJson(res, 404, {
      status: 'error',
      error_message: 'Endpoint not found',
      available_endpoints: '/api/dashboard for API documentation'
    });

  } catch (error) {
    console.error(`[ERROR] ${error.stack || error.message}`);
    return writeJson(res, 500, {
      status: 'error',
      error_message: error.message,
      type: error.name
    });
  }
});

// Start server
server.listen(PORT, () => {
  console.error('='.repeat(70));
  console.error('FDA Drug Shortage Intelligence Dashboard Server');
  console.error('='.repeat(70));
  console.error(`Server listening: http://localhost:${PORT}`);
  console.error(`API documentation: http://localhost:${PORT}/api/dashboard`);
  console.error(`Health check: http://localhost:${PORT}/api/dashboard/health`);
  console.error(`Session ID: ${sessionId}`);
  console.error(`Cache TTL: ${cacheService.cache.options.stdTTL} seconds`);
  console.error(`Started: ${new Date().toISOString()}`);
  console.error('='.repeat(70));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.error('\n[SIGTERM] Shutting down gracefully...');
  server.close(() => {
    console.error('[SIGTERM] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.error('\n[SIGINT] Shutting down gracefully...');
  server.close(() => {
    console.error('[SIGINT] Server closed');
    process.exit(0);
  });
});
