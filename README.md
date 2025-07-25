# Healthcare MCP Server

[![smithery badge](https://smithery.ai/badge/@Cicatriiz/healthcare-mcp-public)](https://smithery.ai/server/@Cicatriiz/healthcare-mcp-public)
A Model Context Protocol (MCP) server providing AI assistants with access to healthcare data and medical information tools.

<a href="https://glama.ai/mcp/servers/@Cicatriiz/healthcare-mcp-public/healthcare-mcp-public">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Cicatriiz/healthcare-mcp-public/badge" alt="Healthcare Server MCP server" />
</a>

## Overview

Healthcare MCP Server is a specialized Node.js server that implements the Model Context Protocol (MCP) to provide AI assistants with access to healthcare data and medical information tools. It enables AI models to retrieve accurate, up-to-date medical information from authoritative sources. This repository provides a single DXT package containing the complete Node.js implementation.

## DXT Extension

This repository includes a packaged DXT (Desktop Extension) file for easy installation in compatible development environments. Download `healthcare-mcp.dxt` for one-click installation.

## Features

- **FDA Drug Information**: Search and retrieve comprehensive drug information from the FDA database (improved response parsing)
- **PubMed Research**: Search medical literature from PubMed's database of scientific articles
- **Health Topics**: Access evidence-based health information from Health.gov (updated to API v4)
- **Clinical Trials**: Search for ongoing and completed clinical trials (updated API parameters)
- **Medical Terminology**: Look up ICD-10 codes and medical terminology definitions
- **Caching**: Efficient caching system with connection pooling to reduce API calls and improve performance
- **Usage Tracking**: Anonymous usage tracking to monitor API usage
- **Error Handling**: Robust error handling and logging
- **Multiple Interfaces**: Support for both stdio (for CLI) and HTTP/SSE interfaces
- **API Documentation**: Interactive API documentation with Swagger UI
- **Comprehensive Testing**: Extensive test suite with Node.js testing and API verification

## Installation

### Option 1: DXT Extension (Recommended)

1. Download `healthcare-mcp.dxt` from this repository
2. Open with your compatible MCP client (such as Claude Desktop)
3. Follow the installation prompts
4. Configure optional settings through the GUI

### Option 2: Installing via Smithery

To install Healthcare Data and Medical Information Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@Cicatriiz/healthcare-mcp-public):

```bash
npx -y @smithery/cli install @Cicatriiz/healthcare-mcp-public --client claude
```

### Option 3: npm Installation

1. Install the package:
   ```bash
   npm install healthcare-mcp
   ```

2. Run the server:
   ```bash
   npx healthcare-mcp
   ```

### Option 4: Manual Installation from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/Cicatriiz/healthcare-mcp-public.git
   cd healthcare-mcp-public/server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (optional):
   ```bash
   # Create .env file from example
   cp .env.example .env
   # Edit .env with your API keys (optional)
   ```

4. Run the server:
   ```bash
   npm start
   ```

## Usage

### Running the Server

- **stdio mode** (default, for MCP clients):
  ```bash
  npm start
  ```

- **HTTP/SSE mode** (for web clients):
  ```bash
  npm run server:http
  ```

### Testing the Tools

You can test the MCP tools using the built-in test scripts:

```bash
# Test all tools
npm test

# Test individual tools
npm run test:fda        # Test FDA drug lookup
npm run test:pubmed     # Test PubMed search
npm run test:health     # Test Health Topics
npm run test:trials     # Test Clinical Trials search
npm run test:icd        # Test ICD-10 code lookup
```

## API Reference

The Healthcare MCP Server provides both a programmatic API for direct integration and a RESTful HTTP API for web clients.

### RESTful API Endpoints

When running in HTTP mode, the following endpoints are available:

#### Health Check
```
GET /health
```
Returns the status of the server and its services.

#### FDA Drug Lookup
```
GET /api/fda?drug_name={drug_name}&search_type={search_type}
```

**Parameters:**
- `drug_name`: Name of the drug to search for
- `search_type`: Type of information to retrieve
  - `general`: Basic drug information (default)
  - `label`: Drug labeling information
  - `adverse_events`: Reported adverse events

**Example Response:**
```json
{
  "status": "success",
  "drug_name": "aspirin",
  "search_type": "general",
  "total_results": 25,
  "results": [
    {
      "brand_name": "ASPIRIN",
      "generic_name": "ASPIRIN",
      "manufacturer": "Bayer Healthcare",
      "product_type": "HUMAN OTC DRUG",
      "route": "ORAL",
      "active_ingredients": [
        {
          "name": "ASPIRIN",
          "strength": "325 mg/1"
        }
      ]
    }
  ]
}
```

#### PubMed Search
```
GET /api/pubmed?query={query}&max_results={max_results}&date_range={date_range}
```

**Parameters:**
- `query`: Search query for medical literature
- `max_results`: Maximum number of results to return (default: 5, max: 50)
- `date_range`: Limit to articles published within years (e.g. '5' for last 5 years)

**Example Response:**
```json
{
  "status": "success",
  "query": "diabetes treatment",
  "total_results": 123456,
  "date_range": "5",
  "articles": [
    {
      "pmid": "12345678",
      "title": "New advances in diabetes treatment",
      "authors": ["Smith J", "Johnson A"],
      "journal": "Journal of Diabetes Research",
      "publication_date": "2023-01-15",
      "abstract": "This study explores new treatment options...",
      "url": "https://pubmed.ncbi.nlm.nih.gov/12345678/"
    }
  ]
}
```

#### Health Topics
```
GET /api/health_finder?topic={topic}&language={language}
```

**Parameters:**
- `topic`: Health topic to search for information
- `language`: Language for content (en or es, default: en)

**Example Response:**
```json
{
  "status": "success",
  "search_term": "diabetes",
  "language": "en",
  "total_results": 15,
  "topics": [
    {
      "title": "Diabetes Type 2",
      "url": "https://health.gov/myhealthfinder/topics/health-conditions/diabetes/diabetes-type-2",
      "last_updated": "2023-05-20",
      "section": "Health Conditions",
      "description": "Information about managing type 2 diabetes",
      "content": ["Diabetes is a disease...", "Treatment options include..."]
    }
  ]
}
```

#### Clinical Trials Search
```
GET /api/clinical_trials?condition={condition}&status={status}&max_results={max_results}
```

**Parameters:**
- `condition`: Medical condition or disease to search for
- `status`: Trial status (recruiting, completed, active, not_recruiting, or all)
- `max_results`: Maximum number of results to return (default: 10, max: 100)

**Example Response:**
```json
{
  "status": "success",
  "condition": "breast cancer",
  "search_status": "recruiting",
  "total_results": 256,
  "trials": [
    {
      "nct_id": "NCT12345678",
      "title": "Study of New Treatment for Breast Cancer",
      "status": "Recruiting",
      "phase": "Phase 2",
      "study_type": "Interventional",
      "conditions": ["Breast Cancer", "HER2-positive Breast Cancer"],
      "locations": [
        {
          "facility": "Memorial Hospital",
          "city": "New York",
          "state": "NY",
          "country": "United States"
        }
      ],
      "sponsor": "National Cancer Institute",
      "url": "https://clinicaltrials.gov/study/NCT12345678",
      "eligibility": {
        "gender": "Female",
        "min_age": "18 Years",
        "max_age": "75 Years",
        "healthy_volunteers": "No"
      }
    }
  ]
}
```

#### ICD-10 Code Lookup
```
GET /api/medical_terminology?code={code}&description={description}&max_results={max_results}
```

**Parameters:**
- `code`: ICD-10 code to look up (optional if description is provided)
- `description`: Medical condition description to search for (optional if code is provided)
- `max_results`: Maximum number of results to return (default: 10, max: 50)

**Example Response:**
```json
{
  "status": "success",
  "search_type": "description",
  "search_term": "diabetes",
  "total_results": 25,
  "codes": [
    {
      "code": "E11",
      "description": "Type 2 diabetes mellitus",
      "category": "Endocrine, nutritional and metabolic diseases"
    },
    {
      "code": "E10",
      "description": "Type 1 diabetes mellitus",
      "category": "Endocrine, nutritional and metabolic diseases"
    }
  ]
}
```

#### Generic Tool Execution
```
POST /mcp/call-tool
```

**Request Body:**
```json
{
  "name": "fda_drug_lookup",
  "arguments": {
    "drug_name": "aspirin",
    "search_type": "general"
  },
  "session_id": "optional-session-id"
}
```

### MCP Tools

When using the MCP server through compatible clients, the following tools are available:

#### FDA Drug Lookup

```javascript
fda_drug_lookup(drug_name, search_type = "general")
```

**Parameters:**
- `drug_name`: Name of the drug to search for
- `search_type`: Type of information to retrieve
  - `general`: Basic drug information (default)
  - `label`: Drug labeling information
  - `adverse_events`: Reported adverse events

#### PubMed Search

```javascript
pubmed_search(query, max_results = 5, date_range = "")
```

**Parameters:**
- `query`: Search query for medical literature
- `max_results`: Maximum number of results to return (default: 5)
- `date_range`: Limit to articles published within years (e.g. '5' for last 5 years)

#### Health Topics

```javascript
health_topics(topic, language = "en")
```

**Parameters:**
- `topic`: Health topic to search for information
- `language`: Language for content (en or es, default: en)

#### Clinical Trials Search

```javascript
clinical_trials_search(condition, status = "recruiting", max_results = 10)
```

**Parameters:**
- `condition`: Medical condition or disease to search for
- `status`: Trial status (recruiting, completed, active, not_recruiting, or all)
- `max_results`: Maximum number of results to return

#### ICD-10 Code Lookup

```javascript
lookup_icd_code(code = null, description = null, max_results = 10)
```

**Parameters:**
- `code`: ICD-10 code to look up (optional if description is provided)
- `description`: Medical condition description to search for (optional if code is provided)
- `max_results`: Maximum number of results to return

## Data Sources

This MCP server utilizes several publicly available healthcare APIs:

- [FDA OpenFDA API](https://open.fda.gov/apis/)
- [PubMed E-utilities API](https://www.ncbi.nlm.nih.gov/books/NBK25500/)
- [Health.gov API](https://health.gov/our-work/national-health-initiatives/health-literacy/consumer-health-content/free-web-content/apis-developers)
- [ClinicalTrials.gov API](https://clinicaltrials.gov/data-api/about-api)
- [NLM Clinical Table Search Service for ICD-10-CM](https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html)

## License

MIT License