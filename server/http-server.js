#!/usr/bin/env node

import http from 'http';
import { randomUUID } from 'crypto';
import { URL } from 'url';

import { CacheService } from './cache-service.js';
import { FDATool } from './fda-tool.js';
import { PubMedTool } from './pubmed-tool.js';
import { HealthTopicsTool } from './health-topics-tool.js';
import { ClinicalTrialsTool } from './clinical-trials-tool.js';
import { MedicalTerminologyTool } from './medical-terminology-tool.js';
import { MedRxivTool } from './medrxiv-tool.js';
import { MedicalCalculatorTool } from './medical-calculator-tool.js';
import { NcbiBookshelfTool } from './ncbi-bookshelf-tool.js';
import { DicomTool } from './dicom-tool.js';
import { UsageService } from './usage-service.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const sessionId = randomUUID();

const cacheService = new CacheService(parseInt(process.env.CACHE_TTL) || 86400);
const usageService = new UsageService();

const fdaTool = new FDATool(cacheService);
const pubmedTool = new PubMedTool(cacheService);
const healthTopicsTool = new HealthTopicsTool(cacheService);
const clinicalTrialsTool = new ClinicalTrialsTool(cacheService);
const medicalTerminologyTool = new MedicalTerminologyTool(cacheService);
const medrxivTool = new MedRxivTool(cacheService);
const medicalCalculatorTool = new MedicalCalculatorTool(cacheService);
const ncbiBookshelfTool = new NcbiBookshelfTool(cacheService);
const dicomTool = new DicomTool(cacheService);

function writeJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  // Basic CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(body));
}

async function handleCallTool(name, args) {
  usageService.recordUsage(sessionId, name);

  switch (name) {
    case 'fda_drug_lookup':
      return fdaTool.lookupDrug(args.drug_name, args.search_type);
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


