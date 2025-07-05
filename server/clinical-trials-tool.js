import { BaseTool } from './base-tool.js';

/**
 * Tool for searching clinical trials from ClinicalTrials.gov
 */
export class ClinicalTrialsTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.baseUrl = 'https://clinicaltrials.gov/api/v2/studies';
  }

  /**
   * Search for clinical trials by condition, status, and other parameters
   */
  async searchTrials(condition, status = 'recruiting', maxResults = 10) {
    // Input validation
    if (!condition) {
      return this.formatErrorResponse('Condition is required');
    }
    
    // Validate max_results
    let validMaxResults;
    try {
      validMaxResults = parseInt(maxResults);
      if (validMaxResults < 1) {
        validMaxResults = 10;
      } else if (validMaxResults > 100) {
        validMaxResults = 100; // Limit to reasonable number
      }
    } catch (error) {
      validMaxResults = 10;
    }
    
    // Validate status
    const validStatuses = ['recruiting', 'completed', 'active', 'not_recruiting', 'all'];
    if (!validStatuses.includes(status.toLowerCase())) {
      status = 'recruiting';
    }
    
    // Create cache key
    const cacheKey = this.getCacheKey('clinical_trials', condition, status, validMaxResults);
    
    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for Clinical Trials search: ${condition}`);
      return cachedResult;
    }
    
    try {
      console.error(`Searching Clinical Trials for: ${condition}, status: ${status}, max_results: ${validMaxResults}`);
      
      // Build query parameters
      const params = {
        'query.cond': condition,
        'pageSize': validMaxResults,
        'format': 'json'
      };
      
      // Add status filter if not 'all'
      if (status !== 'all') {
        // Map our status names to ClinicalTrials.gov API values
        const statusMap = {
          'recruiting': 'RECRUITING',
          'completed': 'COMPLETED',
          'active': 'ACTIVE_NOT_RECRUITING',
          'not_recruiting': 'ACTIVE_NOT_RECRUITING'
        };
        params['filter.overallStatus'] = statusMap[status] || 'RECRUITING';
      }
      
      const url = this.buildUrl(this.baseUrl, params);
      
      // Make the request
      const data = await this.makeRequest(url);
      
      // Process the response
      let trials = [];
      let totalResults = 0;
      
      if (data && data.studies) {
        totalResults = data.totalCount || data.studies.length;
        
        // Process each trial
        for (const study of data.studies) {
          const protocolSection = study.protocolSection || {};
          const identification = protocolSection.identificationModule || {};
          const status = protocolSection.statusModule || {};
          const design = protocolSection.designModule || {};
          const eligibility = protocolSection.eligibilityModule || {};
          const contacts = protocolSection.contactsLocationsModule || {};
          
          const processedTrial = {
            nct_id: identification.nctId || '',
            title: identification.briefTitle || '',
            status: status.overallStatus || '',
            phase: design.phases || [],
            study_type: design.studyType || '',
            conditions: protocolSection.conditionsModule?.conditions || [],
            locations: [],
            sponsor: protocolSection.sponsorCollaboratorsModule?.leadSponsor?.name || '',
            url: identification.nctId ? `https://clinicaltrials.gov/study/${identification.nctId}` : '',
            eligibility: {
              gender: eligibility.sex || '',
              min_age: eligibility.minimumAge || '',
              max_age: eligibility.maximumAge || '',
              healthy_volunteers: eligibility.healthyVolunteers ? 'Yes' : 'No'
            }
          };
          
          // Extract locations
          if (contacts.locations) {
            for (const location of contacts.locations.slice(0, 3)) { // Limit to 3 locations
              const facility = location.facility || {};
              const locationData = {
                facility: facility.name || '',
                city: facility.city || '',
                state: facility.state || '',
                country: facility.country || ''
              };
              processedTrial.locations.push(locationData);
            }
          }
          
          trials.push(processedTrial);
        }
      }
      
      // Create result object
      const result = this.formatSuccessResponse({
        condition: condition,
        search_status: status,
        total_results: totalResults,
        trials: trials
      });
      
      // Cache for 24 hours (86400 seconds)
      this.cache.set(cacheKey, result, 86400);
      
      return result;
      
    } catch (error) {
      console.error(`Error searching Clinical Trials: ${error.message}`);
      return this.formatErrorResponse(`Error searching clinical trials: ${error.message}`);
    }
  }
}

export default ClinicalTrialsTool;
