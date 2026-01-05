import BaseTool from './base-tool.js';

/**
 * Census Bureau API Tool
 * Provides demographic, economic, and geographic data
 *
 * API Documentation: https://www.census.gov/data/developers/data-sets.html
 */
class CensusTool extends BaseTool {
  constructor(cacheService, apiKey) {
    super(cacheService);
    this.name = 'U.S. Census Bureau';
    this.baseUrl = 'https://api.census.gov/data';
    this.apiKey = apiKey || process.env.CENSUS_API_KEY;

    // Dataset endpoints
    this.datasets = {
      acs5: '2022/acs/acs5',              // American Community Survey 5-Year
      business_patterns: '2021/cbp',       // County Business Patterns
      economic_census: '2017/ecnbasic',    // Economic Census
      international_trade: '2022/timeseries/intltrade/exports/hs' // International Trade
    };
  }

  /**
   * Get population demographics by state
   */
  async getStateDemographics(state) {
    const cacheKey = this.getCacheKey('census_demographics', state);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl(
        `${this.baseUrl}/${this.datasets.acs5}`,
        {
          get: 'NAME,B01001_001E,B01002_001E,B19013_001E,B17001_002E',
          for: `state:${state}`,
          ...(this.apiKey && { key: this.apiKey })
        }
      );

      const data = await this.makeRequest(url);

      if (!Array.isArray(data) || data.length < 2) {
        throw new Error('Invalid census data response');
      }

      const [headers, ...values] = data;
      const stateData = values[0];

      const result = this.formatSuccessResponse({
        state: stateData[0],
        total_population: parseInt(stateData[1]),
        median_age: parseFloat(stateData[2]),
        median_household_income: parseInt(stateData[3]),
        population_below_poverty: parseInt(stateData[4]),
        poverty_rate: ((parseInt(stateData[4]) / parseInt(stateData[1])) * 100).toFixed(2)
      });

      this.cache.set(cacheKey, result, 86400 * 7); // 7 days
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching demographics: ${error.message}`);
    }
  }

  /**
   * Get pharmaceutical manufacturing establishments by state
   */
  async getPharmaManufacturingByState(state, year = '2021') {
    const cacheKey = this.getCacheKey('census_pharma_mfg', state, year);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      // NAICS code 3254 = Pharmaceutical and Medicine Manufacturing
      const url = this.buildUrl(
        `${this.baseUrl}/${year}/cbp`,
        {
          get: 'NAME,ESTAB,EMP,PAYANN',
          for: `state:${state}`,
          NAICS2017: '3254',
          ...(this.apiKey && { key: this.apiKey })
        }
      );

      const data = await this.makeRequest(url);

      if (!Array.isArray(data) || data.length < 2) {
        return this.formatSuccessResponse({
          state,
          year,
          establishments: 0,
          employees: 0,
          annual_payroll: 0,
          message: 'No pharmaceutical manufacturing data available for this state'
        });
      }

      const [headers, ...values] = data;
      const stateData = values[0];

      const result = this.formatSuccessResponse({
        state: stateData[0],
        year,
        establishments: parseInt(stateData[1]) || 0,
        employees: parseInt(stateData[2]) || 0,
        annual_payroll: parseInt(stateData[3]) || 0,
        avg_payroll_per_employee: stateData[2] > 0
          ? Math.round(parseInt(stateData[3]) / parseInt(stateData[2]))
          : 0
      });

      this.cache.set(cacheKey, result, 86400 * 30); // 30 days
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching manufacturing data: ${error.message}`);
    }
  }

  /**
   * Get pharmaceutical industry employment statistics
   */
  async getNationalPharmaEmployment(year = '2021') {
    const cacheKey = this.getCacheKey('census_national_pharma', year);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl(
        `${this.baseUrl}/${year}/cbp`,
        {
          get: 'STATE,NAME,ESTAB,EMP,PAYANN',
          for: 'state:*',
          NAICS2017: '3254',
          ...(this.apiKey && { key: this.apiKey })
        }
      );

      const data = await this.makeRequest(url);

      if (!Array.isArray(data) || data.length < 2) {
        throw new Error('Invalid census data response');
      }

      const [headers, ...values] = data;

      const stateData = values.map(row => ({
        state_code: row[0],
        state_name: row[1],
        establishments: parseInt(row[2]) || 0,
        employees: parseInt(row[3]) || 0,
        annual_payroll: parseInt(row[4]) || 0
      }));

      // Calculate national totals
      const totals = stateData.reduce((acc, state) => ({
        establishments: acc.establishments + state.establishments,
        employees: acc.employees + state.employees,
        annual_payroll: acc.annual_payroll + state.annual_payroll
      }), { establishments: 0, employees: 0, annual_payroll: 0 });

      // Top 10 states by employment
      const topStates = stateData
        .filter(s => s.employees > 0)
        .sort((a, b) => b.employees - a.employees)
        .slice(0, 10);

      const result = this.formatSuccessResponse({
        year,
        national_totals: {
          ...totals,
          avg_employees_per_establishment: Math.round(totals.employees / totals.establishments),
          avg_payroll_per_employee: Math.round(totals.annual_payroll / totals.employees)
        },
        top_manufacturing_states: topStates,
        total_states_with_manufacturing: stateData.filter(s => s.establishments > 0).length
      });

      this.cache.set(cacheKey, result, 86400 * 30); // 30 days
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching national employment: ${error.message}`);
    }
  }

  /**
   * Analyze pharmaceutical manufacturing concentration risk
   */
  async analyzeManufacturingConcentration(year = '2021') {
    const cacheKey = this.getCacheKey('census_mfg_concentration', year);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const employmentResult = await this.getNationalPharmaEmployment(year);

      if (employmentResult.status === 'error') {
        return employmentResult;
      }

      const topStates = employmentResult.top_manufacturing_states;
      const totalEmployees = employmentResult.national_totals.employees;

      // Calculate concentration metrics
      const top3Concentration = topStates.slice(0, 3).reduce((sum, s) => sum + s.employees, 0);
      const top5Concentration = topStates.slice(0, 5).reduce((sum, s) => sum + s.employees, 0);

      const analysis = {
        concentration_risk: 'high',
        top_3_states_percentage: ((top3Concentration / totalEmployees) * 100).toFixed(1),
        top_5_states_percentage: ((top5Concentration / totalEmployees) * 100).toFixed(1),
        insights: []
      };

      if (top3Concentration / totalEmployees > 0.5) {
        analysis.concentration_risk = 'very_high';
        analysis.insights.push({
          type: 'critical',
          message: `Over 50% of pharmaceutical manufacturing concentrated in top 3 states - high regional shortage risk`
        });
      } else if (top5Concentration / totalEmployees > 0.6) {
        analysis.concentration_risk = 'high';
        analysis.insights.push({
          type: 'warning',
          message: `Over 60% of manufacturing in top 5 states - consider geographic diversification`
        });
      }

      // Identify states with significant manufacturing
      const significantStates = topStates.filter(s =>
        (s.employees / totalEmployees) > 0.05
      );

      analysis.insights.push({
        type: 'info',
        message: `${significantStates.length} states account for >5% of pharmaceutical manufacturing each`
      });

      const result = this.formatSuccessResponse({
        year,
        ...employmentResult,
        concentration_analysis: analysis
      });

      this.cache.set(cacheKey, result, 86400 * 7); // 7 days
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error analyzing concentration: ${error.message}`);
    }
  }

  /**
   * Get pharmaceutical export/import data
   */
  async getPharmaceuticalTrade(year, month) {
    const cacheKey = this.getCacheKey('census_pharma_trade', year, month);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      // HS code 30 = Pharmaceutical products
      const url = this.buildUrl(
        `${this.baseUrl}/${this.datasets.international_trade}`,
        {
          get: 'ALL_VAL_MO,ALL_VAL_YR',
          time: month ? `${year}-${month.toString().padStart(2, '0')}` : year,
          COMM_LVL: 'HS2',
          HS: '30',
          ...(this.apiKey && { key: this.apiKey })
        }
      );

      const data = await this.makeRequest(url);

      const result = this.formatSuccessResponse({
        year,
        month,
        monthly_export_value: data[0]?.[0],
        yearly_export_value: data[0]?.[1],
        trade_balance_indicator: 'exports'
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching trade data: ${error.message}`);
    }
  }
}

export default CensusTool;
