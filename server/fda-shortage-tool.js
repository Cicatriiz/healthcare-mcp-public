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
   */
  normalizeStatus(status) {
    if (!status) return 'unknown';

    const normalized = status.toLowerCase();
    if (normalized.includes('discontinue') || normalized.includes('resolved')) {
      return 'resolved';
    }
    return 'active';
  }

  /**
   * Build search query from parameters
   */
  buildSearchQuery(params) {
    const conditions = [];

    // Search query (search across multiple fields)
    if (params.query) {
      const query = params.query;
      conditions.push(`(generic_name:"${query}" OR proprietary_name:"${query}" OR package_ndc:"${query}")`);
    }

    // Status filter
    if (params.status && params.status !== 'all') {
      if (params.status === 'active') {
        conditions.push('(NOT status:"Discontinued")');
      } else if (params.status === 'resolved') {
        conditions.push('status:"Discontinued"');
      }
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
    const limit = Math.min(params.limit || 20, 100);
    const skip = params.skip || 0;
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

      // Build query parameters
      const apiParams = {
        limit: limit
      };

      // Add skip for pagination
      if (skip > 0) {
        apiParams.skip = skip;
      }

      // Build search query
      const searchQuery = this.buildSearchQuery(params);
      if (searchQuery) {
        apiParams.search = searchQuery;
      }

      // Add sorting if specified
      if (params.sort) {
        apiParams.sort = params.sort;
      } else {
        // Default sort: most recent first
        apiParams.sort = 'initial_posting_date:desc';
      }

      // Add API key if available
      if (this.apiKey) {
        apiParams.api_key = this.apiKey;
      }

      // Build final URL
      const url = this.buildUrl(this.baseUrl, apiParams);

      // Make the request
      const data = await this.makeRequest(url);

      // Normalize the shortage data
      const shortages = this.normalizeShortageData(data);

      // Format response
      const result = this.formatSuccessResponse({
        shortages: shortages,
        total_results: data.meta?.results?.total || shortages.length,
        limit: limit,
        skip: skip,
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
      // Fetch all active shortages (limited sample for categories)
      const result = await this.searchShortages({
        status: 'active',
        limit: 100
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
      // Fetch all active shortages (limited sample for manufacturers)
      const result = await this.searchShortages({
        status: 'active',
        limit: 100
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
      // Fetch active and resolved shortages
      const [activeResult, resolvedResult] = await Promise.all([
        this.searchShortages({ status: 'active', limit: 100 }),
        this.searchShortages({ status: 'resolved', limit: 100 })
      ]);

      if (activeResult.status === 'error') {
        return activeResult;
      }

      const stats = {
        total_active: activeResult.total_results || 0,
        total_resolved: resolvedResult.total_results || 0,
        total_all: (activeResult.total_results || 0) + (resolvedResult.total_results || 0)
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
