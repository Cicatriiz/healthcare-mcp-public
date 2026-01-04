#!/usr/bin/env node

import http from 'http';
import { randomUUID } from 'crypto';
import { URL } from 'url';

import { CacheService } from './cache-service.js';
import { FDATool } from './fda-tool.js';
import { FDAShortageTool } from './fda-shortage-tool.js';
import { PubMedTool } from './pubmed-tool.js';
import { HealthTopicsTool } from './health-topics-tool.js';
import { ClinicalTrialsTool } from './clinical-trials-tool.js';
import { MedicalTerminologyTool } from './medical-terminology-tool.js';
import { MedRxivTool } from './medrxiv-tool.js';
import { MedicalCalculatorTool } from './medical-calculator-tool.js';
import { NcbiBookshelfTool } from './ncbi-bookshelf-tool.js';
import { DicomTool } from './dicom-tool.js';
import { UsageService } from './usage-service.js';
import { ShortageService } from './services/shortage-service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const sessionId = randomUUID();

const cacheService = new CacheService(parseInt(process.env.CACHE_TTL) || 86400);
const usageService = new UsageService();

const fdaTool = new FDATool(cacheService);
const fdaShortageTool = new FDAShortageTool(cacheService);
const pubmedTool = new PubMedTool(cacheService);
const healthTopicsTool = new HealthTopicsTool(cacheService);
const clinicalTrialsTool = new ClinicalTrialsTool(cacheService);
const medicalTerminologyTool = new MedicalTerminologyTool(cacheService);
const medrxivTool = new MedRxivTool(cacheService);
const medicalCalculatorTool = new MedicalCalculatorTool(cacheService);
const ncbiBookshelfTool = new NcbiBookshelfTool(cacheService);
const dicomTool = new DicomTool(cacheService);

// Initialize Shortage Service with all tools
const shortageService = new ShortageService({
  fdaShortage: fdaShortageTool,
  fdaDrug: fdaTool,
  pubmed: pubmedTool,
  healthTopics: healthTopicsTool,
  clinicalTrials: clinicalTrialsTool,
  medicalTerminology: medicalTerminologyTool,
  medrxiv: medrxivTool,
  ncbiBookshelf: ncbiBookshelfTool
}, cacheService);

const DASHBOARD_PUBLIC = path.join(__dirname, '..', 'dashboard', 'public');
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function writeJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  // Basic CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(body));
}

function serveStaticFile(filePath, res) {
  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        writeJson(res, 404, { status: 'error', error_message: 'File not found' });
      } else {
        writeJson(res, 500, { status: 'error', error_message: `Server error: ${err.code}` });
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content, 'utf-8');
    }
  });
}

