/**
 * Shortage Service
 *
 * High-level service layer for orchestrating drug shortage data,
 * analytics, enrichment, and aggregation across multiple MCP tools.
 */
export class ShortageService {
  constructor(mcpTools, cacheService) {
    this.fdaShortage = mcpTools.fdaShortage;
    this.fdaDrug = mcpTools.fdaDrug;
    this.pubmed = mcpTools.pubmed;
    this.healthTopics = mcpTools.healthTopics;
    this.clinicalTrials = mcpTools.clinicalTrials;
    this.medicalTerminology = mcpTools.medicalTerminology;
    this.medrxiv = mcpTools.medrxiv;
    this.ncbiBookshelf = mcpTools.ncbiBookshelf;
    this.cache = cacheService;
  }

  /**
   * Fetch shortages with search and filtering
   * Wrapper around FDA shortage tool with additional processing
   */
  async fetchShortages(params = {}) {
    try {
      const result = await this.fdaShortage.searchShortages(params);

      if (result.status === 'error') {
        return result;
      }

      return {
        status: 'success',
        data: result.shortages || [],
        total: result.total_results || 0,
        pagination: {
          limit: result.limit || params.limit || 20,
          skip: result.skip || params.skip || 0,
          hasMore: (result.skip || 0) + (result.shortages || []).length < result.total_results
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error fetching shortages: ${error.message}`
      };
    }
  }

  /**
   * Get detailed information for a specific shortage by NDC
   * Returns basic shortage data without enrichment
   */
  async getShortageDetail(ndc) {
    if (!ndc) {
      return {
        status: 'error',
        error_message: 'NDC is required'
      };
    }

    try {
      const result = await this.fdaShortage.getShortageByNDC(ndc);
      return result;
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error fetching shortage detail: ${error.message}`
      };
    }
  }

  /**
   * Enrich a shortage with additional clinical context from multiple MCP tools
   * Returns comprehensive information package
   */
  async enrichShortage(shortage) {
    if (!shortage || !shortage.generic_name) {
      return {
        status: 'error',
        error_message: 'Invalid shortage object'
      };
    }

    const enriched = {
      ...shortage,
      enrichment: {
        fda_details: null,
        pubmed_articles: [],
        health_guidelines: [],
        clinical_trials: [],
        icd_codes: [],
        medrxiv_preprints: [],
        bookshelf_resources: [],
        alternatives: []
      },
      enrichment_status: {
        fda_details: 'pending',
        pubmed: 'pending',
        health: 'pending',
        trials: 'pending',
        icd: 'pending',
        medrxiv: 'pending',
        bookshelf: 'pending',
        alternatives: 'pending'
      }
    };

    // Use Promise.allSettled to attempt all enrichments in parallel
    // Even if some fail, we still get partial enrichment
    const enrichmentTasks = [
      this.getFDADetails(shortage.generic_name).then(r => ({ type: 'fda_details', data: r })),
      this.getPubMedEvidence(shortage.generic_name, shortage.therapeutic_categories).then(r => ({ type: 'pubmed', data: r })),
      this.getHealthGuidelines(shortage.generic_name, shortage.therapeutic_categories).then(r => ({ type: 'health', data: r })),
      this.getClinicalTrials(shortage.generic_name).then(r => ({ type: 'trials', data: r })),
      this.getRelatedICDCodes(shortage.therapeutic_categories).then(r => ({ type: 'icd', data: r })),
      this.getMedRxivPreprints(shortage.generic_name).then(r => ({ type: 'medrxiv', data: r })),
      this.getBookshelfResources(shortage.generic_name).then(r => ({ type: 'bookshelf', data: r })),
      this.suggestAlternatives(shortage).then(r => ({ type: 'alternatives', data: r }))
    ];

    const results = await Promise.allSettled(enrichmentTasks);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const { type, data } = result.value;

        if (data && data.status === 'success') {
          enriched.enrichment_status[type] = 'success';

          switch (type) {
            case 'fda_details':
              enriched.enrichment.fda_details = data.drugs && data.drugs[0] ? data.drugs[0] : null;
              break;
            case 'pubmed':
              enriched.enrichment.pubmed_articles = data.articles || [];
              break;
            case 'health':
              enriched.enrichment.health_guidelines = data.topics || [];
              break;
            case 'trials':
              enriched.enrichment.clinical_trials = data.trials || [];
              break;
            case 'icd':
              enriched.enrichment.icd_codes = data.codes || [];
              break;
            case 'medrxiv':
              enriched.enrichment.medrxiv_preprints = data.articles || [];
              break;
            case 'bookshelf':
              enriched.enrichment.bookshelf_resources = data.results || [];
              break;
            case 'alternatives':
              enriched.enrichment.alternatives = data.alternatives || [];
              break;
          }
        } else {
          enriched.enrichment_status[type] = 'failed';
        }
      } else {
        const type = enrichmentTasks[index];
        enriched.enrichment_status[type] = 'failed';
      }
    });

    return {
      status: 'success',
      shortage: enriched
    };
  }

  /**
   * Get detailed FDA drug information
   */
  async getFDADetails(drugName) {
    try {
      const result = await this.fdaDrug.lookupDrug(drugName, 'label');
      return result;
    } catch (error) {
      console.error(`Error fetching FDA details: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Get relevant PubMed articles
   */
  async getPubMedEvidence(drugName, therapeuticCategories = []) {
    try {
      // Build query combining drug name and therapeutic category
      let query = drugName;
      if (therapeuticCategories.length > 0) {
        const category = therapeuticCategories[0]; // Use first category
        query = `${drugName} AND ${category}`;
      }

      const result = await this.pubmed.searchLiterature(query, 5, '5', false);
      return result;
    } catch (error) {
      console.error(`Error fetching PubMed evidence: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Get health guidelines from Health.gov
   */
  async getHealthGuidelines(drugName, therapeuticCategories = []) {
    try {
      // Try searching by therapeutic category first, as Health.gov is topic-focused
      let topic = therapeuticCategories.length > 0 ? therapeuticCategories[0] : drugName;

      const result = await this.healthTopics.getHealthTopics(topic, 'en');
      return result;
    } catch (error) {
      console.error(`Error fetching health guidelines: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Get relevant clinical trials
   */
  async getClinicalTrials(drugName) {
    try {
      const result = await this.clinicalTrials.searchTrials(drugName, 'all', 5);
      return result;
    } catch (error) {
      console.error(`Error fetching clinical trials: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Get related ICD-10 codes based on therapeutic categories
   */
  async getRelatedICDCodes(therapeuticCategories = []) {
    if (therapeuticCategories.length === 0) {
      return { status: 'success', codes: [] };
    }

    try {
      // Search by first therapeutic category
      const category = therapeuticCategories[0];
      const result = await this.medicalTerminology.lookupICDCode(null, category, 5);
      return result;
    } catch (error) {
      console.error(`Error fetching ICD codes: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Get medRxiv preprints
   */
  async getMedRxivPreprints(drugName) {
    try {
      const result = await this.medrxiv.search(drugName, 5);
      return result;
    } catch (error) {
      console.error(`Error fetching medRxiv preprints: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Get NCBI Bookshelf resources
   */
  async getBookshelfResources(drugName) {
    try {
      const result = await this.ncbiBookshelf.search(drugName, 5);
      return result;
    } catch (error) {
      console.error(`Error fetching bookshelf resources: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Suggest alternative drugs based on therapeutic category
   * This is a simplified implementation - in production would use more sophisticated matching
   */
  async suggestAlternatives(shortage) {
    try {
      if (!shortage.therapeutic_categories || shortage.therapeutic_categories.length === 0) {
        return { status: 'success', alternatives: [] };
      }

      const category = shortage.therapeutic_categories[0];

      // Search for other drugs in the same category that are NOT in shortage
      // This is a simplified approach - would need a more comprehensive drug database
      const result = await this.fdaShortage.searchShortages({
        therapeutic_category: category,
        status: 'all',
        limit: 10
      });

      if (result.status === 'success' && result.shortages) {
        // Filter out the current drug and only show resolved/non-shortage alternatives
        const alternatives = result.shortages
          .filter(s => s.ndc !== shortage.ndc && s.status === 'resolved')
          .slice(0, 5)
          .map(s => ({
            ndc: s.ndc,
            generic_name: s.generic_name,
            brand_name: s.brand_name,
            manufacturer: s.manufacturer,
            dosage_form: s.dosage_form,
            strength: s.strength,
            status: s.status
          }));

        return { status: 'success', alternatives };
      }

      return { status: 'success', alternatives: [] };
    } catch (error) {
      console.error(`Error suggesting alternatives: ${error.message}`);
      return { status: 'error', error_message: error.message };
    }
  }

  /**
   * Get analytics and summary statistics
   */
  async getAnalytics(params = {}) {
    const cacheKey = this.cache.getCacheKey('shortage_analytics', JSON.stringify(params));

    // Check cache
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch ALL shortages using pagination for complete analytics
      const [allResult, categoriesResult, manufacturersResult] = await Promise.all([
        this.fdaShortage.fetchAllShortages(),
        this.fdaShortage.getTherapeuticCategories(),
        this.fdaShortage.getManufacturers()
      ]);

      if (allResult.status === 'error') {
        return allResult;
      }

      const allShortages = allResult.shortages || [];
      const activeShortages = allShortages.filter(s => s.status === 'active');
      const resolvedShortages = allShortages.filter(s => s.status === 'resolved');

      // Compute statistics
      const analytics = {
        summary: {
          total_active: activeShortages.length,
          total_all: allShortages.length,
          total_resolved: resolvedShortages.length
        },
        by_category: this.groupByCategory(activeShortages),
        by_route: this.groupByRoute(activeShortages),
        by_manufacturer: this.groupByManufacturer(activeShortages),
        by_dosage_form: this.groupByDosageForm(activeShortages),
        available_categories: categoriesResult.status === 'success' ? categoriesResult.categories : [],
        available_manufacturers: manufacturersResult.status === 'success' ? manufacturersResult.manufacturers : []
      };

      const result = { status: 'success', analytics };

      // Cache for 1 hour
      this.cache.set(cacheKey, result, 3600);

      return result;
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error computing analytics: ${error.message}`
      };
    }
  }

  /**
   * Group shortages by therapeutic category
   */
  groupByCategory(shortages) {
    const grouped = {};

    shortages.forEach(shortage => {
      (shortage.therapeutic_categories || []).forEach(category => {
        if (!grouped[category]) {
          grouped[category] = { category, count: 0 };
        }
        grouped[category].count++;
      });
    });

    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }

  /**
   * Group shortages by route of administration
   */
  groupByRoute(shortages) {
    const grouped = {};

    shortages.forEach(shortage => {
      const route = shortage.route || 'Unknown';
      if (!grouped[route]) {
        grouped[route] = { route, count: 0 };
      }
      grouped[route].count++;
    });

    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }

  /**
   * Group shortages by manufacturer
   */
  groupByManufacturer(shortages) {
    const grouped = {};

    shortages.forEach(shortage => {
      const manufacturer = shortage.manufacturer || 'Unknown';
      if (!grouped[manufacturer]) {
        grouped[manufacturer] = { manufacturer, count: 0, shortages: [] };
      }
      grouped[manufacturer].count++;
      grouped[manufacturer].shortages.push({
        ndc: shortage.ndc,
        generic_name: shortage.generic_name,
        brand_name: shortage.brand_name
      });
    });

    return Object.values(grouped)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 manufacturers
  }

  /**
   * Group shortages by dosage form
   */
  groupByDosageForm(shortages) {
    const grouped = {};

    shortages.forEach(shortage => {
      const form = shortage.dosage_form || 'Unknown';
      if (!grouped[form]) {
        grouped[form] = { dosage_form: form, count: 0 };
      }
      grouped[form].count++;
    });

    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }

  /**
   * Parse and extract geographic info from manufacturer contact_info
   * This is a simplified MVP implementation
   */
  parseGeographicInfo(contactInfo) {
    if (!contactInfo) {
      return null;
    }

    // Basic regex to extract city, state, zip
    // Format varies, this is a simple heuristic
    const stateMatch = contactInfo.match(/\b([A-Z]{2})\s+\d{5}\b/);
    const state = stateMatch ? stateMatch[1] : null;

    // Extract country (if "USA" or "United States" appears)
    const countryMatch = contactInfo.match(/\b(USA|United States|US)\b/i);
    const country = countryMatch ? 'USA' : 'Unknown';

    return {
      state,
      country,
      raw_contact: contactInfo
    };
  }

  /**
   * Get geographic distribution of shortages by manufacturer location
   * MVP implementation - parses from contact_info, no actual geocoding yet
   */
  async getGeographicDistribution() {
    const cacheKey = this.cache.getCacheKey('shortage_geographic');

    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch ALL shortages using pagination for complete geographic data
      const result = await this.fdaShortage.fetchAllShortages();

      if (result.status === 'error') {
        return result;
      }

      // Filter for active shortages only
      const shortages = result.shortages.filter(s => s.status === 'active');
      const byRegion = {};

      shortages.forEach(shortage => {
        const geoInfo = this.parseGeographicInfo(shortage.contact_info);

        if (geoInfo) {
          const region = geoInfo.state || geoInfo.country;

          if (!byRegion[region]) {
            byRegion[region] = {
              region,
              country: geoInfo.country,
              count: 0,
              manufacturers: new Set(),
              shortages: []
            };
          }

          byRegion[region].count++;
          byRegion[region].manufacturers.add(shortage.manufacturer);
          byRegion[region].shortages.push({
            ndc: shortage.ndc,
            generic_name: shortage.generic_name,
            manufacturer: shortage.manufacturer
          });
        }
      });

      // Convert manufacturers Set to array
      const distribution = Object.values(byRegion).map(region => ({
        ...region,
        manufacturers: Array.from(region.manufacturers),
        manufacturer_count: region.manufacturers.length
      })).sort((a, b) => b.count - a.count);

      const response = {
        status: 'success',
        distribution,
        total_regions: distribution.length,
        note: 'MVP implementation - geographic data parsed from contact_info field. Future enhancement will use proper geocoding API.'
      };

      this.cache.set(cacheKey, response, 3600);

      return response;
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error computing geographic distribution: ${error.message}`
      };
    }
  }
}

export default ShortageService;
