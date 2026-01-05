import BaseTool from './base-tool.js';

/**
 * BLS (Bureau of Labor Statistics) Tool
 * Provides employment, wage, and labor market data for pharmaceutical industry
 *
 * API Documentation: https://www.bls.gov/developers/api_signature_v2.htm
 */
class BLSTool extends BaseTool {
  constructor(cacheService, apiKey) {
    super(cacheService);
    this.name = 'BLS Labor Statistics';
    this.baseUrl = 'https://api.bls.gov/publicAPI/v2';
    this.apiKey = apiKey || process.env.BLS_API_KEY;

    // Relevant series IDs for pharmaceutical industry
    this.seriesIds = {
      pharma_employment: 'CES3133250001',           // Pharmaceutical manufacturing employment
      pharma_avg_hourly_earnings: 'CES3133250003',  // Average hourly earnings
      pharma_avg_weekly_hours: 'CES3133250002',     // Average weekly hours
      pharma_ppi: 'PCU325412325412',                // Producer Price Index - pharmaceuticals
      medical_care_cpi: 'CUUR0000SAM',              // Consumer Price Index - medical care
      pharma_import_prices: 'EIUIR3000',            // Import price index - pharmaceuticals
      pharma_export_prices: 'EIUQR3000'             // Export price index - pharmaceuticals
    };
  }

  /**
   * Get time series data for multiple series
   */
  async getSeriesData(seriesIds, startYear, endYear) {
    const cacheKey = this.getCacheKey('bls_series', seriesIds.join(','), startYear, endYear);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/timeseries/data/`;

      const requestBody = {
        seriesid: Array.isArray(seriesIds) ? seriesIds : [seriesIds],
        startyear: startYear || new Date().getFullYear() - 2,
        endyear: endYear || new Date().getFullYear(),
        ...(this.apiKey && { registrationkey: this.apiKey })
      };

      const data = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (data.status !== 'REQUEST_SUCCEEDED') {
        throw new Error(data.message || 'BLS API request failed');
      }

      const result = this.formatSuccessResponse({
        results_count: data.Results.series.length,
        series: data.Results.series.map(s => ({
          series_id: s.seriesID,
          data: s.data.map(d => ({
            year: d.year,
            period: d.period,
            period_name: d.periodName,
            value: parseFloat(d.value),
            footnotes: d.footnotes
          }))
        }))
      });

      this.cache.set(cacheKey, result, 86400); // 24 hours
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error fetching BLS data: ${error.message}`);
    }
  }

  /**
   * Get pharmaceutical employment trends
   */
  async getEmploymentTrends(startYear, endYear) {
    const cacheKey = this.getCacheKey('bls_employment', startYear, endYear);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const employmentSeriesIds = [
        this.seriesIds.pharma_employment,
        this.seriesIds.pharma_avg_hourly_earnings,
        this.seriesIds.pharma_avg_weekly_hours
      ];

      const result = await this.getSeriesData(employmentSeriesIds, startYear, endYear);

      if (result.status === 'success') {
        const analysis = this.analyzeEmploymentTrends(result.series);

        return this.formatSuccessResponse({
          ...result,
          analysis
        });
      }

      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error analyzing employment trends: ${error.message}`);
    }
  }

  /**
   * Get pharmaceutical pricing trends
   */
  async getPricingTrends(startYear, endYear) {
    const cacheKey = this.getCacheKey('bls_pricing', startYear, endYear);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const pricingSeriesIds = [
        this.seriesIds.pharma_ppi,
        this.seriesIds.medical_care_cpi,
        this.seriesIds.pharma_import_prices,
        this.seriesIds.pharma_export_prices
      ];

      const result = await this.getSeriesData(pricingSeriesIds, startYear, endYear);

      if (result.status === 'success') {
        const analysis = this.analyzePricingTrends(result.series);

        return this.formatSuccessResponse({
          ...result,
          analysis
        });
      }

      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error analyzing pricing trends: ${error.message}`);
    }
  }

  /**
   * Analyze employment trends for shortage risk factors
   */
  analyzeEmploymentTrends(seriesData) {
    const analysis = {
      employment: null,
      wages: null,
      hours: null,
      shortage_risk_indicators: []
    };

    seriesData.forEach(series => {
      if (series.series_id === this.seriesIds.pharma_employment) {
        const data = series.data.slice(0, 12); // Last 12 months
        const recent = data.slice(0, 6);
        const older = data.slice(6, 12);

        const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
        const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;
        const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

        analysis.employment = {
          current: data[0]?.value,
          trend: percentChange > 1 ? 'increasing' : (percentChange < -1 ? 'decreasing' : 'stable'),
          percent_change: percentChange.toFixed(2)
        };

        if (percentChange < -2) {
          analysis.shortage_risk_indicators.push({
            type: 'warning',
            message: `Pharmaceutical employment declining by ${Math.abs(percentChange).toFixed(1)}% - potential production capacity reduction`
          });
        }
      }
    });

    return analysis;
  }

  /**
   * Analyze pricing trends for market pressures
   */
  analyzePricingTrends(seriesData) {
    const analysis = {
      producer_prices: null,
      consumer_prices: null,
      import_prices: null,
      export_prices: null,
      market_pressure_indicators: []
    };

    seriesData.forEach(series => {
      const data = series.data.slice(0, 12);
      if (data.length < 2) return;

      const recent = data[0].value;
      const yearAgo = data[11]?.value || data[data.length - 1].value;
      const percentChange = ((recent - yearAgo) / yearAgo) * 100;

      if (series.series_id === this.seriesIds.pharma_ppi) {
        analysis.producer_prices = {
          current_index: recent,
          year_over_year_change: percentChange.toFixed(2),
          trend: percentChange > 2 ? 'increasing' : (percentChange < -2 ? 'decreasing' : 'stable')
        };

        if (percentChange > 5) {
          analysis.market_pressure_indicators.push({
            type: 'alert',
            message: `Producer prices up ${percentChange.toFixed(1)}% - manufacturers may reduce production of low-margin drugs`
          });
        }
      } else if (series.series_id === this.seriesIds.medical_care_cpi) {
        analysis.consumer_prices = {
          current_index: recent,
          year_over_year_change: percentChange.toFixed(2)
        };
      }
    });

    return analysis;
  }

  /**
   * Generate comprehensive labor market and pricing report
   */
  async getComprehensiveReport(startYear, endYear) {
    const cacheKey = this.getCacheKey('bls_comprehensive', startYear, endYear);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const [employmentResult, pricingResult] = await Promise.allSettled([
        this.getEmploymentTrends(startYear, endYear),
        this.getPricingTrends(startYear, endYear)
      ]);

      const employment = employmentResult.status === 'fulfilled' ? employmentResult.value : null;
      const pricing = pricingResult.status === 'fulfilled' ? pricingResult.value : null;

      const result = this.formatSuccessResponse({
        employment_trends: employment?.status === 'success' ? employment : { status: 'unavailable' },
        pricing_trends: pricing?.status === 'success' ? pricing : { status: 'unavailable' },
        generated_at: new Date().toISOString()
      });

      this.cache.set(cacheKey, result, 3600); // 1 hour
      return result;
    } catch (error) {
      return this.formatErrorResponse(`Error generating comprehensive report: ${error.message}`);
    }
  }
}

export default BLSTool;
