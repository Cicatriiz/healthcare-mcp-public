# FDA Drug Shortage Intelligence Dashboard - Architecture Plan

## Executive Summary

This document outlines the architecture for building an end-to-end FDA Drug Shortage Intelligence Dashboard that leverages the existing MCP infrastructure in the healthcare-mcp-public repository.

**Goal**: Provide healthcare providers with a comprehensive, real-time view of drug shortages with clinical context, trends, and actionable insights.

## Data Sources Research

Based on web research (January 2026), the primary data source will be:

### openFDA Drug Shortages API
- **Endpoint**: `https://api.fda.gov/drug/shortages.json`
- **Status**: Active, with records as recent as 2025
- **Rate Limits**: Max 100 results per query (default: 1)
- **Query Syntax**: `search=field:term&limit=N`

### Available Fields
- **Identification**: `package_ndc`, `generic_name`, `proprietary_name`
- **Business**: `company_name`, `contact_info`
- **Clinical**: `therapeutic_category[]`, `dosage_form`, `strength[]`, `presentation`
- **Status**: `status`, `availability`, `shortage_reason`, `update_type`
- **Dates**: `initial_posting_date`, `update_date`, `change_date`, `discontinued_date`
- **Context**: `related_info`, `related_info_link`, `resolved_note`
- **Harmonized**: `openfda{}` (cross-referenced FDA data)

### Example Query
```
https://api.fda.gov/drug/shortages.json?search=dosage_form:"Capsule"&limit=5
```

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   FDA Shortage Dashboard                     │
│                    (Web Application)                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴────────────────┐
        │                                │
        ▼                                ▼
┌──────────────────┐          ┌─────────────────────┐
│  Dashboard API   │          │   Static Frontend   │
│  (Express.js)    │◄────────►│   (React/Next.js)   │
└────────┬─────────┘          └─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│         Shortage Service Layer                      │
│  - Data fetching & normalization                    │
│  - Search & filter logic                           │
│  - Analytics computation                           │
│  - Enrichment orchestration                        │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              MCP Tools Layer                        │
│  - FDA Shortage Tool (NEW)                         │
│  - FDA Drug Lookup (existing)                      │
│  - PubMed Search (existing)                        │
│  - Health Topics (existing)                        │
│  - Clinical Trials (existing)                      │
│  - Medical Terminology/ICD-10 (existing)           │
│  - medRxiv Search (existing)                       │
│  - NCBI Bookshelf (existing)                       │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│          Infrastructure Layer                       │
│  - Cache Service (node-cache, 24h TTL)             │
│  - Usage Tracking (SQLite)                         │
│  - Error Handling & Logging                        │
└─────────────────────────────────────────────────────┘
```

## Component Design

### 1. New MCP Tool: FDA Shortage Tool

**File**: `server/fda-shortage-tool.js`

**Purpose**: Fetch and parse FDA drug shortage data from openFDA API

**Methods**:
- `searchShortages(params)` - Main search with filters
- `getShortageById(ndc)` - Get specific shortage details
- `getShortagesByStatus(status)` - Filter by active/resolved
- `getShortagesByTherapeuticCategory(category)` - Filter by therapeutic class

**Parameters**:
```javascript
{
  query: string,              // Search term (drug name, NDC, etc.)
  status: string,             // 'active', 'resolved', 'all'
  therapeutic_category: string,
  dosage_form: string,
  company_name: string,
  limit: number,              // Default: 20, Max: 100
  skip: number,               // For pagination
  sort: string                // e.g., 'initial_posting_date:desc'
}
```

**Caching Strategy**:
- TTL: 6 hours (shortages update frequently)
- Cache key: MD5 hash of normalized query params

**Response Format**:
```javascript
{
  status: 'success',
  total_results: number,
  shortages: [{
    ndc: string,
    generic_name: string,
    brand_name: string,
    manufacturer: string,
    therapeutic_categories: string[],
    dosage_form: string,
    strength: string[],
    shortage_status: string,
    reason: string,
    availability: string,
    initial_date: string,
    last_updated: string,
    resolution_date: string | null,
    related_info: string
  }]
}
```

### 2. Shortage Service Layer

**File**: `server/services/shortage-service.js`

**Responsibilities**:
- Orchestrate MCP tool calls
- Normalize and transform data
- Compute analytics and trends
- Enrich shortage data with clinical context

**Key Methods**:

```javascript
class ShortageService {
  constructor(mcpTools, cacheService) {
    this.fdaShortage = mcpTools.fdaShortage;
    this.fdaDrug = mcpTools.fdaDrug;
    this.pubmed = mcpTools.pubmed;
    this.healthTopics = mcpTools.healthTopics;
    this.clinicalTrials = mcpTools.clinicalTrials;
    this.icd10 = mcpTools.icd10;
    this.medrxiv = mcpTools.medrxiv;
    this.ncbiBookshelf = mcpTools.ncbiBookshelf;
    this.cache = cacheService;
  }

