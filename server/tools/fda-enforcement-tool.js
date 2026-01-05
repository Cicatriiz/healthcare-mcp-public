import { BaseTool } from '../base-tool.js';

/**
 * Tool for accessing FDA Enforcement Reports (Drug Recalls)
 *
 * Data source: openFDA Drug Enforcement Reports API
 * Endpoint: https://api.fda.gov/drug/enforcement.json
 * Documentation: https://open.fda.gov/apis/drug/enforcement/
 *
 * Provides drug recall, safety alert, and field correction data
 */
export class FDAEnforcementTool extends BaseTool {
    constructor(cacheService) {
        super(cacheService);
        this.apiKey = process.env.FDA_API_KEY || '';
        this.baseUrl = 'https://api.fda.gov/drug/enforcement.json';
    }

    /**
     * Search for enforcement actions (recalls) for a drug
     *
     * @param {string} drugName - Generic or brand name
     * @param {number} limit - Max results (default: 10)
     * @returns {Promise<Object>} Enforcement actions
     */
    async searchRecalls(drugName, limit = 10) {
        const cacheKey = this.getCacheKey('fda_recalls', drugName, limit);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.error(`Cache hit for recalls: ${drugName}`);
            return cached;
        }

        try {
            console.error(`Fetching recalls for ${drugName}`);

            // Search in product description
            const searchQuery = `product_description:"${drugName}"`;

            const params = {
                search: searchQuery,
                limit: limit,
                sort: 'recall_initiation_date:desc'
            };

            if (this.apiKey) {
                params.api_key = this.apiKey;
            }

            const url = this.buildUrl(this.baseUrl, params);
            const data = await this.makeRequest(url);

            // Process results
            const recalls = this.processRecalls(data.results || []);

            const result = this.formatSuccessResponse({
                drug_name: drugName,
                recalls: recalls,
                total_count: data.meta?.results?.total || 0,
                has_active_recalls: recalls.some(r => r.status === 'Ongoing')
            });

            // Cache for 12 hours
            this.cache.set(cacheKey, result, 43200);

            return result;

        } catch (error) {
            console.error(`Error fetching recalls: ${error.message}`);
            return this.formatErrorResponse(`Error fetching recalls: ${error.message}`);
        }
    }

    /**
     * Get recent recalls (last 12 months)
     *
     * @param {number} limit - Max results
     * @returns {Promise<Object>} Recent recalls
     */
    async getRecentRecalls(limit = 20) {
        const cacheKey = this.getCacheKey('fda_recent_recalls', limit);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            console.error('Fetching recent drug recalls');

            // Get recalls from last 12 months
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const dateStr = oneYearAgo.toISOString().split('T')[0].replace(/-/g, '');

            const searchQuery = `recall_initiation_date:[${dateStr} TO 99991231]`;

            const params = {
                search: searchQuery,
                limit: limit,
                sort: 'recall_initiation_date:desc'
            };

            if (this.apiKey) {
                params.api_key = this.apiKey;
            }

            const url = this.buildUrl(this.baseUrl, params);
            const data = await this.makeRequest(url);

            // Process results
            const recalls = this.processRecalls(data.results || []);

            const result = this.formatSuccessResponse({
                recalls: recalls,
                total_count: data.meta?.results?.total || 0,
                date_range: { from: dateStr, to: 'present' }
            });

            // Cache for 6 hours
            this.cache.set(cacheKey, result, 21600);

            return result;

        } catch (error) {
            console.error(`Error fetching recent recalls: ${error.message}`);
            return this.formatErrorResponse(`Error fetching recent recalls: ${error.message}`);
        }
    }

    /**
     * Get recall statistics by classification
     *
     * @returns {Promise<Object>} Recall statistics
     */
    async getRecallStats() {
        const cacheKey = this.getCacheKey('fda_recall_stats');

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            console.error('Fetching recall statistics');

            // Get count by classification
            const params = {
                count: 'classification.exact',
                limit: 10
            };

            if (this.apiKey) {
                params.api_key = this.apiKey;
            }

            const url = this.buildUrl(this.baseUrl, params);
            const data = await this.makeRequest(url);

            const classifications = (data.results || []).map(r => ({
                classification: r.term,
                count: r.count,
                severity: this.classifySeverity(r.term)
            }));

            const result = this.formatSuccessResponse({
                classifications: classifications,
                total_recalls: classifications.reduce((sum, c) => sum + c.count, 0)
            });

            // Cache for 24 hours
            this.cache.set(cacheKey, result, 86400);

            return result;

        } catch (error) {
            console.error(`Error fetching recall stats: ${error.message}`);
            return this.formatErrorResponse(`Error fetching recall stats: ${error.message}`);
        }
    }

    /**
     * Check if a drug has any recalls that might be related to current shortage
     *
     * @param {string} drugName - Generic or brand name
     * @returns {Promise<Object>} Recall-shortage correlation analysis
     */
    async checkRecallShortageCorrelation(drugName) {
        const cacheKey = this.getCacheKey('fda_recall_shortage', drugName);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // Get recent recalls for this drug (last 24 months)
            const twoYearsAgo = new Date();
            twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            const dateStr = twoYearsAgo.toISOString().split('T')[0].replace(/-/g, '');

            const searchQuery = `product_description:"${drugName}" AND recall_initiation_date:[${dateStr} TO 99991231]`;

            const params = {
                search: searchQuery,
                limit: 10,
                sort: 'recall_initiation_date:desc'
            };

            if (this.apiKey) {
                params.api_key = this.apiKey;
            }

            const url = this.buildUrl(this.baseUrl, params);
            const data = await this.makeRequest(url);

            const recalls = this.processRecalls(data.results || []);

            // Analyze if recalls might be related to shortage
            const manufacturingRecalls = recalls.filter(r =>
                r.reason.toLowerCase().includes('manufactur') ||
                r.reason.toLowerCase().includes('quality') ||
                r.reason.toLowerCase().includes('contamination') ||
                r.reason.toLowerCase().includes('sterility')
            );

            const hasRecentRecalls = recalls.length > 0;
            const likelyCorrelated = manufacturingRecalls.length > 0;

            const result = {
                status: 'success',
                drug_name: drugName,
                has_recent_recalls: hasRecentRecalls,
                total_recalls: recalls.length,
                manufacturing_related_recalls: manufacturingRecalls.length,
                likely_shortage_cause: likelyCorrelated,
                correlation_analysis: likelyCorrelated ?
                    'Recent manufacturing/quality recalls may have contributed to this shortage' :
                    hasRecentRecalls ?
                        'Recent recalls exist but may not be directly related to shortage' :
                        'No recent recalls found',
                recent_recalls: recalls.slice(0, 3) // Top 3 most recent
            };

            // Cache for 12 hours
            this.cache.set(cacheKey, result, 43200);

            return result;

        } catch (error) {
            console.error(`Error checking recall correlation: ${error.message}`);
            return {
                status: 'error',
                error_message: `Error checking recall correlation: ${error.message}`
            };
        }
    }

    /**
     * Process and normalize recall data
     */
    processRecalls(recalls) {
        return recalls.map(recall => ({
            recall_number: recall.recall_number,
            classification: recall.classification,
            severity: this.classifySeverity(recall.classification),
            status: recall.status,
            product_description: recall.product_description,
            reason: recall.reason_for_recall,
            recall_initiation_date: recall.recall_initiation_date,
            report_date: recall.report_date,
            recalling_firm: recall.recalling_firm,
            city: recall.city,
            state: recall.state,
            country: recall.country,
            voluntary_mandated: recall.voluntary_mandated,
            distribution_pattern: recall.distribution_pattern,
            product_quantity: recall.product_quantity
        }));
    }

    /**
     * Classify recall severity from FDA classification
     */
    classifySeverity(classification) {
        if (!classification) return 'Unknown';

        const cl = classification.toLowerCase();

        if (cl.includes('class i')) {
            return 'Most Serious - Life-threatening or serious injury';
        } else if (cl.includes('class ii')) {
            return 'Moderate - Temporary or reversible health consequence';
        } else if (cl.includes('class iii')) {
            return 'Least Serious - Unlikely to cause adverse health consequence';
        }

        return 'Unknown';
    }

    /**
     * Get comprehensive recall summary for a drug
     * Includes recalls, correlation analysis, and safety implications
     *
     * @param {string} drugName - Generic or brand name
     * @returns {Promise<Object>} Comprehensive recall summary
     */
    async getRecallSummary(drugName) {
        const cacheKey = this.getCacheKey('fda_recall_summary', drugName);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // Get both recalls and correlation analysis
            const [recalls, correlation] = await Promise.all([
                this.searchRecalls(drugName, 10),
                this.checkRecallShortageCorrelation(drugName)
            ]);

            const result = {
                status: 'success',
                drug_name: drugName,
                has_recalls: recalls.status === 'success' && recalls.total_count > 0,
                total_recalls: recalls.total_count || 0,
                recent_recalls: recalls.status === 'success' ? recalls.recalls : [],
                shortage_correlation: correlation.status === 'success' ? {
                    likely_cause: correlation.likely_shortage_cause,
                    analysis: correlation.correlation_analysis,
                    manufacturing_recalls: correlation.manufacturing_related_recalls
                } : null
            };

            // Cache for 12 hours
            this.cache.set(cacheKey, result, 43200);

            return result;

        } catch (error) {
            console.error(`Error fetching recall summary: ${error.message}`);
            return {
                status: 'error',
                error_message: `Error fetching recall summary: ${error.message}`
            };
        }
    }
}

export default FDAEnforcementTool;
