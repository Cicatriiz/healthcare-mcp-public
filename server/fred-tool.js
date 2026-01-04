import BaseTool from './base-tool.js';

/**
 * FRED (Federal Reserve Economic Data) Tool
 * Provides pharmaceutical manufacturing economic indicators
 *
 * API Documentation: https://fred.stlouisfed.org/docs/api/
 */
class FREDTool extends BaseTool {
  constructor(cacheService, apiKey) {
    super(cacheService);
    this.name = 'FRED Economic Data';
    this.baseUrl = 'https://api.stlouisfed.org/fred';
    this.apiKey = apiKey || process.env.FRED_API_KEY;

    // Relevant series IDs for pharmaceutical analysis
    this.seriesIds = {
      pharma_production: 'IPG3254S', // Pharmaceutical manufacturing production index
      pharma_ppi: 'PCU3254123254122', // Producer Price Index for pharmaceuticals
      medical_cpi: 'CUUR0000SAM', // Consumer Price Index for medical care
      manufacturing_employment: 'CES3133250001', // Pharmaceutical manufacturing employment
      supply_chain_pressure: 'GSCPI' // Global Supply Chain Pressure Index
    };
  }

  /**
   * Get pharmaceutical manufacturing production index
   */
  async getPharmaceuticalProduction(params = {}) {
    const cacheKey = this.getCacheKey('fred_pharma_production', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const seriesId = this.seriesIds.pharma_production;
      const observations = await this.fetchSeries(seriesId, params);

      const result = this.formatSuccessResponse({
        series_id: seriesId,
        series_name: 'Pharmaceutical Manufacturing Production Index',
        data: observations,
        latest_value: observations.length > 0 ? observations[observations.length - 1] : null
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching pharmaceutical production: ${error.message}`);
    }
  }

  /**
   * Get multiple economic indicators
   */
  async getEconomicIndicators(params = {}) {
    const cacheKey = this.getCacheKey('fred_indicators', params);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const indicators = await Promise.allSettled([
        this.fetchSeries(this.seriesIds.pharma_production, params),
        this.fetchSeries(this.seriesIds.pharma_ppi, params),
        this.fetchSeries(this.seriesIds.medical_cpi, params),
        this.fetchSeries(this.seriesIds.manufacturing_employment, params),
        this.fetchSeries(this.seriesIds.supply_chain_pressure, params)
      ]);

      const result = this.formatSuccessResponse({
        pharmaceutical_production: {
          data: indicators[0].status === 'fulfilled' ? indicators[0].value : [],
          status: indicators[0].status
        },
        producer_price_index: {
          data: indicators[1].status === 'fulfilled' ? indicators[1].value : [],
          status: indicators[1].status
        },
        medical_cpi: {
          data: indicators[2].status === 'fulfilled' ? indicators[2].value : [],
          status: indicators[2].status
        },
        manufacturing_employment: {
          data: indicators[3].status === 'fulfilled' ? indicators[3].value : [],
          status: indicators[3].status
        },
        supply_chain_pressure: {
          data: indicators[4].status === 'fulfilled' ? indicators[4].value : [],
          status: indicators[4].status
        }
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching economic indicators: ${error.message}`);
    }
  }

  /**
   * Fetch FRED series data
   */
  async fetchSeries(seriesId, params = {}) {
    const url = new URL(`${this.baseUrl}/series/observations`);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('file_type', 'json');

    // Default to last 2 years if no date range specified
    if (!params.observation_start) {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      url.searchParams.set('observation_start', twoYearsAgo.toISOString().split('T')[0]);
    } else {
      url.searchParams.set('observation_start', params.observation_start);
    }

    if (params.observation_end) {
      url.searchParams.set('observation_end', params.observation_end);
    }

    const data = await this.makeRequest(url.toString());

    if (data.observations) {
      return data.observations
        .filter(obs => obs.value !== '.')
        .map(obs => ({
          date: obs.date,
          value: parseFloat(obs.value)
        }));
    }

    return [];
  }

  /**
   * Analyze trends in economic indicators
   */
  async analyzeTrends() {
    const cacheKey = this.getCacheKey('fred_trend_analysis');
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const indicators = await this.getEconomicIndicators();

      if (indicators.status === 'error') {
        return indicators;
      }

      const analysis = {
        production_trend: this.calculateTrend(indicators.pharmaceutical_production.data),
        price_trend: this.calculateTrend(indicators.producer_price_index.data),
        employment_trend: this.calculateTrend(indicators.manufacturing_employment.data),
        supply_chain_trend: this.calculateTrend(indicators.supply_chain_pressure.data)
      };

      const result = this.formatSuccessResponse({
        analysis,
        insights: this.generateInsights(analysis),
        last_updated: new Date().toISOString()
      });

      this.cache.set(cacheKey, result, 3600); // 1 hour
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error analyzing trends: ${error.message}`);
    }
  }

  /**
   * Calculate trend direction and magnitude
   */
  calculateTrend(data) {
    if (!data || data.length < 2) {
      return { direction: 'unknown', magnitude: 0, latest_value: null };
    }

    const recent = data.slice(-6); // Last 6 observations
    const older = data.slice(-12, -6); // Previous 6 observations

    const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
    const olderAvg = older.length > 0
      ? older.reduce((sum, d) => sum + d.value, 0) / older.length
      : recentAvg;

    const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

    return {
      direction: percentChange > 1 ? 'increasing' : (percentChange < -1 ? 'decreasing' : 'stable'),
      magnitude: Math.abs(percentChange),
      latest_value: data[data.length - 1].value,
      latest_date: data[data.length - 1].date
    };
  }

  /**
   * Generate insights from trend analysis
   */
  generateInsights(analysis) {
    const insights = [];

    if (analysis.production_trend.direction === 'decreasing') {
      insights.push({
        type: 'warning',
        message: `Pharmaceutical production is declining (${analysis.production_trend.magnitude.toFixed(1)}% decrease) - may indicate upcoming shortages`
      });
    }

    if (analysis.price_trend.direction === 'increasing' && analysis.price_trend.magnitude > 5) {
      insights.push({
        type: 'alert',
        message: `Significant price increases (${analysis.price_trend.magnitude.toFixed(1)}%) may drive shortages as manufacturers adjust`
      });
    }

    if (analysis.employment_trend.direction === 'decreasing') {
      insights.push({
        type: 'concern',
        message: 'Pharmaceutical manufacturing employment declining - potential production capacity reduction'
      });
    }

    if (analysis.supply_chain_trend.direction === 'increasing') {
      insights.push({
        type: 'critical',
        message: 'Supply chain pressure increasing - expect higher shortage risk'
      });
    }

    if (insights.length === 0) {
      insights.push({
        type: 'positive',
        message: 'Economic indicators stable - no major shortage risk signals detected'
      });
    }

    return insights;
  }
}

export default FREDTool;