  // Core data fetching
  async fetchShortages(filters) { }
  async getShortageDetail(ndc) { }

  // Search & filter
  async searchShortages(query, filters) { }
  async filterByTherapeuticClass(shortages, classes) { }
  async filterByManufacturer(shortages, manufacturers) { }

  // Analytics
  async getAnalytics(timeRange) { }
  async getShortagesByCategory() { }
  async getShortagesByRoute() { }
  async getShortagesByManufacturer() { }
  async getTrendData(timeRange) { }

  // Enrichment
  async enrichShortage(shortage) { }
  async getPubMedEvidence(drugName, therapeuticCategory) { }
  async getHealthGuidelines(drugName, therapeuticCategory) { }
  async getClinicalTrials(drugName) { }
  async getRelatedICDCodes(therapeuticCategory) { }
  async suggestAlternatives(shortage) { }

  // Geolocation
  async geocodeManufacturers(shortages) { }
  async getShortagesByRegion() { }
}
```

### 3. Dashboard API (Express)

**File**: `server/dashboard-server.js`

**Extends**: Existing `http-server.js` or runs as separate service on port 3001

**Endpoints**:

```
GET  /api/dashboard/health              # Health check
GET  /api/dashboard/shortages           # List with search/filter
GET  /api/dashboard/shortages/:ndc      # Detail view with enrichment
GET  /api/dashboard/analytics           # Aggregate analytics
GET  /api/dashboard/trends              # Time-series data
GET  /api/dashboard/map                 # Geolocation data
GET  /api/dashboard/therapeutic-classes # Available categories
GET  /api/dashboard/manufacturers       # Available manufacturers
GET  /api/dashboard/alternatives/:ndc   # Suggest alternatives
```

**Query Parameters for /shortages**:
- `q`: search query
- `status`: active | resolved | all
- `therapeutic_category`: filter
- `dosage_form`: filter
- `route`: filter (derived from dosage_form)
- `manufacturer`: filter
- `page`: pagination (default: 1)
- `limit`: results per page (default: 20)
- `sort`: field:order (default: initial_posting_date:desc)

### 4. Frontend Application

**Technology**: Next.js 14+ (App Router) or Create React App

**File Structure**:
```
dashboard/
├── app/                      # Next.js app directory
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home/shortage list
│   ├── shortages/
│   │   └── [ndc]/
│   │       └── page.tsx     # Detail view
│   ├── analytics/
│   │   └── page.tsx         # Analytics dashboard
│   └── about/
│       └── page.tsx         # Methodology
├── components/
│   ├── ShortageTable.tsx    # Main data table
│   ├── SearchBar.tsx        # Search input
│   ├── FilterPanel.tsx      # Filter chips/dropdowns
│   ├── ShortageDetail.tsx   # Detail panel
│   ├── EnrichmentSection.tsx # PubMed/Health.gov/Trials
│   ├── Analytics/
│   │   ├── CategoryChart.tsx
│   │   ├── TrendChart.tsx
│   │   ├── RouteChart.tsx
│   │   └── ManufacturerChart.tsx
│   └── Map/
│       └── ShortageMap.tsx  # Geographic visualization
├── lib/
│   ├── api-client.ts        # API wrapper
│   ├── types.ts             # TypeScript types
│   └── utils.ts             # Helper functions
└── public/
    └── ...                  # Static assets
