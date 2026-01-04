# RxNorm Normalization & History Tracking

This document describes the RxNorm drug name normalization and local history tracking features that enhance the FDA Drug Shortage Dashboard with better data quality and formulary integration capabilities.

## Overview

Two new FREE services have been integrated:

1. **RxNorm Normalization** - Drug name standardization using NLM's RxNorm API
2. **Local History Tracking** - SQLite database for tracking shortage changes over time

## 1. RxNorm Normalization Service

### What It Does

- Normalizes drug names to RxCUI (RxNorm Concept Unique Identifier) codes
- Enables matching drugs across different naming conventions
- Provides therapeutic alternatives for shortages
- Foundation for hospital formulary integration

### API Endpoints

#### Normalize Drug Name
```bash
GET /api/dashboard/rxnorm/normalize?drug_name=Amoxicillin

Response:
{
  "status": "success",
  "rxcui": "723",
  "name": "Amoxicillin",
  "score": "100",
  "rank": "1",
  "details": {
    "rxcui": "723",
    "name": "Amoxicillin",
    "tty": "IN",
    "synonyms": ["Amoxicillin", "Amoxycillin", ...]
  },
  "all_candidates": [...]
}
```

#### Get Drug Details
```bash
GET /api/dashboard/rxnorm/details?rxcui=723

Response:
{
  "status": "success",
  "data": {
    "rxcui": "723",
    "name": "Amoxicillin",
    "tty": "IN",
    "synonyms": ["Amoxicillin", "Amoxycillin", ...]
  }
}
```

#### Get Therapeutic Alternatives
```bash
GET /api/dashboard/rxnorm/alternatives?rxcui=723

Response:
{
  "status": "success",
  "rxcui": "723",
  "therapeutic_classes": [
    {
      "classId": "J01CA04",
      "className": "amoxicillin",
      "classType": "ATC"
    }
  ],
  "alternatives": [
    {
      "rxcui": "3640",
      "name": "Ampicillin"
    },
    ...
  ],
  "total_alternatives": 15
}
```

### Use Cases

#### Hospital Formulary Integration

When you get your hospital formulary data, you can:

1. **Match Shortage Drugs to Your Inventory**
```javascript
// Example: Check if a shortage drug is in your formulary
const shortageRxcui = await normalizeDrugName("Amoxicillin");
const formularyRxcui = await normalizeDrugName("AMOXICILLIN 500MG CAP");

if (shortageRxcui.rxcui === formularyRxcui.rxcui) {
  console.log("This shortage affects drugs in your formulary!");
}
```

2. **Find Alternative Drugs in Your Formulary**
```javascript
// Get therapeutic alternatives for a shortage
const alternatives = await getTherapeuticAlternatives("723");

// Check which alternatives are in your formulary
const formularyAlternatives = alternatives.filter(alt =>
  yourFormulary.some(drug => drug.rxcui === alt.rxcui)
);
```

3. **Batch Process Your Entire Formulary**
```javascript
// Normalize all drugs in your formulary
const formularyWithRxcui = await batchNormalize(formularyDrugNames);
```

## 2. Local History Tracking Service

### What It Does

