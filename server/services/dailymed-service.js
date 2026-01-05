import fetch from 'node-fetch';

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
     * Clean drug name for better DailyMed searches
     * Removes dosage forms, salts, and special characters
     */
    cleanDrugName(drugName) {
        if (!drugName) return null;

        let cleaned = drugName;

        // Replace semicolons with spaces
        cleaned = cleaned.replace(/;/g, ' ');

        // Remove common dosage forms
        const dosageForms = [
            'Tablet', 'Capsule', 'Injection', 'Solution', 'Suspension',
            'Cream', 'Ointment', 'Gel', 'Spray', 'Powder', 'Inhaler',
            'Injectable', 'Oral', 'Topical', 'Ophthalmic', 'Suppository'
        ];
        const dosagePattern = new RegExp(`\\b(${dosageForms.join('|')})s?\\b`, 'gi');
        cleaned = cleaned.replace(dosagePattern, '');

        // Remove common salt/chemical suffixes
        const salts = [
            'Hydrochloride', 'Sodium', 'Sulfate', 'Phosphate', 'Citrate',
            'Maleate', 'Tartrate', 'Acetate', 'Gluconate', 'Calcium',
            'Potassium', 'Mesylate', 'Besylate', 'Fumarate', 'Succinate'
        ];
        const saltPattern = new RegExp(`\\b(${salts.join('|')})\\b`, 'gi');
        cleaned = cleaned.replace(saltPattern, '');

        // Clean up extra whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
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
            console.error(`[DailyMed] getDrugInfo called - NDC: ${ndc}, drugName: ${drugName}`);

            // Try to get label by NDC first
            const labelResult = await this.getLabelByNDC(ndc);
            console.error(`[DailyMed] NDC lookup result - status: ${labelResult.status}, labels: ${labelResult.labels?.length || 0}`);

            // If NDC lookup fails and we have a drug name, try searching by name with multiple strategies
            if ((labelResult.status === 'error' || !labelResult.labels || labelResult.labels.length === 0) && drugName) {
                // Try cleaned drug name first
                const cleanedName = this.cleanDrugName(drugName);
                console.error(`[DailyMed] NDC lookup failed for ${ndc}, trying cleaned drug name: ${cleanedName}`);

                let nameResult = await this.searchByDrugName(cleanedName);
                console.error(`[DailyMed] Drug name search result - status: ${nameResult.status}, labels: ${nameResult.labels?.length || 0}`);

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

                // If cleaned name didn't work, try individual drug components
                if (cleanedName && cleanedName.includes(' ')) {
                    const components = cleanedName.split(' ').filter(c => c.length > 3);
                    console.error(`[DailyMed] Cleaned name search returned 0 results, trying individual components: ${components.join(', ')}`);

                    for (const component of components) {
                        const componentResult = await this.searchByDrugName(component);
                        console.error(`[DailyMed] Component "${component}" search result - labels: ${componentResult.labels?.length || 0}`);

                        if (componentResult.status === 'success' && componentResult.labels && componentResult.labels.length > 0) {
                            const label = componentResult.labels[0];
                            const setid = label.setid;
                            const mediaResult = await this.getMediaBySetID(setid);

                            return {
                                status: 'success',
                                ndc: ndc,
                                lookup_method: 'drug_component',
                                searched_component: component,
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
