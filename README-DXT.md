# Healthcare MCP Node.js Extension

A comprehensive healthcare data and research MCP (Model Context Protocol) server implemented in Node.js. This DXT (Desktop Extension) provides access to FDA drug information, PubMed research, health topics, clinical trials, medical terminology, and usage analytics.

## Features

- **FDA Drug Lookup**: Search and retrieve detailed information about FDA-approved drugs
- **PubMed Research**: Access medical research articles and publications
- **Health Topics**: Get information on various health conditions and topics
- **Clinical Trials**: Search for ongoing and completed clinical trials
- **Medical Terminology**: Look up ICD-10 codes and medical terms
- **Usage Analytics**: Track and analyze tool usage patterns

## Installation

### DXT Extension Installation

1. Download the `healthcare-mcp-nodejs.dxt` file
2. Install it in your DXT-compatible application
3. Configure the extension with your API keys (see Configuration section)

### Manual Installation

1. Clone this repository
2. Navigate to the `server-nodejs` directory
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```

## Configuration

The extension supports the following configuration options:

### API Keys (Optional but Recommended)

While the extension can work without API keys for some services, providing them will give you:
- Higher rate limits
- Access to premium features
- Better performance

Available API configurations:
- **FDA API Key**: For enhanced FDA drug database access
- **NCBI API Key**: For improved PubMed search performance
- **NIH API Key**: For clinical trials and health topics

### Configuration Options

When installing the DXT extension, you can configure:

- `fda_api_key` (string): Your FDA API key
- `ncbi_api_key` (string): Your NCBI E-utilities API key
- `enable_caching` (boolean): Enable response caching (default: true)
- `cache_duration` (number): Cache duration in minutes (default: 60)
- `rate_limit` (number): Requests per minute (default: 100)

## Available Tools

### 1. FDA Drug Lookup (`fda_drug_lookup`)

Search for FDA-approved drugs and get detailed information including:
- Drug name and generic name
- Manufacturer information
- Approval date
- Indications and usage
- Warnings and precautions
- Dosage and administration

**Parameters:**
- `query` (string): Drug name or active ingredient to search for
- `limit` (number, optional): Maximum number of results (default: 10)

**Example:**
```json
{
  "query": "aspirin",
  "limit": 5
}
```

### 2. PubMed Research Search (`pubmed_search`)

Search PubMed database for medical research articles and publications.

**Parameters:**
- `query` (string): Search query for medical research
- `max_results` (number, optional): Maximum number of results (default: 10)
- `sort` (string, optional): Sort order - "relevance" or "date" (default: "relevance")

**Example:**
```json
{
  "query": "diabetes treatment",
  "max_results": 20,
  "sort": "date"
}
```

### 3. Health Topics (`health_topics`)

Get comprehensive information about health conditions and topics.

**Parameters:**
- `topic` (string): Health topic or condition to search for
- `detailed` (boolean, optional): Return detailed information (default: false)

**Example:**
```json
{
  "topic": "hypertension",
  "detailed": true
}
```

### 4. Clinical Trials Search (`clinical_trials_search`)

Search for clinical trials related to specific conditions or treatments.

**Parameters:**
- `condition` (string): Medical condition or disease
- `intervention` (string, optional): Treatment or intervention type
- `status` (string, optional): Trial status ("recruiting", "active", "completed")
- `location` (string, optional): Geographic location
- `limit` (number, optional): Maximum number of results (default: 10)

**Example:**
```json
{
  "condition": "breast cancer",
  "intervention": "immunotherapy",
  "status": "recruiting",
  "limit": 15
}
```

### 5. Medical Terminology Lookup (`medical_terminology_lookup`)

Look up medical terms, ICD-10 codes, and related information.

**Parameters:**
- `term` (string): Medical term or ICD-10 code to look up
- `category` (string, optional): Category of lookup ("icd10", "terminology", "all")

**Example:**
```json
{
  "term": "E11.9",
  "category": "icd10"
}
```

### 6. Usage Analytics (`usage_analytics`)

Get usage statistics and analytics for the MCP tools.

**Parameters:**
- `period` (string, optional): Time period ("day", "week", "month") (default: "day")
- `tool` (string, optional): Specific tool to analyze (default: all tools)

**Example:**
```json
{
  "period": "week",
  "tool": "fda_drug_lookup"
}
```

## Technical Details

### Architecture

The Node.js MCP server is built using:
- **@modelcontextprotocol/sdk**: Official MCP SDK for Node.js
- **Express.js**: Web framework for HTTP endpoints
- **SQLite3**: Local database for caching and analytics
- **Node-cache**: In-memory caching for improved performance

### Caching Strategy

The extension implements multi-level caching:
1. **In-memory cache**: Fast access for frequently requested data
2. **SQLite database**: Persistent storage for offline access
3. **Configurable TTL**: Customizable cache expiration times

### Error Handling

Robust error handling includes:
- API rate limiting protection
- Network timeout handling
- Graceful degradation when services are unavailable
- Detailed error messages for troubleshooting

### Security Features

- Input validation and sanitization
- Rate limiting to prevent abuse
- Secure API key storage
- No sensitive data logging

## Development

### Project Structure

```
server-nodejs/
├── index.js                 # Main MCP server entry point
├── package.json             # Node.js dependencies and scripts
├── base-tool.js             # Base class for all tools
├── cache-service.js         # Caching functionality
├── usage-service.js         # Usage tracking and analytics
├── fda-tool.js             # FDA drug lookup tool
├── pubmed-tool.js          # PubMed search tool
├── health-topics-tool.js   # Health topics tool
├── clinical-trials-tool.js # Clinical trials search tool
├── medical-terminology-tool.js # Medical terminology lookup
└── node_modules/           # Dependencies
```

### Adding New Tools

To add a new tool:

1. Create a new tool file extending the base tool class:
```javascript
const BaseTool = require('./base-tool');

