import BaseTool from './base-tool.js';

/**
 * CMS (Centers for Medicare & Medicaid Services) Tool
 * Provides hospital quality reporting and healthcare facility data
 *
 * API Documentation: https://data.cms.gov/provider-data/
 */
class CMSTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.name = 'CMS Hospital Quality Data';
    this.baseUrl = 'https://data.cms.gov/data-api/v1/dataset';

    // Relevant dataset IDs
    this.datasets = {
      hospital_general_info: 'xubh-q36u',  // Hospital General Information
      hospital_spending: '52xa-v2xy',      // Medicare Hospital Spending by Claim
      complications_deaths: 'ynj2-r877',   // Complications and Deaths
      readmissions: '9n3s-kdb3',           // Hospital Readmissions Reduction
      timely_effective_care: 'yv7e-xc69'   // Timely and Effective Care
    };
  }

  /**
   * Get hospital information by state
   */
  async getHospitalsByState(state) {
    const cacheKey = this.getCacheKey('cms_hospitals_state', state);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl(
        `${this.baseUrl}/${this.datasets.hospital_general_info}/data`,
        {
          filter: `state:${state}`,
          size: 100
        }
      );

      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        state,
        hospital_count: data.length || 0,
        hospitals: data.map(h => ({
          name: h.facility_name,
          address: h.address,
          city: h.city,
          zip: h.zip_code,
          phone: h.phone_number,
          type: h.hospital_type,
          ownership: h.hospital_ownership,
          emergency_services: h.emergency_services === 'Yes',
          overall_rating: h.hospital_overall_rating
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching hospitals: ${error.message}`);
    }
  }

  /**
   * Get hospital spending patterns
   */
  async getHospitalSpending(params = {}) {
    const cacheKey = this.getCacheKey('cms_spending', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl(
        `${this.baseUrl}/${this.datasets.hospital_spending}/data`,
        {
          size: params.limit || 100,
          offset: params.offset || 0
        }
      );

      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        total_records: data.length,
        spending_data: data.map(s => ({
          hospital_name: s.hospital_name,
          state: s.state,
          claim_type: s.claim_type,
          period: s.period,
          avg_spending_per_episode: s.avg_spending_per_episode_hospital,
          avg_spending_state: s.avg_spending_per_episode_state,
          avg_spending_national: s.avg_spending_per_episode_nation,
          percent_of_spending_hospital: s.percent_of_spending_hospital,
          percent_of_spending_state: s.percent_of_spending_state,
          percent_of_spending_nation: s.percent_of_spending_nation
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching spending data: ${error.message}`);
    }
  }

  /**
   * Get hospital complications and death rates
   */
  async getComplicationsDeaths(params = {}) {
    const cacheKey = this.getCacheKey('cms_complications', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl(
        `${this.baseUrl}/${this.datasets.complications_deaths}/data`,
        {
          size: params.limit || 100,
          offset: params.offset || 0,
          ...(params.state && { filter: `state:${params.state}` })
        }
      );

      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        total_records: data.length,
        complications: data.map(c => ({
          hospital_name: c.hospital_name,
          state: c.state,
          measure_name: c.measure_name,
          compared_to_national: c.compared_to_national,
          score: c.score,
          footnote: c.footnote
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching complications data: ${error.message}`);
    }
  }

  /**
   * Get hospital readmission rates
   */
  async getReadmissionRates(params = {}) {
    const cacheKey = this.getCacheKey('cms_readmissions', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl(
        `${this.baseUrl}/${this.datasets.readmissions}/data`,
        {
          size: params.limit || 100,
          offset: params.offset || 0,
          ...(params.state && { filter: `state:${params.state}` })
        }
      );

      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        total_records: data.length,
        readmissions: data.map(r => ({
          hospital_name: r.hospital_name,
          state: r.state,
          measure_name: r.measure_name,
          compared_to_national: r.compared_to_national,
          excess_readmission_ratio: r.excess_readmission_ratio,
          predicted_readmission_rate: r.predicted_readmission_rate,
          expected_readmission_rate: r.expected_readmission_rate,
          number_of_readmissions: r.number_of_readmissions
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching readmission data: ${error.message}`);
    }
  }

  /**
   * Analyze drug shortage impact on hospitals by state
   */
  async analyzeShortageImpact(state, shortageCategory) {
    const cacheKey = this.getCacheKey('cms_shortage_impact', state, shortageCategory);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Get hospitals and complications for the state
      const [hospitalsResult, complicationsResult] = await Promise.allSettled([
        this.getHospitalsByState(state),
        this.getComplicationsDeaths({ state, limit: 500 })
      ]);

      const hospitals = hospitalsResult.status === 'fulfilled' ? hospitalsResult.value : null;
      const complications = complicationsResult.status === 'fulfilled' ? complicationsResult.value : null;

      if (!hospitals || hospitals.status === 'error') {
        throw new Error('Failed to fetch hospital data');
      }

      const analysis = {
        state,
        shortage_category: shortageCategory,
        hospital_count: hospitals.hospital_count,
        high_risk_facilities: hospitals.hospitals.filter(h =>
          h.overall_rating && parseInt(h.overall_rating) <= 2
        ).length,
        facilities_with_emergency_services: hospitals.hospitals.filter(h =>
          h.emergency_services
        ).length,
        potential_impact_assessment: this.assessImpact(hospitals, complications, shortageCategory)
      };

      const result = this.formatSuccessResponse(analysis);
      this.cache.set(cacheKey, result, 3600); // 1 hour
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error analyzing shortage impact: ${error.message}`);
    }
  }

  /**
   * Assess potential impact of drug shortage on healthcare facilities
   */
  assessImpact(hospitalsData, complicationsData, shortageCategory) {
    const totalHospitals = hospitalsData.hospital_count;
    const emergencyServicesCount = hospitalsData.hospitals.filter(h => h.emergency_services).length;

    let riskLevel = 'moderate';
    let impactDescription = '';

    // Emergency/critical care drugs have highest impact
    if (shortageCategory && (
      shortageCategory.toLowerCase().includes('anesthesia') ||
      shortageCategory.toLowerCase().includes('cardiovascular') ||
      shortageCategory.toLowerCase().includes('emergency') ||
      shortageCategory.toLowerCase().includes('antibiotic')
    )) {
      riskLevel = 'high';
      impactDescription = `HIGH RISK: ${emergencyServicesCount} facilities with emergency services may be severely impacted by ${shortageCategory} shortage`;
    } else {
      impactDescription = `MODERATE RISK: ${totalHospitals} healthcare facilities may experience supply constraints`;
    }

    return {
      risk_level: riskLevel,
      description: impactDescription,
      affected_facilities_estimate: emergencyServicesCount,
      recommendation: riskLevel === 'high'
        ? 'Immediate coordination with state health department and facility procurement officers recommended'
        : 'Monitor situation and establish alternative supplier relationships'
    };
  }
}

export default CMSTool;
