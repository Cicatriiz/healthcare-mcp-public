import { BaseTool } from './base-tool.js';

/**
 * Tool for looking up ICD-10 codes and medical terminology
 */
export class MedicalTerminologyTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.baseUrl = 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search';
  }

  /**
   * Look up ICD-10 codes by code or description
   */
  async lookupICDCode(code = '', description = '', maxResults = 10) {
    // Either code or description must be provided
    if (!code && !description) {
      return this.formatErrorResponse('Either code or description is required');
    }
    
    // Validate max_results
    let validMaxResults;
    try {
      validMaxResults = parseInt(maxResults);
      if (validMaxResults < 1) {
        validMaxResults = 10;
      } else if (validMaxResults > 50) {
        validMaxResults = 50; // Limit to reasonable number
      }
    } catch (error) {
      validMaxResults = 10;
    }
    
    // Create cache key
    const cacheKey = this.getCacheKey('icd_code', code, description, validMaxResults);
    
    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for ICD-10 code lookup: ${code || description}`);
      return cachedResult;
    }
    
    try {
      console.error(`Looking up ICD-10 code for: code=${code}, description=${description}`);
      
      // Build query parameters
      const params = {
        sf: 'code,name',
        terms: code || description,
        maxList: validMaxResults
      };
      
      const url = this.buildUrl(this.baseUrl, params);
      
      // Make the request
      const data = await this.makeRequest(url);
      
      // Process the response
      let codes = [];
      let totalResults = 0;
      
      if (data && Array.isArray(data[3])) {
        codes = data[3].map(item => ({
          code: item[0] || '',
          description: item[1] || '',
          category: item[2] || ''
        }));
        totalResults = codes.length;
      }
      
      // Create result object
      const result = this.formatSuccessResponse({
        search_type: code ? 'code' : 'description',
        search_term: code || description,
        total_results: totalResults,
        codes: codes
      });
      
      // Cache for 24 hours (86400 seconds)
      this.cache.set(cacheKey, result, 86400);
      
      return result;
      
    } catch (error) {
      console.error(`Error looking up ICD-10 code: ${error.message}`);
      return this.formatErrorResponse(`Error looking up ICD-10 code: ${error.message}`);
    }
  }
}

export default MedicalTerminologyTool;
