#!/usr/bin/env node

/**
 * Parse FDA Drug Establishments Registration Data
 *
 * This script parses the drls_reg.xls file and extracts manufacturer
 * location data for geocoding and mapping
 *
 * Run: node scripts/parse-manufacturer-data.js
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, '../drls_reg.xls');
const OUTPUT_FILE = path.join(__dirname, '../data/manufacturers.json');

async function parseManufacturerData() {
    console.log('[Parser] Starting FDA Drug Establishments data parsing...');

    // Check if input file exists
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('[Parser] ERROR: drls_reg.xls not found!');
        console.error('[Parser] Please add the file to the project root directory.');
        console.error('[Parser] Download from: https://www.fda.gov/drugs/drug-approvals-and-databases/drugestablishment-current-registration-site');
        process.exit(1);
    }

    try {
        console.log('[Parser] Reading Excel file...');
        const workbook = XLSX.readFile(INPUT_FILE);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        console.log(`[Parser] Parsing sheet: ${sheetName}`);
        const data = XLSX.utils.sheet_to_json(sheet);

        console.log(`[Parser] Found ${data.length} records`);

        // Process and normalize manufacturer data
        const manufacturers = new Map();

        for (const row of data) {
            // Extract key fields (adjust based on actual column names in the file)
            const feiNumber = row['FEI Number'] || row['FEI_NUMBER'] || row['fei'];
            const firmName = row['Firm Name'] || row['FIRM_NAME'] || row['firm_name'];
            const street = row['Street'] || row['STREET'] || row['street'];
            const city = row['City'] || row['CITY'] || row['city'];
            const state = row['State'] || row['STATE'] || row['state'];
            const zip = row['ZIP'] || row['Zip'] || row['zip_code'];
            const country = row['Country'] || row['COUNTRY'] || row['country'];

            if (!firmName) continue;

            manufacturers.set(feiNumber || firmName, {
                fei_number: feiNumber,
                name: firmName,
                address: {
                    street: street,
                    city: city,
                    state: state,
                    zip: zip,
                    country: country || 'USA'
                },
                coordinates: null // Will be geocoded later
            });
        }

        console.log(`[Parser] Processed ${manufacturers.size} unique manufacturers`);

        // Ensure data directory exists
        const dataDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Write to JSON file
        const output = {
            generated_at: new Date().toISOString(),
            source: 'FDA Drug Establishments Current Registration Site',
            total_manufacturers: manufacturers.size,
            manufacturers: Array.from(manufacturers.entries()).map(([key, value]) => ({
                id: key,
                ...value
            }))
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

        console.log(`[Parser] ✓ Successfully saved manufacturer data to: ${OUTPUT_FILE}`);
        console.log(`[Parser] ✓ Total manufacturers: ${manufacturers.size}`);

        // Show sample
        const sample = output.manufacturers.slice(0, 3);
        console.log('\n[Parser] Sample records:');
        console.log(JSON.stringify(sample, null, 2));

    } catch (error) {
        console.error(`[Parser] ERROR: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run parser
parseManufacturerData();
