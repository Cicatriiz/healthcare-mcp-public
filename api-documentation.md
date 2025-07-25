# Healthcare MCP Server API Documentation

This document provides detailed documentation for all tools available in the Healthcare MCP Server.

## Current Tools

### 1. FDA Drug Lookup

```
fda_drug_lookup(drug_name: str, search_type: str = "general")
```

**Description:**  
Look up drug information from the FDA database.

**Parameters:**
- `drug_name`: Name of the drug to search for (required)
- `search_type`: Type of information to retrieve (optional, default: "general")
  - `general`: Basic drug information
  - `label`: Drug labeling information
  - `adverse_events`: Reported adverse events

**Example Request:**
```python
result = await fda_drug_lookup(drug_name="aspirin", search_type="label")
```

**Example Response:**
```json
{
  "status": "success",
  "drug_name": "aspirin",
  "results": [
    {
      "generic_name": "ASPIRIN",
      "brand_name": "BAYER ASPIRIN",
      "manufacturer": "Bayer Healthcare",
      "product_type": "HUMAN OTC DRUG",
      "route": ["ORAL"],
      "dosage_form": "TABLET",
      "warnings": "...",
      "indications_and_usage": "...",
      "contraindications": "..."
    }
  ],
  "total_results": 3
}
```

**Error Response:**
```json
{
  "status": "error",
  "error_message": "Error fetching drug information: 404 Client Error: Not Found"
}
```

**Rate Limits:**
- Free tier: 100 calls/month
- Basic tier: 1,000 calls/month
- Professional tier: 10,000 calls/month

**Testing:**
Use the test file to test this tool:
```bash
python -m tests.run_tests --fda
```

**Change Log (April 28, 2025):**

- Fixed an issue where the FDA Drug Lookup endpoint would return a 500 Internal Server Error due to incorrect query formatting for the FDA API. The query now uses spaces around `OR` (e.g., `openfda.generic_name:aspirin OR openfda.brand_name:aspirin`), matching the FDA API's requirements.
- Integration tests confirm the endpoint now returns the correct drug label information for valid requests.

### 2. PubMed Search

```
pubmed_search(query: str, max_results: int = 5, date_range: str = "")
```

**Description:**  
Search for medical literature in the PubMed database.

**Parameters:**
- `query`: Search query for medical literature (required)
- `max_results`: Maximum number of results to return (optional, default: 5)
- `date_range`: Limit to articles published within years (optional, e.g. '5' for last 5 years)

**Example Request:**
```python
result = await pubmed_search(query="diabetes treatment", max_results=3, date_range="2")
```

**Example Response:**
```json
{
  "status": "success",
  "query": "diabetes treatment",
  "total_results": 234567,
  "articles": [
    {
      "id": "36251234",
      "title": "New Advances in Type 2 Diabetes Treatment",
      "authors": ["Smith, John A.", "Johnson, Emily B."],
      "journal": "Journal of Diabetes Research",
      "publication_date": "2023 Mar",
      "abstract_url": "https://pubmed.ncbi.nlm.nih.gov/36251234/"
    },
    {
      "id": "36249876",
      "title": "Comparative Efficacy of GLP-1 Receptor Agonists",
      "authors": ["Patel, Anish", "Williams, Sarah"],
      "journal": "Diabetes Care",
      "publication_date": "2023 Feb",
      "abstract_url": "https://pubmed.ncbi.nlm.nih.gov/36249876/"
    },
    {
      "id": "36245678",
      "title": "Long-term Outcomes of Early Insulin Therapy",
      "authors": ["Garcia, Maria", "Chen, David"],
      "journal": "Annals of Internal Medicine",
      "publication_date": "2023 Jan",
      "abstract_url": "https://pubmed.ncbi.nlm.nih.gov/36245678/"
    }
  ]
}
```

**Error Response:**
```json
{
  "status": "error",
  "error_message": "Error searching PubMed: 429 Client Error: Too Many Requests"
}
```

**Rate Limits:**
- Free tier: 100 calls/month
- Basic tier: 1,000 calls/month
- Professional tier: 10,000 calls/month

**Testing:**
Use the test file to test this tool:
```bash
python -m tests.run_tests --pubmed
```

### 3. Health Topics

```
health_topics(topic: str, language: str = "en")
```

**Description:**  
Get evidence-based health information on various topics from Health.gov.

**Parameters:**
- `topic`: Health topic to search for information (required)
- `language`: Language for content (optional, default: "en")
  - Supported values: "en" (English), "es" (Spanish)

**Example Request:**
```python
result = await health_topics(topic="nutrition", language="en")
```

**Example Response:**
```json
{
  "status": "success",
  "search_term": "nutrition",
  "language": "en",
  "total_results": 15,
  "topics": [
    {
      "title": "Healthy Eating Plan",
      "url": "https://health.gov/myhealthfinder/topics/health-conditions/diabetes/healthy-eating-plan",
      "last_updated": "2023-01-12",
      "section": "Prevention and Wellness",
      "description": "Nutrition and healthy eating guidelines"
    },
    {
      "title": "Nutrition in Pregnancy",
      "url": "https://health.gov/myhealthfinder/topics/pregnancy/nutrition-during-pregnancy",
      "last_updated": "2023-02-10",
      "section": "Pregnancy",
      "description": "Nutrition guidelines during pregnancy"
    }
  ]
}
```

