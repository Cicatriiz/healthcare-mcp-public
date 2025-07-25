# Changelog

All notable changes to the Healthcare MCP project will be documented in this file.

## [2.1.0] - 2025-07-25

### 🆕 New Features

- **medRxiv Search**: Added a new tool to search for pre-print articles on medRxiv.
- **Medical Calculator**: Added a new tool to calculate Body Mass Index (BMI).
- **NCBI Bookshelf Search**: Added a new tool to search the NCBI Bookshelf for biomedical books and documents.
- **DICOM Metadata Extraction**: Added a new tool to extract metadata from a DICOM file.

### 🔧 Enhancements

- **PubMed Open Access Filter**: Enhanced the PubMed search tool with an option to filter for open-access articles.

### 📋 Documentation

- **Updated `manifest.json`**: Added entries for all new tools.
- **Updated `api-documentation.md`**: Added documentation for all new tools.
- **Updated `README.md`**: Updated the features list and API reference to include the new tools.

### 📦 Distribution

- **Repacked DXT**: The `healthcare-mcp.dxt` file has been updated to include all new features and documentation.

## [2.0.0] - 2025-07-05

### Major Changes
- **Simplified to Node.js-only implementation** - Removed Python codebase to focus on single, robust implementation
- **Restructured as single DXT package** - Consolidated into `healthcare-mcp.dxt` for easy distribution
- **Fixed all external API integrations** - Updated endpoints and parameters for current API versions

### 🔧 API Fixes & Updates

#### Health Topics Tool
- **Updated to Health.gov API v4** - Migrated from deprecated healthfinder.gov to `odphp.health.gov/myhealthfinder/api/v4`
- **Fixed endpoint paths** - Updated from `/api/topicsearch.json` to `/v4/topicsearch.json`
- **Improved response parsing** - Enhanced data extraction for v4 API format
- **Base URL updated** - Changed from `https://healthfinder.gov` to `https://odphp.health.gov/myhealthfinder/api/v4`

#### Clinical Trials Tool
- **Fixed API parameters** - Updated from `query.status` to `filter.overallStatus` for ClinicalTrials.gov API v2
- **Corrected status mapping** - Properly maps status values (recruiting → RECRUITING, etc.)
- **Enhanced error handling** - Better validation and error messages for API responses

#### FDA Tool
- **Improved response parsing** - Fixed data structure formatting for consistent output
- **Enhanced drug information extraction** - Better handling of complex FDA API responses
- **Updated response format** - Standardized output structure with proper `drugs` array formatting

### 🆕 New Features

#### Testing Infrastructure
- **Added comprehensive API test suite** (`test-apis.js`)
  - Live API connectivity testing
  - Response format validation
  - Error handling verification
- **Added tool instantiation tests** (`test-tools.js`)
  - Tool module loading verification
  - Basic functionality testing
  - Usage tracking validation

#### Enhanced Documentation
- **Updated README.md** - Reflects Node.js-only implementation
- **API documentation improvements** - Added notes about API version updates
- **DXT packaging documentation** - Instructions for single-package distribution

### 🗂️ Repository Structure Changes

#### Removed Files
- **Python implementation** - Deleted entire `server-python/` directory and related files
  - `server-python/main.py`
  - `server-python/requirements.txt`
  - `server-python/tools/` directory
  - Python-specific configuration files
- **Duplicate manifests** - Removed redundant `manifest-python.json`
- **Legacy documentation** - Cleaned up outdated Python-related docs

#### Updated Files
- **manifest.json** - Updated to reflect Node.js-only structure
- **package.json** - Streamlined for single implementation
- **README.md** - Updated features list and installation instructions
- **DXT structure** - Reorganized for optimal packaging

### 🐛 Bug Fixes
- **Fixed usage tracking** - Corrected property name mismatch in usage statistics
- **Fixed ICD lookup response parsing** - Corrected property access for medical terminology lookups
- **Resolved import path issues** - Fixed module loading for all tools
- **Cache service integration** - Proper cache service initialization across all tools

### 🛠️ Technical Improvements

#### Code Quality
- **ES Module compliance** - Full ES module implementation with proper imports/exports
- **Error handling enhancement** - Improved error messages and validation
- **Code organization** - Better separation of concerns and module structure

#### Dependencies
- **Updated package.json** - Set `"type": "module"` for ES module support
- **Dependency cleanup** - Removed unnecessary Python-related dependencies
- **Node.js optimization** - Focused dependency tree for Node.js environment

#### Performance
- **Caching improvements** - Enhanced cache service for better API response caching
- **Memory optimization** - Reduced memory footprint with single implementation
- **API rate limiting** - Better handling of external API rate limits

### 📦 Distribution
- **Single DXT package** - Created `healthcare-mcp.dxt` (8.4MB compressed, 20.4MB unpacked)
- **2,524 files packaged** - Complete Node.js implementation with dependencies
- **Optimized .dxtignore** - Excluded 771 unnecessary files for smaller package size

### 🧪 Testing & Verification
- **Live API testing** - All external APIs verified working with current endpoints
- **Response format validation** - Confirmed data structures match expected formats
- **Error scenario testing** - Validated error handling for various failure modes
- **Integration testing** - End-to-end testing of tool chain functionality

### 📋 Migration Notes
- **Breaking change**: Python implementation no longer available
- **API compatibility**: All tools now use current API versions
- **Installation**: Single DXT file installation replaces multi-language setup
- **Configuration**: Simplified configuration with Node.js-only requirements

### 🔗 External API Versions
- **Health.gov API**: v4 (odphp.health.gov)
- **ClinicalTrials.gov API**: v2 
- **FDA OpenFDA API**: Current version
- **PubMed E-utilities**: Current version
- **NLM Clinical Tables**: v3 (ICD-10-CM)

---

## Previous Versions

### [0.x.x] - Prior to 2025-07-05
- Multi-language implementation (Node.js + Python)
- Legacy API endpoints (some deprecated)
- Manual installation process
- Separate language-specific packages
