import { BaseTool } from '../base-tool.js';

/**
 * Tool for accessing FDA Adverse Event Reporting System (FAERS) data
 *
 * Data source: openFDA Drug Adverse Events API
 * Endpoint: https://api.fda.gov/drug/event.json
 * Documentation: https://open.fda.gov/apis/drug/event/
 *
 * Provides post-marketing adverse event reports for drug safety monitoring
 */
export class FDAAdverseEventsTool extends BaseTool {
    constructor(cacheService) {
        super(cacheService);
        this.apiKey = process.env.FDA_API_KEY || '';
        this.baseUrl = 'https://api.fda.gov/drug/event.json';
    }

    /**
     * Get adverse events summary for a drug
     *
     * @param {string} drugName - Generic or brand name
     * @param {number} limit - Max results (default: 10)
     * @returns {Promise<Object>} Adverse events summary
     */
    async getAdverseEvents(drugName, limit = 10) {
        const cacheKey = this.getCacheKey('fda_adverse_events', drugName, limit);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.error(`Cache hit for adverse events: ${drugName}`);
            return cached;
        }

        try {
            console.error(`Fetching adverse events for ${drugName}`);

            // Search for events where this drug is a primary suspect
            const searchQuery = `patient.drug.medicinalproduct:"${drugName}"`;

            const params = {
                search: searchQuery,
                limit: limit
            };

            if (this.apiKey) {
                params.api_key = this.apiKey;
            }

            const url = this.buildUrl(this.baseUrl, params);
            const data = await this.makeRequest(url);

            // Process results
            const events = this.processAdverseEvents(data.results || []);

            const result = this.formatSuccessResponse({
                drug_name: drugName,
                events: events,
                total_count: data.meta?.results?.total || 0,
                limit: limit
            });

            // Cache for 24 hours
            this.cache.set(cacheKey, result, 86400);

            return result;

        } catch (error) {
            console.error(`Error fetching adverse events: ${error.message}`);
            return this.formatErrorResponse(`Error fetching adverse events: ${error.message}`);
        }
    }

    /**
     * Get adverse event statistics/counts for a drug
     *
     * @param {string} drugName - Generic or brand name
     * @returns {Promise<Object>} Statistical summary of adverse events
     */
    async getAdverseEventStats(drugName) {
        const cacheKey = this.getCacheKey('fda_adverse_stats', drugName);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            console.error(`Fetching adverse event statistics for ${drugName}`);

            // Get counts by reaction type
            const searchQuery = `patient.drug.medicinalproduct:"${drugName}"`;

            const params = {
                search: searchQuery,
                count: 'patient.reaction.reactionmeddrapt.exact',
                limit: 10 // Top 10 reactions
            };

            if (this.apiKey) {
                params.api_key = this.apiKey;
            }

            const url = this.buildUrl(this.baseUrl, params);
            const data = await this.makeRequest(url);

            // Process reaction counts
            const topReactions = (data.results || []).map(r => ({
                reaction: r.term,
                count: r.count
            }));

            // Get severity breakdown
            const severityQuery = `patient.drug.medicinalproduct:"${drugName}"`;
            const severityParams = {
                search: severityQuery,
                count: 'serious',
                limit: 10
            };

            if (this.apiKey) {
                severityParams.api_key = this.apiKey;
            }

            const severityUrl = this.buildUrl(this.baseUrl, severityParams);
            let severityData;
            try {
                severityData = await this.makeRequest(severityUrl);
            } catch (e) {
                severityData = { results: [] };
            }

            const result = this.formatSuccessResponse({
                drug_name: drugName,
                top_reactions: topReactions,
                severity_breakdown: severityData.results || [],
                total_reports: topReactions.reduce((sum, r) => sum + r.count, 0)
            });

            // Cache for 24 hours
            this.cache.set(cacheKey, result, 86400);

            return result;

        } catch (error) {
            console.error(`Error fetching adverse event stats: ${error.message}`);
            return this.formatErrorResponse(`Error fetching adverse event stats: ${error.message}`);
        }
    }

    /**
     * Get recent serious adverse events for a drug
     *
     * @param {string} drugName - Generic or brand name
     * @param {number} limit - Max results
     * @returns {Promise<Object>} Recent serious events
     */
    async getSeriousEvents(drugName, limit = 5) {
        const cacheKey = this.getCacheKey('fda_serious_events', drugName, limit);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            console.error(`Fetching serious adverse events for ${drugName}`);

            // Search for serious events only
            const searchQuery = `patient.drug.medicinalproduct:"${drugName}" AND serious:1`;

            const params = {
                search: searchQuery,
                limit: limit,
                sort: 'receivedate:desc'
            };

            if (this.apiKey) {
                params.api_key = this.apiKey;
            }

            const url = this.buildUrl(this.baseUrl, params);
            const data = await this.makeRequest(url);

            // Process serious events
            const events = this.processAdverseEvents(data.results || [], true);

            const result = this.formatSuccessResponse({
                drug_name: drugName,
                serious_events: events,
                total_count: data.meta?.results?.total || 0
            });

            // Cache for 12 hours (more recent data)
            this.cache.set(cacheKey, result, 43200);

            return result;

        } catch (error) {
            console.error(`Error fetching serious events: ${error.message}`);
            return this.formatErrorResponse(`Error fetching serious events: ${error.message}`);
        }
    }

    /**
     * Process and normalize adverse event data
     */
    processAdverseEvents(events, seriousOnly = false) {
        return events.map(event => {
            // Extract patient reactions
            const reactions = (event.patient?.reaction || []).map(r => ({
                reaction: r.reactionmeddrapt,
                outcome: this.mapOutcome(r.reactionoutcome)
            }));

            // Determine if event resulted in serious outcome
            const seriousOutcomes = [];
            if (event.serious) {
                if (event.seriousnessdeath) seriousOutcomes.push('Death');
                if (event.seriousnesshospitalization) seriousOutcomes.push('Hospitalization');
                if (event.seriousnesslifethreatening) seriousOutcomes.push('Life-threatening');
                if (event.seriousnessdisabling) seriousOutcomes.push('Disabling');
            }

            // Extract drug information
            const drugs = (event.patient?.drug || []).map(d => ({
                name: d.medicinalproduct,
                role: d.drugcharacterization === '1' ? 'Suspect' :
                      d.drugcharacterization === '2' ? 'Concomitant' : 'Unknown'
            }));

            return {
                receive_date: event.receivedate,
                serious: event.serious === 1 || event.serious === '1',
                serious_outcomes: seriousOutcomes,
                reactions: reactions,
                drugs: drugs,
                patient_age: event.patient?.patientonsetage,
                patient_sex: event.patient?.patientsex === '1' ? 'Male' :
                            event.patient?.patientsex === '2' ? 'Female' : 'Unknown',
                report_source: event.primarysource?.qualification || 'Unknown'
            };
        });
    }

    /**
     * Map FDA outcome codes to readable text
     */
    mapOutcome(code) {
        const outcomes = {
            '1': 'Recovered/Resolved',
            '2': 'Recovering/Resolving',
            '3': 'Not recovered/Not resolved',
            '4': 'Recovered/Resolved with sequelae',
            '5': 'Fatal',
            '6': 'Unknown'
        };
        return outcomes[code?.toString()] || 'Unknown';
    }

    /**
     * Get safety summary for a drug
     * Combines statistics and recent serious events
     *
     * @param {string} drugName - Generic or brand name
     * @returns {Promise<Object>} Comprehensive safety summary
     */
    async getSafetySummary(drugName) {
        const cacheKey = this.getCacheKey('fda_safety_summary', drugName);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // Get both stats and recent serious events
            const [stats, seriousEvents] = await Promise.all([
                this.getAdverseEventStats(drugName),
                this.getSeriousEvents(drugName, 5)
            ]);

            const result = {
                status: 'success',
                drug_name: drugName,
                statistics: stats.status === 'success' ? {
                    top_reactions: stats.top_reactions,
                    total_reports: stats.total_reports
                } : null,
                recent_serious_events: seriousEvents.status === 'success' ? {
                    events: seriousEvents.serious_events,
                    total_count: seriousEvents.total_count
                } : null,
                has_safety_data: stats.status === 'success' || seriousEvents.status === 'success'
            };

            // Cache for 12 hours
            this.cache.set(cacheKey, result, 43200);

            return result;

        } catch (error) {
            console.error(`Error fetching safety summary: ${error.message}`);
            return {
                status: 'error',
                error_message: `Error fetching safety summary: ${error.message}`
            };
        }
    }
}

export default FDAAdverseEventsTool;
