#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Import API server components from parent directory
const serverDir = path.join(__dirname, '..', 'server');

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

async function loadApiHandlers() {
  // Dynamically import API services
  const { CacheService } = await import('../server/cache-service.js');
  const { ShortageService } = await import('../server/services/shortage-service.js');

  const cacheService = new CacheService(86400);
  const shortageService = new ShortageService(cacheService);

  return { cacheService, shortageService };
}

const { cacheService, shortageService } = await loadApiHandlers();

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
  // Handle CORS preflight
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
          uptime_seconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString()
        });
      }

      if (apiPath === '/shortages') {
        const filters = {
          status: url.searchParams.get('status') || 'all',
          therapeutic_category: url.searchParams.get('therapeutic_category') || undefined,
          manufacturer: url.searchParams.get('manufacturer') || undefined
        };
        const result = await shortageService.getShortages(filters);
        return writeJson(res, 200, result);
      }

      if (apiPath === '/analytics') {
        const result = await shortageService.getAnalytics();
        return writeJson(res, 200, result);
      }

      if (apiPath === '/trends') {
        const result = await shortageService.getTemporalTrends();
        return writeJson(res, 200, result);
      }

      if (apiPath === '/shortage-reasons') {
        const result = await shortageService.getShortageReasons();
        return writeJson(res, 200, result);
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
  console.log(`\n🚀 FDA Drug Shortage Dashboard running at http://localhost:${PORT}/`);
  console.log(`\n📊 Dashboard pages:`);
  console.log(`   Main:       http://localhost:${PORT}/index.html`);
  console.log(`   Analytics:  http://localhost:${PORT}/analytics.html`);
  console.log(`   Trends:     http://localhost:${PORT}/trends.html`);
  console.log(`   Map:        http://localhost:${PORT}/map.html`);
  console.log(`\n🔌 API endpoints available at /api/dashboard/*\n`);
});
