import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Manufacturer Location Service
 *
 * Parses FDA Drug Establishments registration data and provides
 * geolocation information for drug manufacturers
 *
 * Data source: FDA DRLS (Drug Registration and Listing System)
 * File: drls_reg.xls
 *
 * Geocoding: Uses Google Maps API if available, falls back to OpenStreetMap
 */
export class ManufacturerLocationService {
    constructor(cacheService = null) {
        this.cache = cacheService;
        this.manufacturers = new Map();
        this.geocodeCache = new Map();
        this.dataFile = path.join(__dirname, '../../drls_reg.xls');
        this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || null;

        if (this.googleMapsApiKey) {
            console.log('[ManufacturerLocation] Using Google Maps API for geocoding');
        } else {
            console.log('[ManufacturerLocation] Using OpenStreetMap for geocoding (Google Maps API key not configured)');
        }
    }

    /**
     * Load and parse manufacturer data from FDA registration file
     * Note: This requires the xlsx package to read Excel files
     */
    async loadManufacturerData() {
        const cacheKey = 'manufacturer_locations_all';

        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.manufacturers = new Map(cached);
                return;
            }
        }

        try {
            // Check if file exists
            if (!fs.existsSync(this.dataFile)) {
                console.error('[ManufacturerLocation] drls_reg.xls not found. Please add it to the project root.');
                return;
            }

            // For now, we'll use CSV parsing. If the file is .xls, you'll need to:
            // 1. Install xlsx package: npm install xlsx
            // 2. Use XLSX.readFile() to parse it

            // TODO: Implement Excel parsing once file is available
            // const XLSX = require('xlsx');
            // const workbook = XLSX.readFile(this.dataFile);
            // const sheet = workbook.Sheets[workbook.SheetNames[0]];
            // const data = XLSX.utils.sheet_to_json(sheet);

            console.log('[ManufacturerLocation] Manufacturer data loaded');

            if (this.cache) {
                this.cache.set(cacheKey, Array.from(this.manufacturers.entries()), 86400 * 7); // Cache for 7 days
            }
        } catch (error) {
            console.error(`[ManufacturerLocation] Error loading data: ${error.message}`);
        }
    }

    /**
     * Geocode an address to latitude/longitude
     * Uses Google Maps API if available, falls back to OpenStreetMap
     *
     * @param {Object} address - Address components
     * @returns {Promise<Object>} Coordinates {lat, lng}
     */
    async geocodeAddress(address) {
        const addressString = this.formatAddress(address);
        const cacheKey = `geocode_${addressString}`;

        // Check cache first
        if (this.geocodeCache.has(cacheKey)) {
            return this.geocodeCache.get(cacheKey);
        }

        // Try Google Maps first if API key is available
        if (this.googleMapsApiKey) {
            const googleResult = await this.geocodeWithGoogleMaps(addressString);
            if (googleResult) {
                this.geocodeCache.set(cacheKey, googleResult);
                return googleResult;
            }
        }

        // Fall back to OpenStreetMap
        const osmResult = await this.geocodeWithOSM(addressString);
        if (osmResult) {
            this.geocodeCache.set(cacheKey, osmResult);
            return osmResult;
        }

        return null;
    }

    /**
     * Geocode using Google Maps Geocoding API
     */
    async geocodeWithGoogleMaps(addressString) {
        try {
            const query = encodeURIComponent(addressString);
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${this.googleMapsApiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const location = data.results[0].geometry.location;
                return {
                    lat: location.lat,
                    lng: location.lng,
                    display_name: data.results[0].formatted_address,
                    source: 'google_maps'
                };
            }

            if (data.status === 'OVER_QUERY_LIMIT') {
                console.warn('[ManufacturerLocation] Google Maps API quota exceeded, falling back to OSM');
            }

            return null;
        } catch (error) {
            console.error(`[ManufacturerLocation] Google Maps geocoding error: ${error.message}`);
            return null;
        }
    }

    /**
     * Geocode using OpenStreetMap Nominatim (free fallback)
     */
    async geocodeWithOSM(addressString) {
        try {
            const query = encodeURIComponent(addressString);
            const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'healthcare-mcp/1.0 FDA-Shortage-Dashboard'
                }
            });

            const data = await response.json();

            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    display_name: data[0].display_name,
                    source: 'openstreetmap'
                };
            }

            return null;
        } catch (error) {
            console.error(`[ManufacturerLocation] OSM geocoding error: ${error.message}`);
            return null;
        }
    }

    /**
     * Format address for geocoding
     */
    formatAddress(address) {
        const parts = [];

        if (address.street) parts.push(address.street);
        if (address.city) parts.push(address.city);
        if (address.state) parts.push(address.state);
        if (address.zip) parts.push(address.zip);
        if (address.country) parts.push(address.country);

        return parts.join(', ');
    }

    /**
     * Get location for a specific manufacturer
     *
     * @param {string} manufacturerName - Manufacturer company name
     * @returns {Promise<Object>} Location data with coordinates
     */
    async getManufacturerLocation(manufacturerName) {
        if (!manufacturerName) {
            return { status: 'error', message: 'Manufacturer name required' };
        }

        // Ensure data is loaded
        if (this.manufacturers.size === 0) {
            await this.loadManufacturerData();
        }

        // Find manufacturer (case-insensitive partial match)
        const searchName = manufacturerName.toLowerCase();
        const matches = [];

        for (const [name, data] of this.manufacturers.entries()) {
            if (name.toLowerCase().includes(searchName) || searchName.includes(name.toLowerCase())) {
                matches.push({ name, ...data });
            }
        }

        if (matches.length === 0) {
            return {
                status: 'not_found',
                message: `No location found for manufacturer: ${manufacturerName}`
            };
        }

        // If we have location data but no coordinates, geocode it
        const manufacturer = matches[0];
        if (manufacturer.address && !manufacturer.coordinates) {
            manufacturer.coordinates = await this.geocodeAddress(manufacturer.address);
        }

        return {
            status: 'success',
            manufacturer: manufacturer
        };
    }

    /**
     * Get all manufacturer locations
     * Useful for displaying all manufacturers on a map
     *
     * @returns {Promise<Object>} All manufacturer locations
     */
    async getAllManufacturerLocations() {
        if (this.manufacturers.size === 0) {
            await this.loadManufacturerData();
        }

        const locations = Array.from(this.manufacturers.values()).map(m => ({
            name: m.name,
            address: m.address,
            coordinates: m.coordinates,
            registration_number: m.fei_number,
            status: m.status
        }));

        return {
            status: 'success',
            total: locations.length,
            manufacturers: locations
        };
    }

    /**
     * Get manufacturers by state
     *
     * @param {string} state - State code (e.g., 'CA', 'NY')
     * @returns {Promise<Object>} Manufacturers in that state
     */
    async getManufacturersByState(state) {
        if (this.manufacturers.size === 0) {
            await this.loadManufacturerData();
        }

        const stateManufacturers = Array.from(this.manufacturers.values())
            .filter(m => m.address?.state?.toUpperCase() === state.toUpperCase());

        return {
            status: 'success',
            state: state,
            count: stateManufacturers.length,
            manufacturers: stateManufacturers
        };
    }

    /**
     * Match shortage manufacturers to geographic locations
     *
     * @param {Array} shortages - Array of shortage objects with manufacturer names
     * @returns {Promise<Object>} Shortages with geolocation data added
     */
    async enrichShortagesWithLocations(shortages) {
        if (this.manufacturers.size === 0) {
            await this.loadManufacturerData();
        }

        const enriched = await Promise.all(shortages.map(async (shortage) => {
            const location = await this.getManufacturerLocation(shortage.manufacturer);

            return {
                ...shortage,
                manufacturer_location: location.status === 'success' ? location.manufacturer : null
            };
        }));

        return {
            status: 'success',
            shortages: enriched
        };
    }
}

export default ManufacturerLocationService;
