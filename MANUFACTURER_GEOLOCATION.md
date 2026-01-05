# Manufacturer Geolocation Feature

This feature adds geographic mapping capabilities for drug manufacturers using FDA Drug Establishments registration data.

## Setup Instructions

### 1. Download FDA Drug Establishments Data

Download the latest Drug Establishments Current Registration Site data from the FDA:

**URL:** https://www.fda.gov/drugs/drug-approvals-and-databases/drugestablishment-current-registration-site

Look for the file named `drls_reg.xls` or similar.

### 2. Add the File to Your Project

Place the downloaded `drls_reg.xls` file in the project root directory:

```bash
# From your project root
cp /path/to/downloaded/drls_reg.xls .
```

**Note:** This file is NOT committed to git due to its large size. Each user must download it.

### 3. Install Dependencies

```bash
npm install
```

This will install the `xlsx` package needed to parse the Excel file.

### 4. Parse Manufacturer Data

Run the parser script to extract and normalize manufacturer location data:

```bash
npm run parse:manufacturers
```

This will:
- Read `drls_reg.xls`
- Extract manufacturer names, addresses, FEI numbers
- Save normalized data to `data/manufacturers.json`

### 5. Restart the Server

```bash
npm run server:http
```

The manufacturer location service will now be available.

## API Endpoints

### Get Manufacturer Location

```
GET /api/dashboard/manufacturer-location?name=Pfizer
```

**Response:**
```json
{
  "status": "success",
  "manufacturer": {
    "name": "Pfizer Inc",
    "fei_number": "123456",
    "address": {
      "street": "235 East 42nd Street",
      "city": "New York",
      "state": "NY",
      "zip": "10017",
      "country": "USA"
    },
    "coordinates": {
      "lat": 40.7505,
      "lng": -73.9745
    }
  }
}
```

### Get All Manufacturer Locations

```
GET /api/dashboard/manufacturer-locations
```

Returns all manufacturers with their coordinates for map display.

### Get Manufacturers by State

```
GET /api/dashboard/manufacturers-by-state?state=CA
```

Returns all manufacturers in California.

### Enrich Shortages with Manufacturer Locations

```
GET /api/dashboard/shortages-with-locations
```

Returns shortage data enriched with manufacturer geographic information.

## Features

### Geocoding

Manufacturer addresses are automatically geocoded using OpenStreetMap Nominatim (free, no API key required).

Coordinates are cached to avoid repeated API calls.

### Manufacturer Matching

The service uses fuzzy matching to find manufacturers:
- Case-insensitive
- Partial name matching
- Handles variations in company names

### Map Integration

Use the coordinates to display manufacturers on a map:

```javascript
// Example: Display on Leaflet map
const map = L.map('map').setView([39.8283, -98.5795], 4); // USA center

manufacturers.forEach(m => {
  if (m.coordinates) {
    L.marker([m.coordinates.lat, m.coordinates.lng])
      .bindPopup(`<b>${m.name}</b><br>${m.address.city}, ${m.address.state}`)
      .addTo(map);
  }
});
```

## Data Files

- **Source:** `drls_reg.xls` (FDA Drug Establishments Registration)
- **Parsed:** `data/manufacturers.json` (Normalized JSON format)
- **Cache:** In-memory coordinates cache

## Notes

- The `drls_reg.xls` file is updated periodically by the FDA
- Re-run `npm run parse:manufacturers` after downloading updated data
- Geocoding uses free OpenStreetMap API with rate limiting (1 request/second)
- For large-scale geocoding, consider using a commercial service

## Troubleshooting

**Error: "drls_reg.xls not found"**
- Download the file from FDA and place it in project root

**Error: "Cannot find module 'xlsx'"**
- Run `npm install` to install dependencies

**Slow geocoding**
- Geocoding happens on-demand and is cached
- First requests may be slower, subsequent requests use cache

## Future Enhancements

- [ ] Bulk geocoding script
- [ ] Integration with Google Maps API (optional)
- [ ] Manufacturer clustering on map
- [ ] Filter by shortage impact (manufacturers with most active shortages)
- [ ] Historical shortage patterns by region
