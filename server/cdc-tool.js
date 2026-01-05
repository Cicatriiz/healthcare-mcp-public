import BaseTool from './base-tool.js';

/**
 * CDC (Centers for Disease Control and Prevention) Tool
 * Provides public health data and statistics
 *
 * Note: CDC WONDER database doesn't have a public REST API
 * This tool provides access to CDC's open data portal
 *
 * API Documentation: https://data.cdc.gov/api-documentation
 */
class CDCTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.name = 'CDC Public Health Data';
    this.baseUrl = 'https://data.cdc.gov/resource';

    // Relevant dataset IDs from data.cdc.gov
    this.datasets = {
      mortality: 'bi63-dtpu',                  // Weekly Provisional Counts of Deaths
      drug_overdose: 'xkb8-kh2a',             // Drug Overdose Death Counts
      covid_vaccinations: 'unsk-b7fc',        // COVID-19 Vaccinations
      chronic_disease: 'g4ie-h725',           // U.S. Chronic Disease Indicators
      healthcare_associated_infections: '77hc-ibv8' // Healthcare Associated Infections
    };
  }

  /**
   * Get mortality data by state and cause
   */
  async getMortalityData(params = {}) {
    const cacheKey = this.getCacheKey('cdc_mortality', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const queryParams = {
        $limit: params.limit || 100,
        $offset: params.offset || 0,
        ...(params.state && { jurisdiction_of_occurrence: params.state }),
        ...(params.year && { mmwryear: params.year })
      };

      const url = this.buildUrl(`${this.baseUrl}/${this.datasets.mortality}.json`, queryParams);
      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        total_records: data.length,
        mortality_data: data.map(record => ({
          jurisdiction: record.jurisdiction_of_occurrence,
          year: record.mmwryear,
          week: record.mmwrweek,
          all_causes: parseInt(record.all_cause) || 0,
          natural_causes: parseInt(record.natural_cause) || 0,
          septicemia: parseInt(record.septicemia_a40_a41) || 0,
          influenza_pneumonia: parseInt(record.influenza_and_pneumonia_j09_j18) || 0
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching mortality data: ${error.message}`);
    }
  }

  /**
   * Get drug overdose death statistics
   */
  async getDrugOverdoseData(params = {}) {
    const cacheKey = this.getCacheKey('cdc_overdose', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const queryParams = {
        $limit: params.limit || 100,
        $offset: params.offset || 0,
        ...(params.state && { state: params.state }),
        ...(params.year && { year: params.year })
      };

      const url = this.buildUrl(`${this.baseUrl}/${this.datasets.drug_overdose}.json`, queryParams);
      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        total_records: data.length,
        overdose_data: data.map(record => ({
          state: record.state,
          year: record.year,
          month: record.month,
          indicator: record.indicator,
          data_value: parseFloat(record.data_value) || 0,
          predicted_value: parseFloat(record.predicted_value) || null
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching overdose data: ${error.message}`);
    }
  }

  /**
   * Get chronic disease indicators
   */
  async getChronicDiseaseIndicators(params = {}) {
    const cacheKey = this.getCacheKey('cdc_chronic_disease', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const queryParams = {
        $limit: params.limit || 100,
        $offset: params.offset || 0,
        ...(params.state && { locationabbr: params.state }),
        ...(params.topic && { topic: params.topic })
      };

      const url = this.buildUrl(`${this.baseUrl}/${this.datasets.chronic_disease}.json`, queryParams);
      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        total_records: data.length,
        indicators: data.map(record => ({
          year: record.yearstart,
          state: record.locationabbr,
          topic: record.topic,
          question: record.question,
          data_value: parseFloat(record.datavalue) || null,
          data_value_unit: record.datavaluetype,
          stratification: record.stratification1
        }))
      });

      this.cache.set(cacheKey, result, 86400 * 7); // 7 days
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching chronic disease data: ${error.message}`);
    }
  }

  /**
   * Get healthcare associated infections data
   */
  async getHealthcareInfections(params = {}) {
    const cacheKey = this.getCacheKey('cdc_infections', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const queryParams = {
        $limit: params.limit || 100,
        $offset: params.offset || 0,
        ...(params.state && { state: params.state }),
        ...(params.facility_type && { facility_type: params.facility_type })
      };

      const url = this.buildUrl(`${this.baseUrl}/${this.datasets.healthcare_associated_infections}.json`, queryParams);
      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        total_records: data.length,
        infections: data.map(record => ({
          state: record.state,
          facility_id: record.facility_id,
          facility_name: record.facility_name,
          measure_name: record.measure_name,
          compared_to_national: record.compared_to_national,
          score: record.score
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching infection data: ${error.message}`);
    }
  }

  /**
   * Analyze health impact of drug shortages
   */
  async analyzeShortageHealthImpact(state, shortageCategory) {
    const cacheKey = this.getCacheKey('cdc_shortage_impact', state, shortageCategory);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const currentYear = new Date().getFullYear();

      // Get relevant health data for the state
      const [mortalityResult, chronicDiseaseResult] = await Promise.allSettled([
        this.getMortalityData({ state, year: currentYear, limit: 52 }),
        this.getChronicDiseaseIndicators({ state, limit: 100 })
      ]);

      const mortality = mortalityResult.status === 'fulfilled' ? mortalityResult.value : null;
      const chronicDisease = chronicDiseaseResult.status === 'fulfilled' ? chronicDiseaseResult.value : null;

      const analysis = {
        state,
        shortage_category: shortageCategory,
        health_vulnerability_assessment: this.assessHealthVulnerability(
          mortality,
          chronicDisease,
          shortageCategory
        ),
        data_availability: {
          mortality: mortality?.status === 'success',
          chronic_disease: chronicDisease?.status === 'success'
        }
      };

      const result = this.formatSuccessResponse(analysis);
      this.cache.set(cacheKey, result, 3600); // 1 hour
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error analyzing health impact: ${error.message}`);
    }
  }

  /**
   * Assess health vulnerability based on shortage type
   */
  assessHealthVulnerability(mortalityData, chronicDiseaseData, shortageCategory) {
    const vulnerability = {
      risk_level: 'moderate',
      affected_populations: [],
      recommendations: []
    };

    // Antibiotics shortage
    if (shortageCategory?.toLowerCase().includes('antibiotic') ||
        shortageCategory?.toLowerCase().includes('anti-infective')) {
      vulnerability.risk_level = 'high';
      vulnerability.affected_populations.push('Immunocompromised patients');
      vulnerability.affected_populations.push('Surgical patients');
      vulnerability.recommendations.push('Prioritize antibiotic stewardship programs');
      vulnerability.recommendations.push('Establish alternative treatment protocols');
    }

    // Cardiovascular drug shortage
    if (shortageCategory?.toLowerCase().includes('cardiovascular') ||
        shortageCategory?.toLowerCase().includes('cardiac')) {
      vulnerability.risk_level = 'high';
      vulnerability.affected_populations.push('Cardiovascular disease patients');
      vulnerability.affected_populations.push('Hypertension patients');
      vulnerability.recommendations.push('Review therapeutic substitution protocols');
      vulnerability.recommendations.push('Coordinate with cardiology departments');
    }

    // Anesthesia/sedation shortage
    if (shortageCategory?.toLowerCase().includes('anesthesia') ||
        shortageCategory?.toLowerCase().includes('sedation')) {
      vulnerability.risk_level = 'very_high';
      vulnerability.affected_populations.push('Surgical patients');
      vulnerability.affected_populations.push('Critical care patients');
      vulnerability.recommendations.push('Review and potentially postpone elective surgeries');
      vulnerability.recommendations.push('Develop alternative anesthetic protocols');
    }

    // Oncology drug shortage
    if (shortageCategory?.toLowerCase().includes('oncology') ||
        shortageCategory?.toLowerCase().includes('chemotherapy')) {
      vulnerability.risk_level = 'very_high';
      vulnerability.affected_populations.push('Cancer patients');
      vulnerability.recommendations.push('Immediate oncology department notification');
      vulnerability.recommendations.push('Review treatment protocols with oncologists');
    }

    // Diabetes drug shortage
    if (shortageCategory?.toLowerCase().includes('diabetes') ||
        shortageCategory?.toLowerCase().includes('insulin')) {
      vulnerability.risk_level = 'high';
      vulnerability.affected_populations.push('Diabetes patients');
      vulnerability.recommendations.push('Patient education on shortage and alternatives');
      vulnerability.recommendations.push('Coordinate with endocrinology departments');
    }

    return vulnerability;
  }

  /**
   * Get public health trends relevant to drug utilization
   */
  async getPublicHealthTrends(state, year) {
    const cacheKey = this.getCacheKey('cdc_health_trends', state, year);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const [mortalityResult, chronicDiseaseResult, overdoseResult] = await Promise.allSettled([
        this.getMortalityData({ state, year, limit: 52 }),
        this.getChronicDiseaseIndicators({ state, limit: 200 }),
        this.getDrugOverdoseData({ state, year, limit: 12 })
      ]);

      const result = this.formatSuccessResponse({
        state,
        year,
        mortality_trends: mortalityResult.status === 'fulfilled' ? mortalityResult.value : { status: 'unavailable' },
        chronic_disease_burden: chronicDiseaseResult.status === 'fulfilled' ? chronicDiseaseResult.value : { status: 'unavailable' },
        overdose_statistics: overdoseResult.status === 'fulfilled' ? overdoseResult.value : { status: 'unavailable' },
        generated_at: new Date().toISOString()
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching health trends: ${error.message}`);
    }
  }
}

export default CDCTool;