async function handleCallTool(name, args) {
  usageService.recordUsage(sessionId, name);

  switch (name) {
    case 'fda_drug_lookup':
      return fdaTool.lookupDrug(args.drug_name, args.search_type);
    case 'fda_shortage_search':
      return fdaShortageTool.searchShortages(args);
    case 'pubmed_search':
      return pubmedTool.searchLiterature(args.query, args.max_results, args.date_range, args.open_access);
    case 'medrxiv_search':
      return medrxivTool.search(args.query, args.max_results);
    case 'calculate_bmi':
      return medicalCalculatorTool.calculateBmi(args.height_meters, args.weight_kg);
    case 'ncbi_bookshelf_search':
      return ncbiBookshelfTool.search(args.query, args.max_results);
    case 'extract_dicom_metadata':
      return dicomTool.extractMetadata(args.file_path);
    case 'health_topics':
      return healthTopicsTool.getHealthTopics(args.topic, args.language);
    case 'clinical_trials_search':
      return clinicalTrialsTool.searchTrials(args.condition, args.status, args.max_results);
    case 'lookup_icd_code':
      return medicalTerminologyTool.lookupICDCode(args.code, args.description, args.max_results);
    case 'get_usage_stats':
      return usageService.getSessionUsage(sessionId);
    case 'get_all_usage_stats':
      return usageService.getAllUsageStats();
    default:
      return { status: 'error', error_message: `Unknown tool: ${name}` };
  }
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return writeJson(res, 200, {
        status: 'ok',
        session_id: sessionId,
        cache_ttl_seconds: cacheService.cache.options.stdTTL,
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    }

    if (req.method === 'GET' && pathname === '/api/fda') {
      const drugName = url.searchParams.get('drug_name') || '';
      const searchType = url.searchParams.get('search_type') || 'general';
      const result = await fdaTool.lookupDrug(drugName, searchType);
      return writeJson(res, 200, result);
    }

    if (req.method === 'GET' && pathname === '/api/fda_shortages') {
      const params = {
        query: url.searchParams.get('query') || undefined,
        status: url.searchParams.get('status') || 'all',
        therapeutic_category: url.searchParams.get('therapeutic_category') || undefined,
        dosage_form: url.searchParams.get('dosage_form') || undefined,
        company_name: url.searchParams.get('company_name') || undefined,
        limit: parseInt(url.searchParams.get('limit') || '20', 10),
        skip: parseInt(url.searchParams.get('skip') || '0', 10),
        sort: url.searchParams.get('sort') || 'initial_posting_date:desc'
      };
      const result = await fdaShortageTool.searchShortages(params);
      return writeJson(res, 200, result);
    }

    if (req.method === 'GET' && pathname === '/api/pubmed') {
      const query = url.searchParams.get('query') || '';
      const maxResults = url.searchParams.get('max_results') || 5;
      const dateRange = url.searchParams.get('date_range') || '';
      const openAccess = (url.searchParams.get('open_access') || 'false') === 'true';
      const result = await pubmedTool.searchLiterature(query, maxResults, dateRange, openAccess);
      return writeJson(res, 200, result);
    }

    if (req.method === 'GET' && pathname === '/api/health_finder') {
      const topic = url.searchParams.get('topic') || '';
      const language = url.searchParams.get('language') || 'en';
      const result = await healthTopicsTool.getHealthTopics(topic, language);
      return writeJson(res, 200, result);
    }

    if (req.method === 'GET' && pathname === '/api/clinical_trials') {
      const condition = url.searchParams.get('condition') || '';
      const status = url.searchParams.get('status') || 'recruiting';
      const maxResults = url.searchParams.get('max_results') || 10;
      const result = await clinicalTrialsTool.searchTrials(condition, status, maxResults);
      return writeJson(res, 200, result);
    }

    if (req.method === 'GET' && pathname === '/api/medical_terminology') {
      const code = url.searchParams.get('code') || '';
      const description = url.searchParams.get('description') || '';
      const maxResults = url.searchParams.get('max_results') || 10;
      const result = await medicalTerminologyTool.lookupICDCode(code, description, maxResults);
      return writeJson(res, 200, result);
    }

    if (req.method === 'POST' && pathname === '/mcp/call-tool') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const name = parsed.name;
          const args = parsed.arguments || {};
          const result = await handleCallTool(name, args);
          return writeJson(res, 200, result);
        } catch (err) {
          return writeJson(res, 400, { status: 'error', error_message: `Invalid JSON body: ${err.message}` });
        }
      });
      return;
    }

    // Dashboard API Endpoints
    if (pathname.startsWith('/api/dashboard')) {
      const dashboardPath = pathname.replace('/api/dashboard', '');

      if (dashboardPath === '/health') {
        return writeJson(res, 200, {
          status: 'ok',
          session_id: sessionId,
          uptime_seconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString()
        });
      }

      if (dashboardPath === '/trends') {
        const result = await shortageService.getTemporalTrends();
        return writeJson(res, 200, result);
      }

      if (dashboardPath === '/shortage-reasons') {
        const result = await shortageService.getShortageReasons();
        return writeJson(res, 200, result);
      }

      if (dashboardPath === '/shortages') {
        const filters = {
          status: url.searchParams.get('status') || 'all',
          therapeutic_category: url.searchParams.get('therapeutic_category'),
          manufacturer: url.searchParams.get('manufacturer')
        };
        const result = await shortageService.getShortages(filters);
        return writeJson(res, 200, result);
      }

      if (dashboardPath.startsWith('/shortages/')) {
        const ndc = dashboardPath.replace('/shortages/', '');
        const enrich = url.searchParams.get('enrich') === 'true';
        const result = await shortageService.getShortageDetailEnriched(ndc, enrich);
        return writeJson(res, 200, result);
      }

      if (dashboardPath === '/analytics') {
        const result = await shortageService.getAnalytics();
        return writeJson(res, 200, result);
      }

      if (dashboardPath === '/map') {
        const result = await shortageService.getGeographicDistribution();
        return writeJson(res, 200, result);
      }

      if (dashboardPath === '/stats') {
        const result = await shortageService.getStats();
        return writeJson(res, 200, result);
      }

      if (dashboardPath === '/therapeutic-classes') {
        const result = await shortageService.getTherapeuticCategories();
        return writeJson(res, 200, result);
      }

      if (dashboardPath === '/manufacturers') {
        const result = await shortageService.getManufacturers();
        return writeJson(res, 200, result);
      }
    }

    // Serve dashboard static files
    if (!pathname.startsWith('/api') && !pathname.startsWith('/mcp')) {
      let filePath = pathname === '/' ? '/index.html' : pathname;
      filePath = path.join(DASHBOARD_PUBLIC, filePath);
      return serveStaticFile(filePath, res);
    }

    writeJson(res, 404, { status: 'error', error_message: 'Not Found' });
  } catch (error) {
    console.error('HTTP handler error:', error);
    writeJson(res, 500, { status: 'error', error_message: error.message });
  }
});

server.listen(PORT, () => {
  console.error(`Healthcare MCP HTTP server listening on http://localhost:${PORT}`);
  console.error(`Session ID: ${sessionId}`);
  console.error(`Cache TTL: ${cacheService.cache.options.stdTTL} seconds`);
});


