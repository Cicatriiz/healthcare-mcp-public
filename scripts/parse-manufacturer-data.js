#!/usr/bin/env node

/**
 * Parse Manufacturer Data from FDA DRLS Registry
 *
 * Reads drls_reg.xls file and extracts manufacturer location data
 * with geocoding support (Google Maps API + OpenStreetMap fallback)
 */

import 'dotenv/config';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = path.join(__dirname, '..', 'drls_reg.xls');
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'manufacturers.json');

// Google Maps API key (set via environment variable)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// Skip geocoding by default (set GEOCODE=true to enable)
const SKIP_GEOCODING = process.env.GEOCODE !== 'true';

// Limit number of manufacturers to geocode (for testing)
const GEOCODE_LIMIT = parseInt(process.env.GEOCODE_LIMIT || '100');

/**
 * Geocode address using Google Maps Geocoding API
 */
async function geocodeWithGoogle(address) {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
        formatted_address: data.results[0].formatted_address,
        source: 'google_maps'
      };
    }

    return null;
  } catch (error) {
    console.error(`Google Maps geocoding error: ${error.message}`);
    return null;
  }
}

/**
 * Geocode address using OpenStreetMap Nominatim (fallback)
 */
async function geocodeWithOSM(address) {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Healthcare-MCP-Manufacturer-Parser/1.0'
      }
    });

    const data = await response.json();

    if (data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        formatted_address: data[0].display_name,
        source: 'openstreetmap'
      };
    }

    return null;
  } catch (error) {
    console.error(`OpenStreetMap geocoding error: ${error.message}`);
    return null;
  }
}

/**
 * Geocode an address with fallback strategy
 */
async function geocodeAddress(address) {
  if (!address || address.trim() === '') {
    return null;
  }

  // Try Google Maps first if API key is available
  let result = await geocodeWithGoogle(address);

  // Fallback to OpenStreetMap
  if (!result) {
    // Add a small delay to respect OSM rate limits (1 req/sec)
    await new Promise(resolve => setTimeout(resolve, 1000));
    result = await geocodeWithOSM(address);
  }

  return result;
}

/**
 * Extract state code from address
 */
function extractState(address) {
  if (!address) return null;

  // Pattern for US state codes (e.g., "NY 10001", "CA 94102")
  const stateMatch = address.match(/\b([A-Z]{2})\s+\d{5}\b/);
  if (stateMatch) {
    return stateMatch[1];
  }

  // Pattern for state code with comma (e.g., "New York, NY")
  const stateCommaMatch = address.match(/,\s*([A-Z]{2})\s*[,.\s]/);
  if (stateCommaMatch) {
    return stateCommaMatch[1];
  }

  return null;
}

/**
 * Parse the drls_reg.xls file
 */
