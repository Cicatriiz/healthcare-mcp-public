/**
 * Shortage Service
 *
 * High-level service layer for orchestrating drug shortage data,
 * analytics, enrichment, and aggregation across multiple MCP tools.
 */
export class ShortageService {
  constructor(mcpTools, cacheService, historyService = null, rxnormService = null) {
    this.fdaShortage = mcpTools.fdaShortage;
    this.fdaDrug = mcpTools.fdaDrug;
    this.pubmed = mcpTools.pubmed;
    this.healthTopics = mcpTools.healthTopics;
    this.clinicalTrials = mcpTools.clinicalTrials;
    this.medicalTerminology = mcpTools.medicalTerminology;
    this.medrxiv = mcpTools.medrxiv;
    this.ncbiBookshelf = mcpTools.ncbiBookshelf;
    this.cache = cacheService;
    this.history = historyService;
    this.rxnorm = rxnormService;

    // US State coordinates for geocoding
    this.US_STATE_COORDS = {
      'AL': [32.806671, -86.791130], 'AK': [61.370716, -152.404419],
      'AZ': [33.729759, -111.431221], 'AR': [34.969704, -92.373123],
      'CA': [36.116203, -119.681564], 'CO': [39.059811, -105.311104],
      'CT': [41.597782, -72.755371], 'DE': [39.318523, -75.507141],
      'FL': [27.766279, -81.686783], 'GA': [33.040619, -83.643074],
      'HI': [21.094318, -157.498337], 'ID': [44.240459, -114.478828],
      'IL': [40.349457, -88.986137], 'IN': [39.849426, -86.258278],
      'IA': [42.011539, -93.210526], 'KS': [38.526600, -96.726486],
      'KY': [37.668140, -84.670067], 'LA': [31.169546, -91.867805],
      'ME': [44.693947, -69.381927], 'MD': [39.063946, -76.802101],
      'MA': [42.230171, -71.530106], 'MI': [43.326618, -84.536095],
      'MN': [45.694454, -93.900192], 'MS': [32.741646, -89.678696],
      'MO': [38.456085, -92.288368], 'MT': [46.921925, -110.454353],
      'NE': [41.125370, -98.268082], 'NV': [38.313515, -117.055374],
      'NH': [43.452492, -71.563896], 'NJ': [40.298904, -74.521011],
      'NM': [34.840515, -106.248482], 'NY': [42.165726, -74.948051],
      'NC': [35.630066, -79.806419], 'ND': [47.528912, -99.784012],
      'OH': [40.388783, -82.764915], 'OK': [35.565342, -96.928917],
      'OR': [44.572021, -122.070938], 'PA': [40.590752, -77.209755],
      'RI': [41.680893, -71.511780], 'SC': [33.856892, -80.945007],
      'SD': [44.299782, -99.438828], 'TN': [35.747845, -86.692345],
      'TX': [31.054487, -97.563461], 'UT': [40.150032, -111.862434],
      'VT': [44.045876, -72.710686], 'VA': [37.769337, -78.169968],
      'WA': [47.400902, -121.490494], 'WV': [38.491226, -80.954453],
      'WI': [44.268543, -89.616508], 'WY': [42.755966, -107.302490]
    };
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

    let state = null;

    // Try multiple patterns to extract state code
    // Pattern 1: State code followed by zip (e.g., "NY 10001")
    let stateMatch = contactInfo.match(/\b([A-Z]{2})\s+\d{5}\b/);
    if (stateMatch) {
      state = stateMatch[1];
    }

    // Pattern 2: State code with comma or period (e.g., "New York, NY" or "CA.")
    if (!state) {
      stateMatch = contactInfo.match(/,\s*([A-Z]{2})\s*[,.\s]/);
      if (stateMatch) {
        state = stateMatch[1];
      }
    }

    // Pattern 3: State code at end of string (e.g., "123 Main St NY")
    if (!state) {
      stateMatch = contactInfo.match(/\b([A-Z]{2})\s*$/);
      if (stateMatch) {
        state = stateMatch[1];
      }
    }

    // Pattern 4: Any 2-letter uppercase code that matches valid state
    if (!state) {
      const allMatches = contactInfo.match(/\b([A-Z]{2})\b/g);
      if (allMatches) {
        // Check if any match is a valid US state
        for (const match of allMatches) {
          if (this.US_STATE_COORDS[match]) {
            state = match;
            break;
          }
        }
      }
    }

    // Extract country (if "USA" or "United States" appears)
    const countryMatch = contactInfo.match(/\b(USA|United States|US)\b/i);
    const country = countryMatch ? 'USA' : (state ? 'USA' : 'Unknown');

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

      // DEBUG: Sample contact_info to understand data format
      const debugSamples = shortages.slice(0, 10).map(s => ({
        drug: s.generic_name,
        manufacturer: s.manufacturer,
        contact_info: s.contact_info || 'NULL'
      }));

      shortages.forEach(shortage => {
        const geoInfo = this.parseGeographicInfo(shortage.contact_info);

        if (geoInfo) {
          const region = geoInfo.state || geoInfo.country;
          const coords = geoInfo.state ? this.US_STATE_COORDS[geoInfo.state] : null;

          if (!byRegion[region]) {
            byRegion[region] = {
              region,
              state: geoInfo.state,
              country: geoInfo.country,
              latitude: coords ? coords[0] : null,
              longitude: coords ? coords[1] : null,
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
        debug_contact_samples: debugSamples, // DEBUG: Show sample contact_info
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

  /**
   * Temporal Trend Analysis
   * Analyze shortage patterns over time
   */
  async getTemporalTrends() {
    const cacheKey = this.cache.getCacheKey('shortage_temporal_trends');

    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch ALL shortages for comprehensive analysis
      const result = await this.fdaShortage.fetchAllShortages();

      if (result.status === 'error') {
        return result;
      }

      const allShortages = result.shortages;

      // 1. Group by month/year (initial posting date)
      const byMonth = {};
      const byYear = {};

      allShortages.forEach(shortage => {
        if (shortage.initial_date) {
          const date = new Date(shortage.initial_date);
          const year = date.getFullYear();
          const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;

          // By month
          if (!byMonth[month]) {
            byMonth[month] = { active: 0, resolved: 0, total: 0 };
          }
          byMonth[month].total++;
          if (shortage.status === 'active') {
            byMonth[month].active++;
          } else {
            byMonth[month].resolved++;
          }

          // By year
          if (!byYear[year]) {
            byYear[year] = { active: 0, resolved: 0, total: 0 };
          }
          byYear[year].total++;
          if (shortage.status === 'active') {
            byYear[year].active++;
          } else {
            byYear[year].resolved++;
          }
        }
      });

      // 2. Calculate shortage duration (for resolved shortages)
      const durations = [];
      allShortages.forEach(shortage => {
        if (shortage.status === 'resolved' && shortage.initial_date && shortage.resolution_date) {
          const start = new Date(shortage.initial_date);
          const end = new Date(shortage.resolution_date);
          const durationDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
          if (durationDays >= 0) {
            durations.push({
              drug: shortage.generic_name,
              manufacturer: shortage.manufacturer,
              category: shortage.therapeutic_categories[0] || 'Unknown',
              duration_days: durationDays,
              started: shortage.initial_date,
              resolved: shortage.resolution_date
            });
          }
        }
      });

      // Sort durations
      durations.sort((a, b) => b.duration_days - a.duration_days);

      // 3. Calculate average duration by category
      const durationByCategory = {};
      durations.forEach(d => {
        if (!durationByCategory[d.category]) {
          durationByCategory[d.category] = { total_days: 0, count: 0 };
        }
        durationByCategory[d.category].total_days += d.duration_days;
        durationByCategory[d.category].count++;
      });

      const avgDurationByCategory = Object.entries(durationByCategory).map(([category, data]) => ({
        category,
        avg_duration_days: Math.round(data.total_days / data.count),
        shortage_count: data.count
      })).sort((a, b) => b.avg_duration_days - a.avg_duration_days);

      // 4. Long-running active shortages (90+ days) - deduplicated by drug name
      const longRunningMap = new Map();
      allShortages.filter(s => {
        if (s.status === 'active' && s.initial_date) {
          const start = new Date(s.initial_date);
          const now = new Date();
          const daysSince = Math.round((now - start) / (1000 * 60 * 60 * 24));
          return daysSince >= 90;
        }
        return false;
      }).forEach(s => {
        const start = new Date(s.initial_date);
        const now = new Date();
        const daysSince = Math.round((now - start) / (1000 * 60 * 60 * 24));
        const drugKey = s.generic_name.toLowerCase();

        // Keep the longest duration for each unique drug
        if (!longRunningMap.has(drugKey) || longRunningMap.get(drugKey).days_since_start < daysSince) {
          longRunningMap.set(drugKey, {
            ndc: s.ndc,
            drug: s.generic_name,
            manufacturer: s.manufacturer,
            category: s.therapeutic_categories[0] || 'Unknown',
            days_since_start: daysSince,
            started: s.initial_date,
            variant_count: 1
          });
        } else {
          // Count variants
          longRunningMap.get(drugKey).variant_count++;
        }
      });

      const longRunning = Array.from(longRunningMap.values())
        .sort((a, b) => b.days_since_start - a.days_since_start);

      // Convert month/year objects to arrays
      const monthlyTrend = Object.entries(byMonth)
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month));

      const yearlyTrend = Object.entries(byYear)
        .map(([year, data]) => ({ year: parseInt(year), ...data }))
        .sort((a, b) => a.year - b.year);

      // Calculate median correctly (durations already sorted descending)
      const sortedDurations = [...durations].sort((a, b) => a.duration_days - b.duration_days);
      const medianDuration = sortedDurations.length > 0
        ? sortedDurations[Math.floor(sortedDurations.length / 2)].duration_days
        : 0;

      // 5. Manufacturer Risk Analysis
      const manufacturerStats = {};
      allShortages.forEach(s => {
        const mfg = s.manufacturer || 'Unknown';
        if (!manufacturerStats[mfg]) {
          manufacturerStats[mfg] = {
            total: 0,
            active: 0,
            resolved: 0,
            long_running: 0,
            total_duration_days: 0,
            resolved_count_for_avg: 0
          };
        }
        manufacturerStats[mfg].total++;
        if (s.status === 'active') {
          manufacturerStats[mfg].active++;
          const start = new Date(s.initial_date);
          const daysSince = Math.round((new Date() - start) / (1000 * 60 * 60 * 24));
          if (daysSince >= 90) {
            manufacturerStats[mfg].long_running++;
          }
        } else {
          manufacturerStats[mfg].resolved++;
        }

        // Calculate average resolution time
        if (s.status === 'resolved' && s.initial_date && s.resolution_date) {
          const durationDays = Math.round((new Date(s.resolution_date) - new Date(s.initial_date)) / (1000 * 60 * 60 * 24));
          if (durationDays >= 0) {
            manufacturerStats[mfg].total_duration_days += durationDays;
            manufacturerStats[mfg].resolved_count_for_avg++;
          }
        }
      });

      const manufacturerRisk = Object.entries(manufacturerStats)
        .map(([manufacturer, stats]) => ({
          manufacturer,
          total_shortages: stats.total,
          active_shortages: stats.active,
          resolved_shortages: stats.resolved,
          long_running_count: stats.long_running,
          avg_resolution_days: stats.resolved_count_for_avg > 0
            ? Math.round(stats.total_duration_days / stats.resolved_count_for_avg)
            : null,  // null instead of 0 when no data
          resolution_rate: stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0,
          has_resolution_data: stats.resolved_count_for_avg > 0
        }))
        .filter(m => m.active_shortages > 0)  // Only show manufacturers with active shortages
        .sort((a, b) => b.active_shortages - a.active_shortages);

      // 6. Year-over-year comparison
      const currentYear = new Date().getFullYear();
      const lastYear = currentYear - 1;

      const currentYearData = yearlyTrend.find(y => y.year === currentYear) || { active: 0, resolved: 0, total: 0 };
      const lastYearData = yearlyTrend.find(y => y.year === lastYear) || { active: 0, resolved: 0, total: 0 };

      const yoyComparison = {
        current_year: currentYear,
        current_active: currentYearData.active,
        current_resolved: currentYearData.resolved,
        current_total: currentYearData.total,
        last_year: lastYear,
        last_year_active: lastYearData.active,
        last_year_resolved: lastYearData.resolved,
        last_year_total: lastYearData.total,
        active_change_pct: lastYearData.active > 0
          ? Math.round(((currentYearData.active - lastYearData.active) / lastYearData.active) * 100)
          : 0,
        resolved_change_pct: lastYearData.resolved > 0
          ? Math.round(((currentYearData.resolved - lastYearData.resolved) / lastYearData.resolved) * 100)
          : 0
      };

      // 7. Resolution velocity metrics
      const now = new Date();
      const last30Days = allShortages.filter(s => {
        if (s.resolution_date) {
          const resolvedDate = new Date(s.resolution_date);
          const daysAgo = Math.round((now - resolvedDate) / (1000 * 60 * 60 * 24));
          return daysAgo <= 30;
        }
        return false;
      }).length;

      const last30DaysNew = allShortages.filter(s => {
        if (s.initial_date) {
          const initialDate = new Date(s.initial_date);
          const daysAgo = Math.round((now - initialDate) / (1000 * 60 * 60 * 24));
          return daysAgo <= 30;
        }
        return false;
      }).length;

      const resolutionVelocity = {
        resolved_last_30_days: last30Days,
        new_last_30_days: last30DaysNew,
        net_change: last30Days - last30DaysNew
      };

      // 8. Category-specific detailed breakdown
      const categoryDetails = {};
      allShortages.forEach(s => {
        const category = s.therapeutic_categories[0] || 'Unknown';
        if (!categoryDetails[category]) {
          categoryDetails[category] = {
            total: 0,
            active: 0,
            resolved: 0,
            long_running: 0,
            resolved_in_90_days: 0,
            manufacturers: new Set()
          };
        }
        categoryDetails[category].total++;
        categoryDetails[category].manufacturers.add(s.manufacturer);

        if (s.status === 'active') {
          categoryDetails[category].active++;
          const start = new Date(s.initial_date);
          const daysSince = Math.round((new Date() - start) / (1000 * 60 * 60 * 24));
          if (daysSince >= 90) {
            categoryDetails[category].long_running++;
          }
        } else {
          categoryDetails[category].resolved++;
          if (s.initial_date && s.resolution_date) {
            const durationDays = Math.round((new Date(s.resolution_date) - new Date(s.initial_date)) / (1000 * 60 * 60 * 24));
            if (durationDays <= 90) {
              categoryDetails[category].resolved_in_90_days++;
            }
          }
        }
      });

      const categoryBreakdown = Object.entries(categoryDetails).map(([category, stats]) => ({
        category,
        total_shortages: stats.total,
        active: stats.active,
        resolved: stats.resolved,
        long_running_count: stats.long_running,
        resolved_quickly: stats.resolved_in_90_days,
        quick_resolution_rate: stats.resolved > 0 ? Math.round((stats.resolved_in_90_days / stats.resolved) * 100) : 0,
        manufacturer_count: stats.manufacturers.size,
        severity_score: (stats.active * 2) + (stats.long_running * 3)
      })).sort((a, b) => b.severity_score - a.severity_score);

      // 9. Cohort analysis - group by start year
      const cohorts = {};
      allShortages.forEach(s => {
        if (s.initial_date) {
          const year = new Date(s.initial_date).getFullYear();
          if (!cohorts[year]) {
            cohorts[year] = { total: 0, still_active: 0, resolved: 0, durations: [] };
          }
          cohorts[year].total++;
          if (s.status === 'active') {
            cohorts[year].still_active++;
          } else {
            cohorts[year].resolved++;
            if (s.resolution_date) {
              const durationDays = Math.round((new Date(s.resolution_date) - new Date(s.initial_date)) / (1000 * 60 * 60 * 24));
              cohorts[year].durations.push(durationDays);
            }
          }
        }
      });

      const cohortAnalysis = Object.entries(cohorts).map(([year, data]) => ({
        cohort_year: parseInt(year),
        total_shortages: data.total,
        still_active: data.still_active,
        resolved: data.resolved,
        resolution_rate: Math.round((data.resolved / data.total) * 100),
        avg_duration: data.durations.length > 0
          ? Math.round(data.durations.reduce((sum, d) => sum + d, 0) / data.durations.length)
          : 0
      })).sort((a, b) => b.cohort_year - a.cohort_year);

      // 10. Simple prediction for active shortages
      const activeShortagePredictions = allShortages
        .filter(s => s.status === 'active' && s.initial_date)
        .map(s => {
          const category = s.therapeutic_categories[0] || 'Unknown';
          const categoryAvg = avgDurationByCategory.find(c => c.category === category);
          const predictedDays = categoryAvg ? categoryAvg.avg_duration_days : (durations.length > 0 ? Math.round(durations.reduce((sum, d) => sum + d.duration_days, 0) / durations.length) : 90);

          const startDate = new Date(s.initial_date);
          const predictedEndDate = new Date(startDate.getTime() + (predictedDays * 24 * 60 * 60 * 1000));
          const daysActive = Math.round((new Date() - startDate) / (1000 * 60 * 60 * 24));
          const estimatedRemaining = Math.max(0, predictedDays - daysActive);

          return {
            ndc: s.ndc,
            drug: s.generic_name,
            days_active: daysActive,
            predicted_total_duration: predictedDays,
            estimated_days_remaining: estimatedRemaining,
            predicted_resolution_date: predictedEndDate.toISOString().split('T')[0],
            confidence: estimatedRemaining > predictedDays ? 'low' : (estimatedRemaining > predictedDays / 2 ? 'medium' : 'high')
          };
        })
        .filter(p => p.estimated_days_remaining > 0)
        .sort((a, b) => a.estimated_days_remaining - b.estimated_days_remaining)
        .slice(0, 20);

      const response = {
        status: 'success',
        trends: {
          monthly: monthlyTrend.slice(-24), // Last 24 months
          yearly: yearlyTrend,
          average_duration_days: durations.length > 0
            ? Math.round(durations.reduce((sum, d) => sum + d.duration_days, 0) / durations.length)
            : 0,
          median_duration_days: medianDuration,
          longest_resolved: durations.slice(0, 10),
          long_running_active: longRunning.slice(0, 20),
          avg_duration_by_category: avgDurationByCategory.slice(0, 15),
          total_shortages: allShortages.length,
          active_shortages: allShortages.filter(s => s.status === 'active').length,
          resolved_shortages: allShortages.filter(s => s.status === 'resolved').length,
          manufacturer_risk: manufacturerRisk.slice(0, 15),
          yoy_comparison: yoyComparison,
          resolution_velocity: resolutionVelocity,
          category_breakdown: categoryBreakdown.slice(0, 20),
          cohort_analysis: cohortAnalysis.slice(0, 10),
          shortage_predictions: activeShortagePredictions
        }
      };

      this.cache.set(cacheKey, response, 3600);

      return response;

    } catch (error) {
      return {
        status: 'error',
        error_message: `Error computing temporal trends: ${error.message}`
      };
    }
  }

  /**
   * Analyze shortage reasons across all active shortages
   * Categorizes and aggregates root causes
   */
  async getShortageReasons() {
    const cacheKey = this.cache.getCacheKey('shortage_reasons_analysis');

    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch ALL shortages
      const result = await this.fdaShortage.fetchAllShortages();

      if (result.status === 'error') {
        return result;
      }

      const allShortages = result.shortages;
      const activeShortages = allShortages.filter(s => s.status === 'active');

      // Categorize shortage reasons
      const reasonCategories = {
        manufacturing: {
          name: 'Manufacturing Issues',
          keywords: ['manufacturing', 'production', 'delay', 'capacity', 'facility', 'plant', 'quality', 'contamination', 'equipment'],
          shortages: [],
          count: 0,
          examples: []
        },
        demand: {
          name: 'Increased Demand',
          keywords: ['demand', 'increase', 'usage', 'consumption', 'utilization'],
          shortages: [],
          count: 0,
          examples: []
        },
        raw_materials: {
          name: 'Raw Material Shortage',
          keywords: ['material', 'api', 'ingredient', 'component', 'supply'],
          shortages: [],
          count: 0,
          examples: []
        },
        regulatory: {
          name: 'Regulatory/Quality Issues',
          keywords: ['fda', 'regulatory', 'inspection', 'warning letter', 'compliance', 'recall', 'quality'],
          shortages: [],
          count: 0,
          examples: []
        },
        discontinuation: {
          name: 'Product Discontinuation',
          keywords: ['discontinu', 'ceased', 'stopped', 'ended'],
          shortages: [],
          count: 0,
          examples: []
        },
        business: {
          name: 'Business Decision',
          keywords: ['business decision', 'commercial', 'market', 'financial'],
          shortages: [],
          count: 0,
          examples: []
        },
        unknown: {
          name: 'Unknown/Not Specified',
          keywords: [],
          shortages: [],
          count: 0,
          examples: []
        }
      };

      // Categorize each active shortage
      activeShortages.forEach(shortage => {
        const reason = (shortage.shortage_reason || '').toLowerCase();

        if (!reason || reason.trim() === '') {
          reasonCategories.unknown.shortages.push(shortage);
          reasonCategories.unknown.count++;
          return;
        }

        let categorized = false;

        // Check each category for keyword matches
        for (const [key, category] of Object.entries(reasonCategories)) {
          if (key === 'unknown') continue;

          const matched = category.keywords.some(keyword => reason.includes(keyword));

          if (matched) {
            category.shortages.push(shortage);
            category.count++;

            // Store first 3 examples
            if (category.examples.length < 3) {
              category.examples.push({
                drug: shortage.generic_name,
                reason: shortage.shortage_reason
              });
            }

            categorized = true;
            break; // Only categorize into first match
          }
        }

        if (!categorized) {
          reasonCategories.unknown.shortages.push(shortage);
          reasonCategories.unknown.count++;
          if (reasonCategories.unknown.examples.length < 3) {
            reasonCategories.unknown.examples.push({
              drug: shortage.generic_name,
              reason: shortage.shortage_reason
            });
          }
        }
      });

      // Build summary
      const summary = Object.entries(reasonCategories)
        .map(([key, category]) => ({
          category: category.name,
          count: category.count,
          percentage: ((category.count / activeShortages.length) * 100).toFixed(1),
          examples: category.examples
        }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);

      const response = {
        status: 'success',
        reasons: {
          summary,
          total_active_shortages: activeShortages.length,
          categorized: activeShortages.length - reasonCategories.unknown.count,
          uncategorized: reasonCategories.unknown.count,
          top_reason: summary[0],
          insights: this.generateReasonInsights(summary, activeShortages.length)
        }
      };

      this.cache.set(cacheKey, response, 3600); // 1 hour cache

      return response;

    } catch (error) {
      return {
        status: 'error',
        error_message: `Error analyzing shortage reasons: ${error.message}`
      };
    }
  }

  /**
   * Generate insights from shortage reasons analysis
   */
  generateReasonInsights(summary, totalShortages) {
    const insights = [];

    if (summary.length === 0) {
      return ['No shortage reason data available'];
    }

    const topReason = summary[0];

    // Top reason insight
    insights.push(`${topReason.category} is the leading cause of active shortages (${topReason.count} drugs, ${topReason.percentage}%)`);

    // Manufacturing issues
    const manufacturing = summary.find(s => s.category.includes('Manufacturing'));
    if (manufacturing && parseFloat(manufacturing.percentage) > 40) {
      insights.push(`Critical: Over 40% of shortages stem from manufacturing problems - indicates systemic production capacity issues`);
    }

    // Regulatory issues
    const regulatory = summary.find(s => s.category.includes('Regulatory'));
    if (regulatory && parseFloat(regulatory.percentage) > 20) {
      insights.push(`Significant regulatory/quality issues detected (${regulatory.percentage}%) - FDA enforcement may be factor`);
    }

    // Demand spikes
    const demand = summary.find(s => s.category.includes('Demand'));
    if (demand && parseFloat(demand.percentage) > 15) {
      insights.push(`Demand surges account for ${demand.percentage}% of shortages - may indicate treatment pattern changes or public health events`);
    }

    // Raw materials
    const rawMaterials = summary.find(s => s.category.includes('Raw Material'));
    if (rawMaterials && rawMaterials.count > 0) {
      insights.push(`${rawMaterials.count} shortages due to raw material constraints - upstream supply chain vulnerability`);
    }

    return insights;
  }

  /**
   * Enrich shortage with historical duration data
   * Uses local history database to provide accurate duration calculations
   */
  async enrichWithHistoricalData(shortage) {
    if (!this.history) {
      return shortage; // No history service available
    }

    try {
      await this.history.initialize();

      // Get actual duration from historical data
      const actualDuration = await this.history.getActualDuration(shortage.ndc);

      if (actualDuration !== null) {
        shortage.actual_duration_days = actualDuration;
        shortage.duration_source = 'historical_tracking';
      }

      return shortage;

    } catch (error) {
      console.error('[ShortageService] Error enriching with historical data:', error);
      return shortage;
    }
  }

  /**
   * Enrich multiple shortages with historical data
   */
  async enrichManyWithHistoricalData(shortages) {
    if (!this.history || !Array.isArray(shortages)) {
      return shortages;
    }

    const enriched = await Promise.all(
      shortages.map(shortage => this.enrichWithHistoricalData(shortage))
    );

    return enriched;
  }

  /**
   * Get therapeutic alternatives for a shortage drug
   * Uses RxNorm to find drugs in the same therapeutic class
   */
  async getTherapeuticAlternatives(shortage) {
    if (!this.rxnorm) {
      return {
        status: 'error',
        error_message: 'RxNorm service not available'
      };
    }

    try {
      const drugName = shortage.generic_name || shortage.brand_name;

      if (!drugName) {
        return {
          status: 'error',
          error_message: 'No drug name available'
        };
      }

      // Step 1: Normalize the drug name to get RxCUI
      const normalized = await this.rxnorm.normalizeDrugName(drugName);

      if (normalized.status !== 'success') {
        return {
          status: 'not_found',
          drug_name: drugName,
          message: 'Could not normalize drug name',
          details: normalized
        };
      }

      // Step 2: Get therapeutic alternatives
      const alternatives = await this.rxnorm.getTherapeuticAlternatives(normalized.rxcui);

      if (alternatives.status !== 'success') {
        return {
          status: 'not_found',
          drug_name: drugName,
          rxcui: normalized.rxcui,
          message: 'Could not find therapeutic alternatives',
          details: alternatives
        };
      }

      // Step 3: Check which alternatives are also in shortage
      const allShortages = await this.fdaShortage.fetchAllShortages();
      const shortageNames = new Set();

      if (allShortages.status === 'success' && allShortages.shortages) {
        allShortages.shortages.forEach(s => {
          if (s.generic_name) shortageNames.add(s.generic_name.toLowerCase());
          if (s.brand_name) shortageNames.add(s.brand_name.toLowerCase());
        });
      }

      // Mark alternatives that are also in shortage
      const enrichedAlternatives = alternatives.alternatives.map(alt => ({
        ...alt,
        also_in_shortage: shortageNames.has(alt.name.toLowerCase())
      }));

      return {
        status: 'success',
        shortage_drug: {
          ndc: shortage.ndc,
          generic_name: shortage.generic_name,
          brand_name: shortage.brand_name,
          rxcui: normalized.rxcui,
          normalized_name: normalized.name
        },
        therapeutic_classes: alternatives.therapeutic_classes,
        primary_class: alternatives.primary_class,
        alternatives: enrichedAlternatives,
        available_alternatives: enrichedAlternatives.filter(a => !a.also_in_shortage),
        total_alternatives: alternatives.total_alternatives,
        available_count: enrichedAlternatives.filter(a => !a.also_in_shortage).length
      };

    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to get therapeutic alternatives: ${error.message}`
      };
    }
  }

  /**
   * Enrich shortage with therapeutic alternatives
   */
  async enrichWithTherapeuticAlternatives(shortage) {
    if (!this.rxnorm) {
      return shortage; // No RxNorm service available
    }

    try {
      const alternatives = await this.getTherapeuticAlternatives(shortage);

      if (alternatives.status === 'success') {
        shortage.therapeutic_alternatives = {
          total: alternatives.total_alternatives,
          available: alternatives.available_count,
          alternatives: alternatives.available_alternatives.slice(0, 10), // Limit to 10
          therapeutic_class: alternatives.primary_class?.className
        };
      }

      return shortage;

    } catch (error) {
      console.error('[ShortageService] Error enriching with therapeutic alternatives:', error);
      return shortage;
    }
  }

  /**
   * Get summary statistics for dashboard
   */
  async getStats() {
    try {
      const result = await this.fdaShortage.fetchAllShortages();

      if (result.status === 'error') {
        return result;
      }

      const allShortages = result.shortages || [];
      const activeShortages = allShortages.filter(s => s.status === 'active');
      const resolvedShortages = allShortages.filter(s => s.status === 'resolved');

      return {
        status: 'success',
        total_active: activeShortages.length,
        total_resolved: resolvedShortages.length,
        total_all: allShortages.length
      };
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error fetching stats: ${error.message}`
      };
    }
  }

  /**
   * Get list of therapeutic categories
   */
  async getTherapeuticCategories() {
    try {
      return await this.fdaShortage.getTherapeuticCategories();
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error fetching therapeutic categories: ${error.message}`
      };
    }
  }

  /**
   * Get list of manufacturers
   */
  async getManufacturers() {
    try {
      return await this.fdaShortage.getManufacturers();
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error fetching manufacturers: ${error.message}`
      };
    }
  }

  /**
   * Get enriched shortage detail by NDC
   */
  async getShortageDetailEnriched(ndc, enrich = true) {
    try {
      const shortageResult = await this.getShortageDetail(ndc);

      if (shortageResult.status === 'error') {
        return shortageResult;
      }

      if (!enrich || !shortageResult.shortage) {
        return shortageResult;
      }

      // Enrich the shortage with additional data
      return await this.enrichShortage(shortageResult.shortage);
    } catch (error) {
      return {
        status: 'error',
        error_message: `Error fetching enriched shortage detail: ${error.message}`
      };
    }
  }
}

export default ShortageService;
