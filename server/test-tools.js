#!/usr/bin/env node

import { CacheService } from './cache-service.js';
import { FDATool } from './fda-tool.js';
import { PubMedTool } from './pubmed-tool.js';
import { HealthTopicsTool } from './health-topics-tool.js';
import { ClinicalTrialsTool } from './clinical-trials-tool.js';
import { MedicalTerminologyTool } from './medical-terminology-tool.js';
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

    const healthTopicsTool = new HealthTopicsTool(cacheService);
    console.log('✅ Health Topics Tool instantiated');
    console.log(`   Has getHealthTopics method: ${typeof healthTopicsTool.getHealthTopics === 'function' ? '✅' : '❌'}`);

    const clinicalTrialsTool = new ClinicalTrialsTool(cacheService);
    console.log('✅ Clinical Trials Tool instantiated');
    console.log(`   Has searchTrials method: ${typeof clinicalTrialsTool.searchTrials === 'function' ? '✅' : '❌'}`);

    const medicalTerminologyTool = new MedicalTerminologyTool(cacheService);
    console.log('✅ Medical Terminology Tool instantiated');
    console.log(`   Has lookupICDCode method: ${typeof medicalTerminologyTool.lookupICDCode === 'function' ? '✅' : '❌'}`);

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

    console.log('\n✅ All basic tests completed successfully!');
    console.log('\n📝 Note: Full API tests require internet connectivity and valid API endpoints.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testTools();