**Error Response:**
```json
{
  "status": "error",
  "error_message": "Error fetching health information: 500 Server Error: Internal Server Error"
}
```

**Rate Limits:**
- Free tier: 100 calls/month
- Basic tier: 1,000 calls/month
- Professional tier: 10,000 calls/month

**Testing:**
Use the test file to test this tool:
```bash
python -m tests.run_tests --health
```

## Additional Current Tools

### 4. Clinical Trials Search

```
clinical_trials_search(condition: str, status: str = "recruiting", max_results: int = 10)
```

**Description:**  
Search for clinical trials by condition, status, and other parameters.

**Parameters:**
- `condition`: Medical condition or disease to search for (required)
- `status`: Trial status (optional, default: "recruiting")
  - Options: "recruiting", "completed", "active", "not_recruiting", "terminated", "withdrawn", "all"
- `max_results`: Maximum number of results to return (optional, default: 10)

**Example Request:**
```python
result = await clinical_trials_search(condition="breast cancer", status="recruiting", max_results=5)
```

**Example Response:**
```json
{
  "status": "success",
  "condition": "breast cancer",
  "search_status": "recruiting",
  "total_results": 482,
  "trials": [
    {
      "nct_id": "NCT05123456",
      "title": "Novel Immunotherapy for Metastatic Breast Cancer",
      "status": "Recruiting",
      "phase": "Phase 2",
      "study_type": "Interventional",
      "conditions": ["Breast Cancer", "Metastatic Breast Cancer"],
      "locations": [
        {
          "facility": "Memorial Sloan Kettering Cancer Center",
          "city": "New York",
          "state": "NY",
          "country": "United States"
        }
      ],
      "url": "https://clinicaltrials.gov/study/NCT05123456"
    }
  ]
}
```

**Testing:**
Use the test file to test this tool:
```bash
python -m tests.run_tests --trials
```

### 5. Medical Terminology/ICD-10 Lookup

```
lookup_icd_code(code: str = None, description: str = None, max_results: int = 10)
```

**Description:**  
Look up ICD-10 codes by code or description.

**Parameters:**
- `code`: ICD-10 code to look up (optional if description is provided)
- `description`: Medical condition description to search for (optional if code is provided)
- `max_results`: Maximum number of results to return (optional, default: 10)

**Example Request:**
```python
result = await lookup_icd_code(code="E11.9")
# OR
result = await lookup_icd_code(description="type 2 diabetes")
```

**Example Response:**
```json
{
  "status": "success",
  "search_term": "E11.9",
  "total_results": 1,
  "results": [
    {
      "code": "E11.9",
      "description": "Type 2 diabetes mellitus without complications",
      "category": "E11",
      "category_description": "Type 2 diabetes mellitus",
      "chapter": "IV",
      "chapter_description": "Endocrine, nutritional and metabolic diseases"
    }
  ]
}
```

**Testing:**
Use the test file to test this tool:
```bash
python -m tests.run_tests --icd
```

### 6. medRxiv Search

```
medrxiv_search(query: str, max_results: int = 10)
```

**Description:**  
Search for pre-print articles on medRxiv.

**Parameters:**
- `query`: Search query for medRxiv articles (required)
- `max_results`: Maximum number of results to return (optional, default: 10)

### 7. Calculate BMI

```
calculate_bmi(height_meters: float, weight_kg: float)
```

**Description:**  
Calculate Body Mass Index (BMI).

**Parameters:**
- `height_meters`: Height in meters (required)
- `weight_kg`: Weight in kilograms (required)

### 8. NCBI Bookshelf Search

```
ncbi_bookshelf_search(query: str, max_results: int = 10)
```

**Description:**  
Search the NCBI Bookshelf for biomedical books and documents.

**Parameters:**
- `query`: Search query for NCBI Bookshelf (required)
- `max_results`: Maximum number of results to return (optional, default: 10)

### 9. Extract DICOM Metadata

```
extract_dicom_metadata(file_path: str)
```

**Description:**  
Extract metadata from a DICOM file.

**Parameters:**
- `file_path`: Path to the DICOM file (required)

## Usage Limits and Tiers

The Healthcare MCP Server implements usage limits based on subscription tiers:

### Free Tier
- API calls: 100 per month
- Caching: 24 hours
- Response size: Limited to basic data

### Basic Tier ($9.99/month)
- API calls: 1,000 per month
- Caching: 12 hours
- Response size: Full data
- Access to all tools

### Professional Tier ($29.99/month)
- API calls: 10,000 per month
- Caching: Optional (configurable)
- Response size: Full data with additional details
- Access to all tools
- Priority support

### Enterprise Tier (Custom pricing)
- API calls: Unlimited
- Dedicated support
- Custom integration options
- SLA guarantees

## Error Handling

All tools follow a consistent error handling pattern:

### Common Error Codes:
- `400`: Bad Request - Invalid parameters
- `401`: Unauthorized - Invalid or missing API key
- `403`: Forbidden - Rate limit exceeded
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - API rate limit exceeded
- `500`: Internal Server Error - Server-side error

### Error Response Format:
```json
{
  "status": "error",
  "error_message": "Detailed error description",
  "error_code": 429  // Optional HTTP status code
}
```

## Authentication

For HTTP/SSE transport, include your API key in the request headers:

```
X-API-Key: your_api_key_here
```

For direct Cline connections, the API key is optional as the server will create a session-based ID.
