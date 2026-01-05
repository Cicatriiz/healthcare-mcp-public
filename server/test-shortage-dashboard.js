/**
 * Test Suite for FDA Drug Shortage Dashboard
 *
 * Tests the complete shortage dashboard functionality including:
 * - FDA Shortage Tool
 * - Shortage Service Layer
 * - Dashboard API Endpoints
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { CacheService } from './cache-service.js';
import { FDAShortageTool } from './fda-shortage-tool.js';
import { FDATool } from './fda-tool.js';
import { PubMedTool } from './pubmed-tool.js';
import { HealthTopicsTool } from './health-topics-tool.js';
import { ClinicalTrialsTool } from './clinical-trials-tool.js';
import { MedicalTerminologyTool } from './medical-terminology-tool.js';
import { MedRxivTool } from './medrxiv-tool.js';
import { NcbiBookshelfTool } from './ncbi-bookshelf-tool.js';
import { ShortageService } from './services/shortage-service.js';

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds for API calls

// Initialize services for tests
const cacheService = new CacheService(3600);
const fdaShortageTool = new FDAShortageTool(cacheService);
const fdaTool = new FDATool(cacheService);
const pubmedTool = new PubMedTool(cacheService);
const healthTopicsTool = new HealthTopicsTool(cacheService);
const clinicalTrialsTool = new ClinicalTrialsTool(cacheService);
const medicalTerminologyTool = new MedicalTerminologyTool(cacheService);
const medrxivTool = new MedRxivTool(cacheService);
const ncbiBookshelfTool = new NcbiBookshelfTool(cacheService);

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

// ===== FDA Shortage Tool Tests =====

test('FDAShortageTool - Search all shortages', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Searching all shortages...');

  const result = await fdaShortageTool.searchShortages({
    status: 'all',
    limit: 5
  });

  console.log(`Result status: ${result.status}`);
  console.log(`Total results: ${result.total_results || 0}`);

  assert.strictEqual(result.status, 'success', 'Should return success status');
  assert.ok(Array.isArray(result.shortages), 'Should return array of shortages');

  if (result.shortages.length > 0) {
    const shortage = result.shortages[0];
    console.log(`\nSample shortage:`);
    console.log(`  NDC: ${shortage.ndc}`);
    console.log(`  Generic Name: ${shortage.generic_name}`);
    console.log(`  Manufacturer: ${shortage.manufacturer}`);
    console.log(`  Status: ${shortage.status}`);
    console.log(`  Route: ${shortage.route}`);

    assert.ok(shortage.ndc, 'Shortage should have NDC');
    assert.ok(shortage.generic_name || shortage.brand_name, 'Shortage should have drug name');
    assert.ok(['active', 'resolved'].includes(shortage.status), 'Status should be active or resolved');
  }
});

test('FDAShortageTool - Search active shortages only', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Searching active shortages...');

  const result = await fdaShortageTool.searchShortages({
    status: 'active',
    limit: 10
  });

  assert.strictEqual(result.status, 'success', 'Should return success status');
  console.log(`Active shortages found: ${result.total_results || 0}`);
});

test('FDAShortageTool - Get therapeutic categories', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Getting therapeutic categories...');

  const result = await fdaShortageTool.getTherapeuticCategories();

  assert.strictEqual(result.status, 'success', 'Should return success status');
  assert.ok(Array.isArray(result.categories), 'Should return array of categories');

  console.log(`Categories found: ${result.count || 0}`);
  if (result.categories.length > 0) {
    console.log(`Sample categories: ${result.categories.slice(0, 5).join(', ')}`);
  }
});

test('FDAShortageTool - Get manufacturers', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Getting manufacturers...');

  const result = await fdaShortageTool.getManufacturers();

  assert.strictEqual(result.status, 'success', 'Should return success status');
  assert.ok(Array.isArray(result.manufacturers), 'Should return array of manufacturers');

  console.log(`Manufacturers found: ${result.count || 0}`);
});

test('FDAShortageTool - Get summary stats', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Getting summary statistics...');

  const result = await fdaShortageTool.getSummaryStats();

  assert.strictEqual(result.status, 'success', 'Should return success status');
  assert.ok(typeof result.total_active === 'number', 'Should have total_active');
  assert.ok(typeof result.total_resolved === 'number', 'Should have total_resolved');

  console.log(`Active: ${result.total_active}, Resolved: ${result.total_resolved}, Total: ${result.total_all}`);
});

// ===== Shortage Service Tests =====

test('ShortageService - Fetch shortages', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Fetching shortages via service layer...');

  const result = await shortageService.fetchShortages({
    status: 'active',
    limit: 5
  });

  assert.strictEqual(result.status, 'success', 'Should return success status');
  assert.ok(Array.isArray(result.data), 'Should return data array');
  assert.ok(result.pagination, 'Should include pagination info');

  console.log(`Fetched ${result.data.length} shortages`);
  console.log(`Pagination: page=${result.pagination.limit}, hasMore=${result.pagination.hasMore}`);
});

test('ShortageService - Get analytics', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Getting analytics...');

  const result = await shortageService.getAnalytics();

  assert.strictEqual(result.status, 'success', 'Should return success status');
  assert.ok(result.analytics, 'Should include analytics object');
  assert.ok(result.analytics.summary, 'Should include summary stats');
  assert.ok(Array.isArray(result.analytics.by_category), 'Should include category grouping');
  assert.ok(Array.isArray(result.analytics.by_route), 'Should include route grouping');

  console.log(`Summary: ${JSON.stringify(result.analytics.summary)}`);
  console.log(`Categories: ${result.analytics.by_category.length}`);
  console.log(`Routes: ${result.analytics.by_route.length}`);
});

test('ShortageService - Get geographic distribution', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Getting geographic distribution...');

  const result = await shortageService.getGeographicDistribution();

  assert.strictEqual(result.status, 'success', 'Should return success status');
  assert.ok(Array.isArray(result.distribution), 'Should return distribution array');

  console.log(`Regions found: ${result.total_regions || 0}`);
});

// ===== Integration Tests =====

test('Integration - Search, filter, and get detail', { timeout: TEST_TIMEOUT }, async () => {
  console.log('\n[TEST] Integration test: search -> filter -> detail...');

  // Step 1: Search for shortages
  const searchResult = await shortageService.fetchShortages({
    status: 'active',
    limit: 3
  });

  assert.strictEqual(searchResult.status, 'success', 'Search should succeed');

  if (searchResult.data.length > 0) {
    const shortage = searchResult.data[0];
    console.log(`\nFound shortage: ${shortage.generic_name} (NDC: ${shortage.ndc})`);

    // Step 2: Get detailed info
    const detailResult = await shortageService.getShortageDetail(shortage.ndc);
    assert.strictEqual(detailResult.status, 'success', 'Detail lookup should succeed');

    console.log(`Detail retrieved successfully`);
  } else {
    console.log('No active shortages found for detail test');
  }
});

// ===== Utility Functions Tests =====

test('ShortageService - Group by category', async () => {
  console.log('\n[TEST] Testing groupByCategory function...');

  const mockShortages = [
    { therapeutic_categories: ['Antibiotic', 'Anti-Infective'] },
    { therapeutic_categories: ['Antibiotic'] },
    { therapeutic_categories: ['Chemotherapy'] },
    { therapeutic_categories: [] }
  ];

  const grouped = shortageService.groupByCategory(mockShortages);

  assert.ok(Array.isArray(grouped), 'Should return array');
  assert.ok(grouped.some(g => g.category === 'Antibiotic'), 'Should include Antibiotic category');

  const antibioticGroup = grouped.find(g => g.category === 'Antibiotic');
  assert.strictEqual(antibioticGroup.count, 2, 'Antibiotic should have count of 2');

  console.log(`Grouped into ${grouped.length} categories`);
  console.log(`Sample: ${JSON.stringify(grouped[0])}`);
});

test('ShortageService - Parse geographic info', async () => {
  console.log('\n[TEST] Testing parseGeographicInfo function...');

  const contactInfo1 = '123 Main St, New York, NY 10001, USA';
  const contactInfo2 = '456 Oak Ave, Los Angeles, CA 90001';
  const contactInfo3 = 'No address info';

  const geo1 = shortageService.parseGeographicInfo(contactInfo1);
  const geo2 = shortageService.parseGeographicInfo(contactInfo2);
  const geo3 = shortageService.parseGeographicInfo(contactInfo3);

  assert.ok(geo1, 'Should parse valid address');
  assert.strictEqual(geo1.state, 'NY', 'Should extract state correctly');
  assert.strictEqual(geo1.country, 'USA', 'Should extract country');

  assert.ok(geo2, 'Should parse address without country');
  assert.strictEqual(geo2.state, 'CA', 'Should extract CA state');

  console.log(`Geo1: ${JSON.stringify(geo1)}`);
  console.log(`Geo2: ${JSON.stringify(geo2)}`);
});

// ===== Run Tests Summary =====

console.log('\n' + '='.repeat(70));
console.log('FDA Drug Shortage Dashboard - Test Suite');
console.log('='.repeat(70));
console.log('Testing:');
console.log('  - FDA Shortage Tool (search, filter, metadata)');
console.log('  - Shortage Service Layer (orchestration, analytics)');
console.log('  - Integration flows (search -> detail)');
console.log('  - Utility functions (grouping, parsing)');
console.log('='.repeat(70) + '\n');
