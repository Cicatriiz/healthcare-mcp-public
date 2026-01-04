/**
 * API Client for FDA Drug Shortage Dashboard
 * Handles all HTTP requests to the dashboard API
 */

const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/dashboard'
    : '/api/dashboard'; // Production: assumes reverse proxy

class DashboardAPI {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * Make HTTP request with error handling
     */
    async request(endpoint, params = {}) {
        try {
            const url = new URL(endpoint, this.baseUrl);

            // Add query parameters
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                    url.searchParams.append(key, params[key]);
                }
            });

            console.log('[API] Request:', url.toString());

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error_message || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[API] Response:', data);

            return data;
        } catch (error) {
            console.error('[API] Error:', error);
            throw error;
        }
    }

    /**
     * Get server health status
     */
    async getHealth() {
        return this.request('/health');
    }

    /**
     * Get shortage list with filters
     */
    async getShortages(filters = {}) {
        return this.request('/shortages', filters);
    }

    /**
     * Get shortage detail by NDC
     */
    async getShortageDetail(ndc, includeEnrichment = true) {
        return this.request(`/shortages/${ndc}`, {
            enrich: includeEnrichment
        });
    }

    /**
     * Get analytics data
     */
    async getAnalytics() {
        return this.request('/analytics');
    }

    /**
     * Get geographic distribution
     */
    async getGeographicDistribution() {
        return this.request('/map');
    }

    /**
     * Get therapeutic categories for filter dropdown
     */
    async getTherapeuticCategories() {
        return this.request('/therapeutic-classes');
    }

    /**
     * Get manufacturers for filter dropdown
     */
    async getManufacturers() {
        return this.request('/manufacturers');
    }

    /**
     * Get summary statistics
     */
    async getStats() {
        return this.request('/stats');
    }

    /**
     * Get API usage stats
     */
    async getUsageStats() {
        return this.request('/usage');
    }
}

// Create global API instance
const api = new DashboardAPI(API_BASE_URL);

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DashboardAPI, api };
}