class NewTool extends BaseTool {
  constructor() {
    super('new_tool', 'Description of the new tool');
  }

  async execute(params) {
    // Implementation
    return this.formatResponse(data);
  }
}

module.exports = NewTool;
```

2. Register the tool in `index.js`:
```javascript
const NewTool = require('./new-tool');
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools
      new NewTool().getDefinition()
    ]
  };
});
```

### Testing

Run the test suite:
```bash
npm test
```

For manual testing:
```bash
npm run test:manual
```

### Building DXT Package

To create a new DXT package:
```bash
npm run build:dxt
```

## API Rate Limits

Default rate limits (can be configured):
- FDA API: 1000 requests/hour
- PubMed API: 10 requests/second
- ClinicalTrials.gov: 1000 requests/hour

## Troubleshooting

### Common Issues

1. **API Key Invalid**: Verify your API keys are correctly configured
2. **Rate Limit Exceeded**: Reduce request frequency or wait before retrying
3. **Network Timeout**: Check internet connection and API service status
4. **Cache Issues**: Clear cache using the provided tools or restart the extension

### Debug Mode

Enable debug logging by setting the environment variable:
```bash
DEBUG=healthcare-mcp:* npm start
```

### Log Files

Logs are stored in:
- Application logs: `~/.local/share/healthcare-mcp/logs/`
- Error logs: `~/.local/share/healthcare-mcp/error.log`

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to the main repository.

## Support

For support and questions:
- Check the troubleshooting section above
- Review the MCP documentation
- Open an issue in the project repository

## Changelog

### Version 1.0.0
- Initial Node.js implementation
- All core healthcare tools implemented
- DXT packaging support
- Comprehensive caching system
- Usage analytics
- Error handling and validation

---

*This extension is part of the Healthcare MCP project and provides Node.js-based implementation for healthcare data access through the Model Context Protocol.*
