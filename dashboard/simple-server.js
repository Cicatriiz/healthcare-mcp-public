#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

// Simple in-memory data store for demo
const mockData = {
  shortages: [],
  analytics: {
    status: 'success',
    total_shortages: 0,
    active_count: 0,
    resolved_count: 0
  },
  trends: {
    status: 'success',
    trends: {
      average_duration_days: 0,
      long_running_active: [],
      monthly: [],
      avg_duration_by_category: [],
      manufacturer_risk: [],
      category_breakdown: [],
      cohort_analysis: [],
      longest_resolved: []
    }
  },
  reasons: {
    status: 'success',
    reasons: {
      total_active_shortages: 0,
      categorized: 0,
      summary: [],
      insights: ['No data available yet'],
      top_reason: null
    }
  }
};

function writeJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function serveStaticFile(filePath, res) {
  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // API Routes
    if (pathname.startsWith('/api/dashboard')) {
      const apiPath = pathname.replace('/api/dashboard', '');

      if (apiPath === '/health') {
        return writeJson(res, 200, {
          status: 'ok',
          message: 'Dashboard server running',
          timestamp: new Date().toISOString()
        });
      }

      if (apiPath === '/shortages') {
        return writeJson(res, 200, { status: 'success', shortages: mockData.shortages, total: 0 });
      }

      if (apiPath === '/analytics') {
        return writeJson(res, 200, mockData.analytics);
      }

      if (apiPath === '/trends') {
        return writeJson(res, 200, mockData.trends);
      }

      if (apiPath === '/shortage-reasons') {
        return writeJson(res, 200, mockData.reasons);
      }

      return writeJson(res, 404, { status: 'error', error_message: 'API endpoint not found' });
    }

    // Static file serving
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(PUBLIC_DIR, filePath);
    serveStaticFile(filePath, res);

  } catch (error) {
    console.error('Server error:', error);
    writeJson(res, 500, { status: 'error', error_message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 FDA Drug Shortage Dashboard (DEMO MODE)`);
  console.log(`   Running at: http://localhost:${PORT}/\n`);
  console.log(`📊 Pages:`);
  console.log(`   Trends: http://localhost:${PORT}/trends.html\n`);
  console.log(`⚠️  NOTE: This is a simple demo server with mock data.`);
  console.log(`   For full functionality, use the main MCP server.\n`);
});
