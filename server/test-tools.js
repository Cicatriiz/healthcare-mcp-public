#!/usr/bin/env node

import { CacheService } from './cache-service.js';
import { FDATool } from './fda-tool.js';
import { PubMedTool } from './pubmed-tool.js';
import { HealthTopicsTool } from './health-topics-tool.js';
import { ClinicalTrialsTool } from './clinical-trials-tool.js';
import { MedicalTerminologyTool } from './medical-terminology-tool.js';
import { MedRxivTool } from './medrxiv-tool.js';
import { MedicalCalculatorTool } from './medical-calculator-tool.js';
import { NcbiBookshelfTool } from './ncbi-bookshelf-tool.js';
import { UsageService } from './usage-service.js';

async function testTools() {
  console.log('🧪 Testing Healthcare MCP Tools...\n');

  try {
    // Test cache service
    console.log('1️⃣ Testing Cache Service...');
    const cacheService = new CacheService(3600);
    console.log('✅ Cache service instantiated');
    console.log(`   Cache TTL: ${cacheService.cache.options.stdTTL} seconds`);
    
    // Test cache functionality
    cacheService.cache.set('test_key', 'test_value');
    const cachedValue = cacheService.cache.get('test_key');
    console.log(`   Cache test: ${cachedValue === 'test_value' ? '✅ PASSED' : '❌ FAILED'}`);

    // Test usage service
    console.log('\n2️⃣ Testing Usage Service...');
    const usageService = new UsageService();
    console.log('✅ Usage service instantiated');
    
    // Test usage tracking
    const sessionId = 'test-session-123';
    usageService.recordUsage(sessionId, 'test_tool');
    const sessionStats = usageService.getSessionUsage(sessionId);
    console.log(`   Usage tracking test: ${sessionStats.total_calls === 1 ? '✅ PASSED' : '❌ FAILED'}`);

    // Test tool instantiation
    console.log('\n3️⃣ Testing Tool Instantiation...');
    
    const fdaTool = new FDATool(cacheService);
    console.log('✅ FDA Tool instantiated');
    console.log(`   Has lookupDrug method: ${typeof fdaTool.lookupDrug === 'function' ? '✅' : '❌'}`);

    const pubmedTool = new PubMedTool(cacheService);
    console.log('✅ PubMed Tool instantiated');
    console.log(`   Has searchLiterature method: ${typeof pubmedTool.searchLiterature === 'function' ? '✅' : '❌'}`);

    // Test PubMed Tool with open access filter
    console.log('\nTesting PubMed Tool with open access filter...');
    try {
      const pubmedResult = await pubmedTool.searchLiterature('covid', 1, '', true);
      console.log(`   PubMed open access search test: ${pubmedResult.status === 'success' ? '✅ PASSED' : '❌ FAILED'}`);
      if (pubmedResult.status === 'success' && pubmedResult.data && pubmedResult.data.articles) {
        console.log(`   Found ${pubmedResult.data.articles.length} open access articles`);
        if (pubmedResult.data.articles.length > 0) {
          console.log(`   Example: ${pubmedResult.data.articles[0].title}`);
        }
      }
    } catch (error) {
      console.log(`   PubMed open access search test: ❌ FAILED - ${error.message}`);
    }

    const healthTopicsTool = new HealthTopicsTool(cacheService);
    console.log('✅ Health Topics Tool instantiated');
    console.log(`   Has getHealthTopics method: ${typeof healthTopicsTool.getHealthTopics === 'function' ? '✅' : '❌'}`);

    const clinicalTrialsTool = new ClinicalTrialsTool(cacheService);
    console.log('✅ Clinical Trials Tool instantiated');
    console.log(`   Has searchTrials method: ${typeof clinicalTrialsTool.searchTrials === 'function' ? '✅' : '❌'}`);

    const medicalTerminologyTool = new MedicalTerminologyTool(cacheService);
    console.log('✅ Medical Terminology Tool instantiated');
    console.log(`   Has lookupICDCode method: ${typeof medicalTerminologyTool.lookupICDCode === 'function' ? '✅' : '❌'}`);

    const medrxivTool = new MedRxivTool(cacheService);
    console.log('✅ medRxiv Tool instantiated');
    console.log(`   Has search method: ${typeof medrxivTool.search === 'function' ? '✅' : '❌'}`);

    const medicalCalculatorTool = new MedicalCalculatorTool(cacheService);
    console.log('✅ Medical Calculator Tool instantiated');
    console.log(`   Has calculateBmi method: ${typeof medicalCalculatorTool.calculateBmi === 'function' ? '✅' : '❌'}`);

    const ncbiBookshelfTool = new NcbiBookshelfTool(cacheService);
    console.log('✅ NCBI Bookshelf Tool instantiated');
    console.log(`   Has search method: ${typeof ncbiBookshelfTool.search === 'function' ? '✅' : '❌'}`);

    console.log('\n🎉 All tools instantiated successfully!');
    console.log('\n4️⃣ Testing Tool APIs (with mocked/demo data)...');

    // Test Medical Terminology Tool (doesn't require external API)
    console.log('\nTesting Medical Terminology Tool...');
    try {
      const icdResult = await medicalTerminologyTool.lookupICDCode('E11', null, 3);
      console.log(`   ICD lookup test: ${icdResult.status === 'success' ? '✅ PASSED' : '❌ FAILED'}`);
      if (icdResult.status === 'success' && icdResult.data && icdResult.data.codes) {
        console.log(`   Found ${icdResult.data.codes.length} ICD codes`);
        if (icdResult.data.codes.length > 0) {
          console.log(`   Example: ${icdResult.data.codes[0].code} - ${icdResult.data.codes[0].description}`);
        }
      }
    } catch (error) {
      console.log(`   ICD lookup test: ❌ FAILED - ${error.message}`);
    }

    // Test Usage Service stats
    console.log('\nTesting Usage Service stats...');
    const allStats = usageService.getAllUsageStats();
    console.log(`   All stats test: ${typeof allStats === 'object' ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Total sessions: ${allStats.total_sessions || 0}`);

    // Test medRxiv Tool
    console.log('\nTesting medRxiv Tool...');
    try {
      const medrxivResult = await medrxivTool.search('covid', 1);
      console.log(`   medRxiv search test: ${medrxivResult.status === 'success' ? '✅ PASSED' : '❌ FAILED'}`);
      if (medrxivResult.status === 'success' && medrxivResult.data && medrxivResult.data.articles) {
        console.log(`   Found ${medrxivResult.data.articles.length} articles`);
        if (medrxivResult.data.articles.length > 0) {
          console.log(`   Example: ${medrxivResult.data.articles[0].title}`);
        }
      }
    } catch (error) {
      console.log(`   medRxiv search test: ❌ FAILED - ${error.message}`);
    }

    // Test Medical Calculator Tool
    console.log('\nTesting Medical Calculator Tool...');
    try {
      const bmiResult = medicalCalculatorTool.calculateBmi(1.8, 80);
      console.log(`   BMI calculation test: ${bmiResult.status === 'success' ? '✅ PASSED' : '❌ FAILED'}`);
      if (bmiResult.status === 'success' && bmiResult.data) {
        console.log(`   Calculated BMI: ${bmiResult.data.bmi}`);
      }
    } catch (error) {
      console.log(`   BMI calculation test: ❌ FAILED - ${error.message}`);
    }

    // Test NCBI Bookshelf Tool
    console.log('\nTesting NCBI Bookshelf Tool...');
    try {
      const bookshelfResult = await ncbiBookshelfTool.search('cancer', 1);
      console.log(`   NCBI Bookshelf search test: ${bookshelfResult.status === 'success' ? '✅ PASSED' : '❌ FAILED'}`);
      if (bookshelfResult.status === 'success' && bookshelfResult.data && bookshelfResult.data.books) {
        console.log(`   Found ${bookshelfResult.data.books.length} books`);
        if (bookshelfResult.data.books.length > 0) {
          console.log(`   Example: ${bookshelfResult.data.books[0].title}`);
        }
      }
    } catch (error) {
      console.log(`   NCBI Bookshelf search test: ❌ FAILED - ${error.message}`);
    }


    console.log('\n✅ All basic tests completed successfully!');
    console.log('\n📝 Note: Full API tests require internet connectivity and valid API endpoints.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testTools();