- Stores daily snapshots of FDA shortage data
- Tracks when shortages appear and resolve
- Calculates **accurate** duration (fixes FDA's poor timestamp data)
- Enables trend analysis over time

### Database Schema

**snapshots** - Daily snapshots of all shortages
- `snapshot_date` - Date of snapshot
- `ndc` - Drug NDC code
- `generic_name`, `brand_name`, `manufacturer`
- `status` - active or resolved
- `therapeutic_categories`, `shortage_reason`
- `initial_date`, `resolution_date`
- `raw_data` - Full shortage JSON

**status_changes** - Tracks when shortages change status
- `ndc` - Drug NDC code
- `from_status` → `to_status`
- `change_date` - When the change occurred
- `days_active` - Calculated from historical data

**metadata** - Daily snapshot statistics
- `snapshot_date`
- `total_shortages`, `active_shortages`, `resolved_shortages`
- `new_shortages`, `newly_resolved`

### API Endpoints

#### Get History Database Stats
```bash
GET /api/dashboard/history/stats

Response:
{
  "status": "success",
  "total_snapshots": 30,
  "unique_shortages": 450,
  "status_changes": 85,
  "first_snapshot": "2024-12-01",
  "last_snapshot": "2024-12-30",
  "database_path": "/path/to/shortage-history.db"
}
```

#### Get Shortage Timeline
```bash
GET /api/dashboard/history/timeline?ndc=0002-1234-01

Response:
{
  "status": "success",
  "ndc": "0002-1234-01",
  "timeline": [
    {
      "snapshot_date": "2024-12-01",
      "status": "active",
      "generic_name": "Amoxicillin",
      "manufacturer": "Pfizer"
    },
    {
      "snapshot_date": "2024-12-15",
      "status": "resolved",
      ...
    }
  ],
  "status_changes": [
    {
      "from_status": "active",
      "to_status": "resolved",
      "change_date": "2024-12-15",
      "days_active": 14
    }
  ]
}
```

#### Get Historical Trends
```bash
GET /api/dashboard/history/trends?start_date=2024-12-01&end_date=2024-12-31

Response:
{
  "status": "success",
  "trends": [
    {
      "snapshot_date": "2024-12-01",
      "total_shortages": 450,
      "active_shortages": 320,
      "resolved_shortages": 130,
      "new_shortages": 5,
      "newly_resolved": 3
    },
    ...
  ]
}
```

#### Trigger Manual Snapshot
```bash
GET /api/dashboard/history/snapshot

Response:
{
  "status": "success",
  "snapshot_date": "2024-12-30",
  "total": 450,
  "active": 320,
  "resolved": 130,
  "new": 5,
  "newly_resolved": 3,
  "duration_ms": 2341
}
```

### Daily Snapshot Script

To build historical data, run the snapshot script daily via cron:

#### Manual Run
```bash
node server/scripts/take-snapshot.js
```

#### Crontab Entry (Daily at 2 AM)
```bash
0 2 * * * cd /path/to/healthcare-mcp-public && node server/scripts/take-snapshot.js
```

Example output:
```
============================================================
FDA Drug Shortage Daily Snapshot
2024-12-30T02:00:00.000Z
============================================================

✓ Snapshot completed successfully:
  Date: 2024-12-30
  Total shortages: 450
  Active: 320
  Resolved: 130
  New today: 5
  Newly resolved: 3
  Duration: 2341ms

Database Statistics:
  Total snapshots: 30
  Unique shortages tracked: 450
  Status changes recorded: 85
  First snapshot: 2024-12-01
  Last snapshot: 2024-12-30
  Database: /path/to/server/data/shortage-history.db
```

## Integration with Shortage Analytics

The `ShortageService` now automatically enriches shortage data with historical duration when available:

```javascript
// Shortages now include actual duration from history
{
  "ndc": "0002-1234-01",
  "generic_name": "Amoxicillin",
  "status": "resolved",
  "actual_duration_days": 45,  // From historical tracking
  "duration_source": "historical_tracking"
}
```

This fixes the "2025: 0 days average" problem by using real observed durations instead of FDA's incomplete timestamp data.

## Cost & Complexity

### RxNorm Service
- **Cost:** ✅ FREE (National Library of Medicine public API)
- **Rate Limits:** 20 requests/second (generous)
- **Complexity:** ✅ EASY (REST API, no authentication)
- **Reliability:** ✅ HIGH (government-maintained)

### History Service
- **Cost:** ✅ FREE (local SQLite database)
- **Storage:** ~1MB per month (lightweight)
- **Complexity:** ✅ EASY (automatic via cron)
- **Reliability:** ✅ HIGH (local database, no external dependencies)

## Next Steps

### When You Get Formulary Data

1. **Upload your formulary** (CSV, Excel, or database export)
2. **Normalize all drug names** using batch API
3. **Match shortages to your inventory** by RxCUI
4. **Find alternatives** from your formulary for shortages
5. **Prioritize** shortages that affect your most critical drugs

### Example Workflow

```javascript
// 1. Upload formulary CSV
const formulary = parseCSV('hospital-formulary.csv');

// 2. Normalize all drugs
const normalized = await rxnormService.batchNormalize(
  formulary.map(drug => drug.name)
);

// 3. Get current shortages
const shortages = await shortageService.fetchShortages({ status: 'active' });

// 4. Find which shortages affect your formulary
const affectedDrugs = shortages.filter(shortage => {
  const shortageRxcui = normalized[shortage.generic_name]?.rxcui;
  return formulary.some(drug => drug.rxcui === shortageRxcui);
});

// 5. For each affected drug, find alternatives in your formulary
for (const shortage of affectedDrugs) {
  const alternatives = await rxnormService.getTherapeuticAlternatives(shortage.rxcui);
  const inStock = alternatives.filter(alt =>
    formulary.some(drug => drug.rxcui === alt.rxcui && drug.quantity > 0)
  );

  console.log(`Shortage: ${shortage.generic_name}`);
  console.log(`Alternatives in stock: ${inStock.map(a => a.name).join(', ')}`);
}
```

## Database Location

- **SQLite Database:** `server/data/shortage-history.db`
- **Auto-created** on first use
- **Portable** - can be backed up, copied, or shared

## Benefits Summary

### RxNorm Normalization
✅ Match drugs across different naming conventions
✅ Integrate hospital formulary with shortage data
✅ Find therapeutic alternatives automatically
✅ Zero cost, reliable government API

### Local History Tracking
✅ Fix FDA's poor timestamp data
✅ Calculate accurate shortage durations
✅ Track trends over time
✅ Detect new shortages and resolutions daily
✅ Zero cost, local database

Together, these services provide the foundation for meaningful integration of shortage data with your hospital's actual drug inventory and needs.