async function parseManufacturerData() {
  console.log('📖 Reading drls_reg.xls file...');

  // Check if file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Error: File not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  // Read the Excel file
  const workbook = XLSX.readFile(INPUT_FILE);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON
  const rawData = XLSX.utils.sheet_to_json(worksheet);

  console.log(`✅ Found ${rawData.length} rows in the spreadsheet`);
  console.log(`📋 Columns: ${Object.keys(rawData[0] || {}).join(', ')}`);

  // Process manufacturer data
  const manufacturers = new Map();

  for (const row of rawData) {
    // Extract manufacturer info based on actual FDA DRLS column structure
    const manufacturerName = row['FIRM_NAME'];
    const address = row['ADDRESS'];

    if (!manufacturerName || !address) {
      continue; // Skip rows without manufacturer name or address
    }

    // Parse address - extract country code from END (3-letter code like USA, FRA, etc.)
    // Format examples:
    // - "Street, City, State (ST) ZIP, United States (USA)"
    // - "Street, City, Postal, Country (FRA)"
    const countryMatch = address.match(/,\s*([^,]+)\s+\(([A-Z]{3})\)\s*$/);
    let country = 'UNKNOWN';
    let countryCode = '';
    let addressWithoutCountry = address;

    if (countryMatch) {
      country = countryMatch[1].trim();
      countryCode = countryMatch[2];
      // Remove the country part from the address
      addressWithoutCountry = address.substring(0, address.lastIndexOf(countryMatch[0])).trim();
    }

    const addressParts = addressWithoutCountry.split(',').map(s => s.trim());

    let city = '';
    let state = '';
    let zip = '';
    let street = '';

    // Extract components based on address structure
    if (addressParts.length >= 2) {
      street = addressParts[0];
      city = addressParts[1];

      // Check for state/zip in remaining parts
      if (addressParts.length > 2) {
        const lastPart = addressParts[addressParts.length - 1];

        // US format: "State (ST) ZIP" or "State ST ZIP"
        const usStateMatch = lastPart.match(/([A-Za-z\s]+)\s*\(([A-Z]{2})\)\s+(\d{5}(?:-\d{4})?)/);

        if (usStateMatch) {
          state = usStateMatch[2]; // Use state code (e.g., "CA")
          zip = usStateMatch[3];
        } else {
          // Try standard format: "ST ZIP"
          const stateZipMatch = lastPart.match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);

          if (stateZipMatch) {
            state = stateZipMatch[1];
            zip = stateZipMatch[2];
          } else {
            // Might be international postal code or other format
            zip = lastPart;
          }
        }
      }
    }

    const fullAddress = address;

    // Store unique manufacturers
    if (!manufacturers.has(manufacturerName)) {
      manufacturers.set(manufacturerName, {
        name: manufacturerName,
        street: street,
        city: city,
        state: state,
        zip: zip,
        country: country,
        country_code: countryCode,
        full_address: fullAddress,
        latitude: null,
        longitude: null,
        geocoded: false,
        geocode_source: null
      });
    }
  }

  console.log(`\n🏭 Found ${manufacturers.size} unique manufacturers`);

  const manufacturerArray = Array.from(manufacturers.values());
  let geocodedCount = 0;
  let failedCount = 0;

  // Geocode addresses (optional)
  if (SKIP_GEOCODING) {
    console.log('\n⏭️  Skipping geocoding (set GEOCODE=true to enable)');
    console.log('   To geocode, run: GEOCODE=true npm run parse:manufacturers\n');
  } else {
    console.log('\n🌍 Starting geocoding process...');
    console.log(`   Geocoding ${Math.min(GEOCODE_LIMIT, manufacturerArray.length)} manufacturers...`);
    console.log('   This may take a while due to rate limiting...\n');

    const geocodeCount = Math.min(GEOCODE_LIMIT, manufacturerArray.length);

    for (let i = 0; i < geocodeCount; i++) {
      const manufacturer = manufacturerArray[i];

      console.log(`[${i + 1}/${geocodeCount}] Geocoding: ${manufacturer.name}`);

      const geoResult = await geocodeAddress(manufacturer.full_address);

      if (geoResult) {
        manufacturer.latitude = geoResult.latitude;
        manufacturer.longitude = geoResult.longitude;
        manufacturer.formatted_address = geoResult.formatted_address;
        manufacturer.geocoded = true;
        manufacturer.geocode_source = geoResult.source;
        geocodedCount++;
        console.log(`   ✅ Success: ${geoResult.latitude}, ${geoResult.longitude} (${geoResult.source})`);
      } else {
        failedCount++;
        console.log(`   ❌ Failed to geocode`);
      }
    }
  }

  console.log(`\n📊 Geocoding Results:`);
  console.log(`   ✅ Success: ${geocodedCount}`);
  console.log(`   ❌ Failed: ${failedCount}`);
  console.log(`   📈 Success Rate: ${((geocodedCount / manufacturerArray.length) * 100).toFixed(1)}%`);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Save to JSON file
  const outputData = {
    generated_at: new Date().toISOString(),
    source_file: 'drls_reg.xls',
    total_manufacturers: manufacturerArray.length,
    geocoded_count: geocodedCount,
    failed_count: failedCount,
    geocoding_sources: {
      google_maps: manufacturerArray.filter(m => m.geocode_source === 'google_maps').length,
      openstreetmap: manufacturerArray.filter(m => m.geocode_source === 'openstreetmap').length
    },
    manufacturers: manufacturerArray
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));

  console.log(`\n💾 Saved manufacturer data to: ${OUTPUT_FILE}`);
  console.log(`\n✨ Done!`);
}

// Run the parser
parseManufacturerData().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
