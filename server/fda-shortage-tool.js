import { BaseTool } from './base-tool.js';

/**
 * Tool for accessing FDA drug shortage information
 *
 * Data source: openFDA Drug Shortages API
 * Endpoint: https://api.fda.gov/drug/shortages.json
 * Documentation: https://open.fda.gov/apis/drug/drugshortages/
 */
export class FDAShortageTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.apiKey = process.env.FDA_API_KEY || '';
    this.baseUrl = 'https://api.fda.gov/drug/shortages.json';
  }

  /**
   * Normalize and extract key information from FDA shortage response
   */
  normalizeShortageData(rawData) {
    if (!rawData || !rawData.results || !Array.isArray(rawData.results)) {
      return [];
    }

    return rawData.results.map(shortage => {
      // Extract therapeutic categories (may be array or string)
      let therapeuticCategories = [];
      if (Array.isArray(shortage.therapeutic_category)) {
        therapeuticCategories = shortage.therapeutic_category;
      } else if (shortage.therapeutic_category) {
        therapeuticCategories = [shortage.therapeutic_category];
      }

      // Extract strength (may be array or string)
      let strengths = [];
      if (Array.isArray(shortage.strength)) {
        strengths = shortage.strength;
      } else if (shortage.strength) {
        strengths = [shortage.strength];
      }

      // Derive route from dosage form (simplified mapping)
      const route = this.deriveRouteFromDosageForm(shortage.dosage_form);

      return {
        ndc: shortage.package_ndc || '',
        generic_name: shortage.generic_name || '',
        brand_name: shortage.proprietary_name || null,
        manufacturer: shortage.company_name || '',
        therapeutic_categories: therapeuticCategories,
        dosage_form: shortage.dosage_form || '',
        route: route,
        strength: strengths,
        status: this.normalizeStatus(shortage.status),
        shortage_reason: this.sanitizeText([shortage.shortage_reason])[0] || '',
        availability: shortage.availability || '',
        presentation: shortage.presentation || '',
        update_type: shortage.update_type || '',
        initial_date: shortage.initial_posting_date || null,
        last_updated: shortage.update_date || null,
        change_date: shortage.change_date || null,
        resolution_date: shortage.discontinued_date || null,
        related_info: this.sanitizeText([shortage.related_info])[0] || '',
        related_info_link: shortage.related_info_link || null,
        resolved_note: this.sanitizeText([shortage.resolved_note])[0] || '',
        contact_info: shortage.contact_info || '',
        // Include openfda harmonized fields if available
        openfda: shortage.openfda || null
      };
    });
  }

  /**
   * Derive administration route from dosage form
   * This is a simplified mapping - real-world would need more comprehensive logic
   */
  deriveRouteFromDosageForm(dosageForm) {
    if (!dosageForm) return 'Unknown';

    const form = dosageForm.toLowerCase();

    if (form.includes('injection') || form.includes('injectable') ||
        form.includes('iv') || form.includes('intravenous')) {
      return 'Intravenous';
    }
    if (form.includes('tablet') || form.includes('capsule') ||
        form.includes('oral') || form.includes('solution, oral')) {
      return 'Oral';
    }
    if (form.includes('topical') || form.includes('cream') ||
        form.includes('ointment') || form.includes('gel')) {
      return 'Topical';
    }
    if (form.includes('inhal')) {
      return 'Inhalation';
    }
    if (form.includes('ophthalmic') || form.includes('eye')) {
      return 'Ophthalmic';
    }
    if (form.includes('suppository')) {
      return 'Rectal';
    }

    return 'Other';
  }

  /**
   * Normalize status field to consistent values
   * FDA API uses various status values - we normalize them to 'active' or 'resolved'
   */
  normalizeStatus(status) {
    if (!status) return 'active'; // Default to active if no status

    const normalized = status.toLowerCase();
    // Check for resolved/discontinued indicators
    if (normalized.includes('discontinue') ||
        normalized.includes('resolved') ||
        normalized.includes('available')) {
      return 'resolved';
    }
    return 'active';
  }

  /**
   * Build search query from parameters
   * NOTE: We don't include params.query here because we do client-side filtering
   * This is more reliable than trying to match FDA API's complex search syntax
   */
  buildSearchQuery(params) {
    const conditions = [];

    // Search query - SKIP IT HERE, we'll filter client-side after fetching
    // The FDA API search syntax is complex and unreliable for partial matches
    // Since we fetch 1000 results anyway, client-side filtering is better

    // Status filter
    // Note: FDA API doesn't have a simple active/resolved field
    // We filter post-normalization instead of in the API query
    // The actual status field has values like "Currently in Shortage", "Available", "Discontinued"
    // So we fetch all and filter in normalizeShortageData based on normalized status
    if (params.status && params.status !== 'all') {
      // For now, don't filter at API level - let normalizeShortageData handle it
      // This ensures we get accurate counts
      // TODO: Optimize by adding proper FDA API status filtering once we know exact field values
    }

    // Therapeutic category filter
    if (params.therapeutic_category) {
      conditions.push(`therapeutic_category:"${params.therapeutic_category}"`);
    }

    // Dosage form filter
    if (params.dosage_form) {
      conditions.push(`dosage_form:"${params.dosage_form}"`);
    }

    // Manufacturer filter
    if (params.company_name) {
      conditions.push(`company_name:"${params.company_name}"`);
    }

    // If no conditions, return wildcard to get all
    if (conditions.length === 0) {
      return null; // No search parameter = get all
    }

    return conditions.join(' AND ');
  }

  /**
   * Search for drug shortages with flexible filtering
   *
   * @param {Object} params - Search parameters
   * @param {string} params.query - Search term (drug name, NDC, etc.)
   * @param {string} params.status - 'active', 'resolved', or 'all' (default: 'all')
   * @param {string} params.therapeutic_category - Filter by therapeutic category
   * @param {string} params.dosage_form - Filter by dosage form
   * @param {string} params.company_name - Filter by manufacturer
   * @param {number} params.limit - Max results (default: 20, max: 100)
   * @param {number} params.skip - Skip N results for pagination (default: 0)
   * @param {string} params.sort - Sort field and direction, e.g., 'initial_posting_date:desc'
   * @returns {Promise<Object>} Formatted shortage data
   */
  async searchShortages(params = {}) {
    // Validate and set defaults
    const requestedLimit = params.limit || 20;
    const requestedSkip = params.skip || 0;
    const status = params.status || 'all';

    // Build cache key
    const cacheKey = this.getCacheKey('fda_shortage', JSON.stringify(params));

    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for FDA shortage search: ${JSON.stringify(params)}`);
      return cachedResult;
    }

    try {
      console.error(`Fetching FDA shortage data with params: ${JSON.stringify(params)}`);

      // CRITICAL FIX: Fetch ALL shortages using pagination
      // This ensures we have the complete dataset for filtering and analytics
      const allResult = await this.fetchAllShortages();

      if (allResult.status === 'error') {
        return allResult;
      }

      let allShortages = allResult.shortages;

      // Apply status filter post-normalization (since FDA API status values vary)
      let filteredShortages = allShortages;
      if (params.status && params.status !== 'all') {
        filteredShortages = allShortages.filter(s => s.status === params.status);
      }

      // Apply search query filter (client-side)
      if (params.query && params.query.trim()) {
        const searchTerm = params.query.trim().toLowerCase();
        filteredShortages = filteredShortages.filter(shortage => {
          const genericName = (shortage.generic_name || '').toLowerCase();
          const brandName = (shortage.brand_name || '').toLowerCase();
          const ndc = (shortage.ndc || '').toLowerCase();
          const manufacturer = (shortage.manufacturer || '').toLowerCase();

          return genericName.includes(searchTerm) ||
                 brandName.includes(searchTerm) ||
                 ndc.includes(searchTerm) ||
                 manufacturer.includes(searchTerm);
        });
      }

      // Apply therapeutic category filter (client-side)
      if (params.therapeutic_category) {
        filteredShortages = filteredShortages.filter(shortage => {
          return shortage.therapeutic_categories &&
                 shortage.therapeutic_categories.includes(params.therapeutic_category);
        });
      }

      // Apply dosage form filter (client-side)
      if (params.dosage_form) {
        filteredShortages = filteredShortages.filter(shortage => {
          return shortage.dosage_form === params.dosage_form;
        });
      }

      // Apply manufacturer filter (client-side)
      if (params.company_name) {
        filteredShortages = filteredShortages.filter(shortage => {
          return shortage.manufacturer &&
                 shortage.manufacturer.toLowerCase().includes(params.company_name.toLowerCase());
        });
      }

      // NOW apply pagination on the filtered results
      const totalFiltered = filteredShortages.length;
      const paginatedShortages = filteredShortages.slice(requestedSkip, requestedSkip + requestedLimit);

      // Format response
      const result = this.formatSuccessResponse({
        shortages: paginatedShortages,
        total_results: totalFiltered, // Total count AFTER filtering
        total_in_fda: allShortages.length, // Total available in FDA database (before filtering)
        limit: requestedLimit,
        skip: requestedSkip,
        query_params: params
      });

      // Cache for 6 hours (21600 seconds) - shortages update frequently
      this.cache.set(cacheKey, result, 21600);

      return result;

    } catch (error) {
      console.error(`Error fetching FDA shortage data: ${error.message}`);
      return this.formatErrorResponse(`Error fetching shortage data: ${error.message}`);
    }
  }

  /**
   * Fetch ALL shortages from FDA API using pagination
   * This fetches multiple pages to get the complete dataset (1500-2000 total)
   *
   * @returns {Promise<Object>} All shortages across all pages
   */
  async fetchAllShortages() {
    const cacheKey = this.getCacheKey('fda_all_shortages');

    // Check cache first (cached for 6 hours)
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error('Cache hit for all FDA shortages');
      return cachedResult;
    }

    try {
      console.error('Fetching ALL FDA shortage data with pagination...');

      let allShortages = [];
      let skip = 0;
      const limit = 1000; // FDA API max per request
      let hasMore = true;

      // Keep fetching pages until we get all data
      while (hasMore) {
        const apiParams = {
          limit: limit,
          skip: skip,
          sort: 'initial_posting_date:desc'
        };

        if (this.apiKey) {
          apiParams.api_key = this.apiKey;
        }

        const url = this.buildUrl(this.baseUrl, apiParams);
        console.error(`Fetching page: skip=${skip}, limit=${limit}`);

        const data = await this.makeRequest(url);
        const pageShortages = this.normalizeShortageData(data);

        if (pageShortages.length === 0) {
          hasMore = false;
        } else {
          allShortages = allShortages.concat(pageShortages);
          skip += limit;

          // Stop if we got fewer results than the limit (means we're on the last page)
          if (pageShortages.length < limit) {
            hasMore = false;
          }

          // Safety check: don't fetch more than 5 pages (5000 results)
          if (skip >= 5000) {
            console.error('Reached pagination safety limit (5000 results)');
            hasMore = false;
          }
        }
      }

      console.error(`Fetched ${allShortages.length} total shortages across all pages`);

      const result = this.formatSuccessResponse({
        shortages: allShortages,
        total_results: allShortages.length
      });

      // Cache for 6 hours
      this.cache.set(cacheKey, result, 21600);

      return result;

    } catch (error) {
      console.error(`Error fetching all FDA shortage data: ${error.message}`);
      return this.formatErrorResponse(`Error fetching all shortage data: ${error.message}`);
    }
  }

  /**
   * Get a specific shortage by NDC
   *
   * @param {string} ndc - Package NDC code
   * @returns {Promise<Object>} Single shortage detail
   */
  async getShortageByNDC(ndc) {
    if (!ndc) {
      return this.formatErrorResponse('NDC is required');
    }

    // Use search with specific NDC
    const result = await this.searchShortages({
      query: ndc,
      limit: 1
    });

    if (result.status === 'error') {
      return result;
    }

    if (result.shortages && result.shortages.length > 0) {
      return this.formatSuccessResponse({
        shortage: result.shortages[0]
      });
    }

    return this.formatErrorResponse(`No shortage found for NDC: ${ndc}`);
  }

  /**
   * Get all therapeutic categories currently experiencing shortages
   * Useful for building filter dropdowns
   *
   * @returns {Promise<Object>} List of therapeutic categories
   */
  async getTherapeuticCategories() {
    const cacheKey = this.getCacheKey('fda_shortage_categories');

    // Check cache
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch all active shortages to get comprehensive category list
      const result = await this.searchShortages({
        status: 'active',
        limit: 1000
      });

      if (result.status === 'error') {
        return result;
      }

      // Extract unique therapeutic categories
      const categoriesSet = new Set();
      result.shortages.forEach(shortage => {
        shortage.therapeutic_categories.forEach(cat => {
          if (cat) categoriesSet.add(cat);
        });
      });

      const categories = Array.from(categoriesSet).sort();

      const response = this.formatSuccessResponse({
        categories: categories,
        count: categories.length
      });

      // Cache for 12 hours
      this.cache.set(cacheKey, response, 43200);

      return response;

    } catch (error) {
      console.error(`Error fetching therapeutic categories: ${error.message}`);
      return this.formatErrorResponse(`Error fetching categories: ${error.message}`);
    }
  }

  /**
   * Get all manufacturers currently experiencing shortages
   * Useful for building filter dropdowns
   *
   * @returns {Promise<Object>} List of manufacturers
   */
  async getManufacturers() {
    const cacheKey = this.getCacheKey('fda_shortage_manufacturers');

    // Check cache
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch all active shortages to get comprehensive manufacturer list
      const result = await this.searchShortages({
        status: 'active',
        limit: 1000
      });

      if (result.status === 'error') {
        return result;
      }

      // Extract unique manufacturers
      const manufacturersSet = new Set();
      result.shortages.forEach(shortage => {
        if (shortage.manufacturer) {
          manufacturersSet.add(shortage.manufacturer);
        }
      });

      const manufacturers = Array.from(manufacturersSet).sort();

      const response = this.formatSuccessResponse({
        manufacturers: manufacturers,
        count: manufacturers.length
      });

      // Cache for 12 hours
      this.cache.set(cacheKey, response, 43200);

      return response;

    } catch (error) {
      console.error(`Error fetching manufacturers: ${error.message}`);
      return this.formatErrorResponse(`Error fetching manufacturers: ${error.message}`);
    }
  }

  /**
   * Get summary statistics for shortages
   *
   * @returns {Promise<Object>} Summary statistics
   */
  async getSummaryStats() {
    const cacheKey = this.getCacheKey('fda_shortage_stats');

    // Check cache
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch ALL shortages using pagination to get complete dataset
      const allResult = await this.fetchAllShortages();

      if (allResult.status === 'error') {
        return allResult;
      }

      const allShortages = allResult.shortages;

      // Count by normalized status
      const activeCount = allShortages.filter(s => s.status === 'active').length;
      const resolvedCount = allShortages.filter(s => s.status === 'resolved').length;

      const stats = {
        total_active: activeCount,
        total_resolved: resolvedCount,
        total_all: allShortages.length
      };

      const response = this.formatSuccessResponse(stats);

      // Cache for 1 hour
      this.cache.set(cacheKey, response, 3600);

      return response;

    } catch (error) {
      console.error(`Error fetching summary stats: ${error.message}`);
      return this.formatErrorResponse(`Error fetching stats: ${error.message}`);
    }
  }
}

export default FDAShortageTool;
