/**
 * DailyMed API Service
 *
 * Data source: National Library of Medicine DailyMed
 * Documentation: https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm
 *
 * Provides:
 * - Official FDA-approved drug labels (Structured Product Labeling)
 * - Drug images (package photos, pill identification)
 * - NDC-to-label mapping
 * - RxNorm integration
 */
export class DailyMedService {
    constructor(cacheService = null) {
        this.baseUrl = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';
        this.cache = cacheService;
    }

    /**
     * Get cache key for a request
     */
    getCacheKey(...parts) {
        return parts.join('_');
    }

    /**
     * Make HTTP request with error handling
     */
    async makeRequest(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`DailyMed API request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Search for drug labels by name
     *
     * @param {string} drugName - Drug name to search
     * @returns {Promise<Object>} Search results with SPL metadata
     */
    async searchByDrugName(drugName) {
        const cacheKey = this.getCacheKey('dailymed_search', drugName);

        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;
        }

        try {
            const url = `${this.baseUrl}/spls.json?drug_name=${encodeURIComponent(drugName)}`;
            const data = await this.makeRequest(url);

            const result = {
                status: 'success',
                drug_name: drugName,
                labels: data.data || [],
                total_count: data.metadata?.total_elements || 0
            };

            if (this.cache) {
                this.cache.set(cacheKey, result, 86400); // Cache 24 hours
            }

            return result;
        } catch (error) {
            return {
                status: 'error',
                error_message: `Failed to search DailyMed: ${error.message}`
            };
        }
    }

    /**
     * Get drug label by NDC code
     *
     * @param {string} ndc - National Drug Code
     * @returns {Promise<Object>} Label data and metadata
     */
    async getLabelByNDC(ndc) {
        const cacheKey = this.getCacheKey('dailymed_ndc', ndc);

        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;
        }

        try {
            // Clean NDC (remove dashes)
            const cleanNDC = ndc.replace(/[-\s]/g, '');

            const url = `${this.baseUrl}/ndcs/${cleanNDC}.json`;
            const data = await this.makeRequest(url);

            const result = {
                status: 'success',
                ndc: ndc,
                labels: data.data || [],
                total_count: data.data?.length || 0
            };

            if (this.cache) {
                this.cache.set(cacheKey, result, 86400); // Cache 24 hours
            }

            return result;
        } catch (error) {
            return {
                status: 'error',
                error_message: `Failed to get label by NDC: ${error.message}`
            };
        }
    }

    /**
     * Get drug label by RxCUI (RxNorm Concept ID)
     *
     * @param {string} rxcui - RxNorm Concept Unique Identifier
     * @returns {Promise<Object>} Label data and metadata
     */
    async getLabelByRxCUI(rxcui) {
        const cacheKey = this.getCacheKey('dailymed_rxcui', rxcui);

        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;
        }

        try {
            const url = `${this.baseUrl}/rxcuis/${rxcui}.json`;
            const data = await this.makeRequest(url);

            const result = {
                status: 'success',
                rxcui: rxcui,
                labels: data.data || [],
                total_count: data.data?.length || 0
            };

            if (this.cache) {
                this.cache.set(cacheKey, result, 86400); // Cache 24 hours
            }

            return result;
        } catch (error) {
            return {
                status: 'error',
                error_message: `Failed to get label by RxCUI: ${error.message}`
            };
        }
    }

    /**
     * Get SPL (Structured Product Labeling) document by SetID
     *
     * @param {string} setid - SPL document Set ID
     * @returns {Promise<Object>} Complete SPL document with all sections
     */
    async getSPLBySetID(setid) {
        const cacheKey = this.getCacheKey('dailymed_spl', setid);

        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;
        }

        try {
            const url = `${this.baseUrl}/spls/${setid}.json`;
            const data = await this.makeRequest(url);

            const result = {
                status: 'success',
                setid: setid,
                spl: data.data || null
            };

            if (this.cache) {
                this.cache.set(cacheKey, result, 86400); // Cache 24 hours
            }

            return result;
        } catch (error) {
            return {
                status: 'error',
                error_message: `Failed to get SPL: ${error.message}`
            };
        }
    }

    /**
     * Get media (images) for an SPL document
     *
     * @param {string} setid - SPL document Set ID
     * @returns {Promise<Object>} Product and package images
     */
    async getMediaBySetID(setid) {
        const cacheKey = this.getCacheKey('dailymed_media', setid);

        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;
        }

        try {
            const url = `${this.baseUrl}/spls/${setid}/media.json`;
            const data = await this.makeRequest(url);

            const mediaFiles = data.data || [];

            // Categorize images
            const productImages = mediaFiles.filter(m =>
                m.name && (m.name.toLowerCase().includes('product') ||
                          m.name.toLowerCase().includes('tablet') ||
                          m.name.toLowerCase().includes('capsule') ||
                          m.name.toLowerCase().includes('pill'))
            );

            const packageImages = mediaFiles.filter(m =>
                m.name && (m.name.toLowerCase().includes('package') ||
                          m.name.toLowerCase().includes('label') ||
                          m.name.toLowerCase().includes('bottle') ||
                          m.name.toLowerCase().includes('carton'))
            );

            const result = {
                status: 'success',
                setid: setid,
                product_images: productImages.map(img => ({
                    name: img.name,
                    url: `https://dailymed.nlm.nih.gov/dailymed/image.cfm?name=${img.name}&id=${setid}`
                })),
                package_images: packageImages.map(img => ({
                    name: img.name,
                    url: `https://dailymed.nlm.nih.gov/dailymed/image.cfm?name=${img.name}&id=${setid}`
                })),
                all_media: mediaFiles
            };

            if (this.cache) {
                this.cache.set(cacheKey, result, 86400); // Cache 24 hours
            }

            return result;
        } catch (error) {
            return {
                status: 'error',
                error_message: `Failed to get media: ${error.message}`
            };
        }
    }

    /**
     * Get comprehensive drug information including label and images
     * This is the main method for enriching shortage data
     *
     * @param {string} ndc - National Drug Code
     * @returns {Promise<Object>} Complete drug information with images
     */
    async getDrugInfo(ndc, drugName = null) {
        try {
            // Try to get label by NDC first
            const labelResult = await this.getLabelByNDC(ndc);

            // If NDC lookup fails and we have a drug name, try searching by name
            if ((labelResult.status === 'error' || !labelResult.labels || labelResult.labels.length === 0) && drugName) {
                console.log(`NDC lookup failed for ${ndc}, trying drug name: ${drugName}`);
                const nameResult = await this.searchByDrugName(drugName);

                if (nameResult.status === 'success' && nameResult.labels && nameResult.labels.length > 0) {
                    // Use the name search results instead
                    const label = nameResult.labels[0];
                    const setid = label.setid;
                    const mediaResult = await this.getMediaBySetID(setid);

                    return {
                        status: 'success',
                        ndc: ndc,
                        lookup_method: 'drug_name',
                        label: {
                            setid: label.setid,
                            title: label.title,
                            published_date: label.published_date,
                            marketing_category: label.marketing_category,
                            application_number: label.application_number,
                            labeler: label.labeler
                        },
                        images: mediaResult.status === 'success' ? {
                            product_images: mediaResult.product_images || [],
                            package_images: mediaResult.package_images || []
                        } : null,
                        spl_url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`
                    };
                }
            }

            if (labelResult.status === 'error' || !labelResult.labels || labelResult.labels.length === 0) {
                return {
                    status: 'not_found',
                    message: 'No DailyMed data found for this NDC or drug name'
                };
            }

            // Get the first (most relevant) label
            const label = labelResult.labels[0];
            const setid = label.setid;

            // Get images for this label
            const mediaResult = await this.getMediaBySetID(setid);

            return {
                status: 'success',
                ndc: ndc,
                label: {
                    setid: label.setid,
                    title: label.title,
                    published_date: label.published_date,
                    marketing_category: label.marketing_category,
                    application_number: label.application_number,
                    labeler: label.labeler,
                    ndc_codes: label.products?.map(p => p.ndc) || []
                },
                images: mediaResult.status === 'success' ? {
                    product_images: mediaResult.product_images || [],
                    package_images: mediaResult.package_images || []
                } : null,
                spl_url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`
            };
        } catch (error) {
            return {
                status: 'error',
                error_message: `Failed to get drug info: ${error.message}`
            };
        }
    }

    /**
     * Get drug information by RxCUI with images
     * Useful for therapeutic alternatives
     *
     * @param {string} rxcui - RxNorm Concept Unique Identifier
     * @returns {Promise<Object>} Complete drug information with images
     */
    async getDrugInfoByRxCUI(rxcui) {
        try {
            // Get label by RxCUI
            const labelResult = await this.getLabelByRxCUI(rxcui);

            if (labelResult.status === 'error' || !labelResult.labels || labelResult.labels.length === 0) {
                return {
                    status: 'not_found',
                    message: 'No DailyMed data found for this RxCUI'
                };
            }

            // Get the first (most relevant) label
            const label = labelResult.labels[0];
            const setid = label.setid;

            // Get images for this label
            const mediaResult = await this.getMediaBySetID(setid);

            return {
                status: 'success',
                rxcui: rxcui,
                label: {
                    setid: label.setid,
                    title: label.title,
                    published_date: label.published_date,
                    marketing_category: label.marketing_category,
                    application_number: label.application_number,
                    labeler: label.labeler
                },
                images: mediaResult.status === 'success' ? {
                    product_images: mediaResult.product_images || [],
                    package_images: mediaResult.package_images || []
                } : null,
                spl_url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`
            };
        } catch (error) {
            return {
                status: 'error',
                error_message: `Failed to get drug info by RxCUI: ${error.message}`
            };
        }
    }
}

export default DailyMedService;