```

**Key Pages**:

1. **Shortage List View** (`/`)
   - Data table with sorting
   - Search bar (fuzzy search on drug name)
   - Filter panel (status, category, route, manufacturer)
   - Tag chips for active filters
   - Pagination
   - Export to CSV option

2. **Detail View** (`/shortages/[ndc]`)
   - Overview section (FDA data)
   - Clinical Context tabs:
     - Evidence & Research (PubMed, medRxiv)
     - Guidelines (Health.gov, NCBI Bookshelf)
     - Clinical Trials (ClinicalTrials.gov)
     - Related Conditions (ICD-10 codes)
     - Alternatives (similar drugs by class)
   - Manufacturer info
   - Timeline (shortage history)

3. **Analytics Dashboard** (`/analytics`)
   - Summary metrics (total active, resolved this month, etc.)
   - Charts:
     - Trend over time (line chart)
     - By therapeutic category (bar chart)
     - By route (pie chart)
     - By manufacturer (horizontal bar)
     - Geographic distribution (map)

4. **About/Methodology** (`/about`)
   - Data sources
   - Refresh frequency
   - Limitations
   - Contact info

### 5. Data Models

**TypeScript Interface**: `dashboard/lib/types.ts`

```typescript
interface DrugShortage {
  ndc: string;
  genericName: string;
  brandName: string | null;
  manufacturer: string;
  therapeuticCategories: string[];
  dosageForm: string;
  route: string; // Derived
  strength: string[];
  status: 'active' | 'resolved';
  shortageReason: string;
  availability: string;
  initialDate: Date;
  lastUpdated: Date;
  resolutionDate: Date | null;
  relatedInfo: string;
  relatedInfoLink: string | null;
}

interface EnrichedShortage extends DrugShortage {
  fdaDetails?: FDADrugInfo;
  pubmedArticles?: PubMedArticle[];
  healthGuidelines?: HealthTopic[];
  clinicalTrials?: ClinicalTrial[];
  icdCodes?: ICD10Code[];
  alternatives?: DrugAlternative[];
  manufacturerLocation?: GeoLocation;
}

interface ShortageAnalytics {
  totalActive: number;
  totalResolved: number;
  byCategory: CategoryCount[];
  byRoute: RouteCount[];
  byManufacturer: ManufacturerCount[];
  byRegion: RegionCount[];
  trends: TrendDataPoint[];
}

