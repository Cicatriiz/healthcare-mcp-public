import { BaseTool } from './base-tool.js';

/**
 * Tool for accessing FDA drug information
 */
export class FDATool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.apiKey = process.env.FDA_API_KEY || '';
    this.baseUrl = 'https://api.fda.gov/drug';
  }

  /**
   * Extract and sanitize key information from FDA API response
   */
  extractKeyInfo(data, searchType) {
    const extracted = {};
    
    // Handle empty results
    if (!data || typeof data !== 'object' || !data.results) {
      return extracted;
    }
    
    // Get the first result (most relevant)
    const result = data.results && data.results.length > 0 ? data.results[0] : {};
    
    // Extract basic information based on search type
    if (searchType === 'label') {
      // Extract drug identification
      if (result.openfda) {
        const openfda = result.openfda;
        extracted.brand_names = (openfda.brand_name || []).slice(0, 3);
        extracted.generic_names = (openfda.generic_name || []).slice(0, 3);
        extracted.manufacturer = (openfda.manufacturer_name || []).slice(0, 1);
      }
      
      // Extract key clinical information (limit size)
      extracted.indications = this.sanitizeText(result.indications_and_usage || []);
      extracted.dosage = this.sanitizeText(result.dosage_and_administration || []);
      extracted.warnings = this.sanitizeText(result.warnings_and_cautions || []);
      extracted.contraindications = this.sanitizeText(result.contraindications || []);
      
      // Extract adverse reactions
      extracted.adverse_reactions = this.sanitizeText(result.adverse_reactions || []);
      
      // Extract drug interactions
      extracted.drug_interactions = this.sanitizeText(result.drug_interactions || []);
      
      // Extract pregnancy info
      extracted.pregnancy = this.sanitizeText(result.pregnancy || []);
      
    } else if (searchType === 'adverse_events') {
      // Focus on adverse events from label data
      if (result.openfda) {
        const openfda = result.openfda;
        extracted.brand_names = (openfda.brand_name || []).slice(0, 3);
        extracted.generic_names = (openfda.generic_name || []).slice(0, 3);
      }
      
      // Focus on adverse reactions and warnings
      extracted.adverse_reactions = this.sanitizeText(result.adverse_reactions || []);
      extracted.warnings = this.sanitizeText(result.warnings_and_cautions || []);
      extracted.boxed_warning = this.sanitizeText(result.boxed_warning || []);
      
    } else { // general
      // Extract basic drug identification
      extracted.generic_name = result.generic_name || '';
      extracted.brand_name = result.brand_name || '';
      extracted.manufacturer = result.labeler_name || '';
      extracted.product_type = result.product_type || '';
      extracted.route = result.route || [];
      extracted.marketing_status = result.marketing_status || '';
    }
    
    return extracted;
  }

  /**
   * Look up drug information from the FDA database
   */
  async lookupDrug(drugName, searchType = 'general') {
    // Input validation
    if (!drugName) {
      return this.formatErrorResponse('Drug name is required');
    }
    
    // Normalize search type
    searchType = searchType.toLowerCase();
    if (!['label', 'adverse_events', 'general'].includes(searchType)) {
      searchType = 'general';
    }
    
    // Create cache key
    const cacheKey = this.getCacheKey('fda_drug', searchType, drugName);
    
    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for FDA drug lookup: ${drugName}, ${searchType}`);
      return cachedResult;
    }
    
    try {
      console.error(`Fetching FDA drug information for ${drugName}, type: ${searchType}`);
      
      // Determine endpoint and query based on search type
      let endpoint, query;
      if (searchType === 'adverse_events' || searchType === 'label') {
        endpoint = `${this.baseUrl}/label.json`;
        query = `openfda.generic_name:${drugName} OR openfda.brand_name:${drugName}`;
      } else { // general
        endpoint = `${this.baseUrl}/ndc.json`;
        query = `generic_name:${drugName} OR brand_name:${drugName}`;
      }
      
      // Build API URL with parameters
      const params = {
        search: query,
        limit: 1
      };
      
      // Add API key if available
      if (this.apiKey) {
        params.api_key = this.apiKey;
      }
      
      const url = this.buildUrl(endpoint, params);
      
      // Make the request
      const data = await this.makeRequest(url);
      
      // Extract and sanitize key information
      const extractedData = this.extractKeyInfo(data, searchType);
      
      // Process the response
      const result = this.formatSuccessResponse({
        drug_name: drugName,
        search_type: searchType,
        results: extractedData,
        total_results: data.meta?.results?.total || 0
      });
      
      // Cache for 24 hours (86400 seconds)
      this.cache.set(cacheKey, result, 86400);
      
      return result;
      
    } catch (error) {
      console.error(`Error fetching FDA drug information: ${error.message}`);
      return this.formatErrorResponse(`Error fetching drug information: ${error.message}`);
    }
  }
}

export default FDATool;