interface TrendDataPoint {
  date: Date;
  activeCount: number;
  newShortages: number;
  resolved: number;
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (Priority 1)
- ✅ Research FDA shortage API
- [ ] Implement `fda-shortage-tool.js`
- [ ] Add tool to MCP server registration
- [ ] Create `shortage-service.js`
- [ ] Write unit tests for shortage tool

### Phase 2: Dashboard API (Priority 1)
- [ ] Create `dashboard-server.js`
- [ ] Implement shortage list endpoint
- [ ] Implement shortage detail endpoint
- [ ] Implement analytics endpoints
- [ ] Add CORS and error handling

### Phase 3: Frontend - List View (Priority 1)
- [ ] Set up Next.js project
- [ ] Create shortage table component
- [ ] Implement search functionality
- [ ] Add filter panel
- [ ] Connect to API

### Phase 4: Enrichment (Priority 2)
- [ ] Implement enrichment in shortage service
- [ ] Create enrichment orchestration
- [ ] Add PubMed integration
- [ ] Add Health.gov integration
- [ ] Add Clinical Trials integration
- [ ] Add ICD-10 integration

### Phase 5: Frontend - Detail View (Priority 2)
- [ ] Create detail page layout
- [ ] Implement tabbed enrichment sections
- [ ] Add loading states
- [ ] Add error boundaries

### Phase 6: Analytics (Priority 2)
- [ ] Implement analytics computation
- [ ] Create trend tracking system
- [ ] Build analytics dashboard page
- [ ] Add charting library (Chart.js or Recharts)
- [ ] Create visualizations

### Phase 7: Mapping (Priority 3)
- [ ] Implement manufacturer geocoding
- [ ] Create geolocation service
- [ ] Add mapping component (Leaflet or Mapbox)
- [ ] Implement region aggregation

### Phase 8: Testing & Documentation (Priority 1)
- [ ] Write integration tests
- [ ] Update README with dashboard setup
- [ ] Create user guide
- [ ] Add Swagger/OpenAPI docs for new endpoints
- [ ] Performance testing

## Technical Decisions

### Why Next.js?
- Built-in API routes (can run frontend + backend together)
- Server-side rendering for better SEO and performance
- File-based routing
- TypeScript support out of the box
- Easy deployment (Vercel, etc.)

### Why Not Extend http-server.js?
- Separation of concerns: MCP tools vs dashboard app
- Different scaling needs
- Allows running dashboard independently
- Could be merged later if desired

### Caching Strategy
- **FDA Shortages**: 6 hours (data changes frequently)
- **Enrichment Data**: 24 hours (relatively stable)
- **Analytics**: 1 hour (computed from shortages)
- **Geolocation**: 7 days (rarely changes)

### Error Handling
- Graceful degradation: show FDA data even if enrichment fails
- Retry logic for transient errors
- Clear user messaging for permanent failures
- Logging for debugging

### Geolocation Approach (MVP)
1. Extract manufacturer name and contact info
2. Attempt to parse city/state/country from contact_info
3. Use placeholder geocoding function that returns null
4. Design API to support future geocoding service integration
5. For MVP: group by parsed state/country text

## Security Considerations
- API rate limiting (prevent abuse)
- Input validation and sanitization
- No sensitive data stored
- CORS configuration for production
- Environment variables for API keys

## Performance Targets
- Shortage list load: < 2 seconds
- Detail page load: < 3 seconds (including enrichment)
- Search response: < 500ms
- Analytics computation: < 1 second
- Support 1000+ shortages efficiently

## Future Enhancements (Post-MVP)
1. Real-time alerts/notifications
2. Email subscriptions for specific drugs
3. Historical shortage archive
4. Advanced filtering (date ranges, compound filters)
5. Export to PDF reports
6. Integration with hospital formulary systems
7. Mobile app
8. Machine learning for shortage prediction
9. Integration with actual geocoding APIs (Google Maps, Mapbox)
10. User authentication and personalization

## References

### Data Sources
- [openFDA Drug Shortages API](https://open.fda.gov/apis/drug/drugshortages/)
- [FDA Drug Shortages Database](https://www.accessdata.fda.gov/scripts/drugshortages/)
- [Data.gov - Drug Shortages Dataset](https://catalog.data.gov/dataset/current-and-resolved-drug-shortages-and-discontinuations-reported-to-fda)
- [openFDA Searchable Fields](https://open.fda.gov/apis/drug/drugshortages/searchable-fields/)
- [openFDA Query Syntax](https://open.fda.gov/apis/query-syntax/)

### Existing Infrastructure
- healthcare-mcp-public repository
- Existing MCP tools (FDA Drug, PubMed, Health.gov, etc.)
- node-cache caching system
- SQLite usage tracking

---

**Document Status**: Initial Draft
**Last Updated**: January 4, 2026
**Author**: Claude (AI Assistant)
**Review Status**: Pending team review
