# Healthcare MCP Desktop Extension (DXT)

This directory contains a Desktop Extension (DXT) version of the Healthcare MCP Server. The DXT format makes it easy to install and run MCP servers with a single click.

## What's Changed for DXT

### Structure
The original MCP server has been converted to follow DXT specifications:

- **`manifest.json`**: Contains all extension metadata and configuration
- **`server/`**: Contains the Python MCP server code with bundled dependencies
- **`package.json`**: Added ES module support for the extension
- **`healthcare-mcp.dxt`**: The packaged extension file

### Key Features
- **Self-contained**: All Python dependencies are bundled in `server/lib/`
- **Cross-platform**: Works on macOS, Windows, and Linux
- **User-configurable**: Supports optional FDA API key, cache settings, and debug mode
- **Zero setup**: No manual Python environment setup required

### Installation

#### Option 1: Using the DXT File
1. Download `healthcare-mcp.dxt`
2. Open the file with Claude Desktop (or another MCP-compatible application)
3. Follow the installation prompts
4. Configure optional settings like FDA API key if desired

#### Option 2: Manual Installation
If you want to install manually or use with other MCP clients:

1. Extract the DXT file (it's a zip archive):
   ```bash
   unzip healthcare-mcp.dxt -d healthcare-mcp-extension
   ```

2. Configure your MCP client to use the server:
   ```json
   {
     "mcpServers": {
       "healthcare-mcp": {
         "command": "python",
         "args": ["path/to/healthcare-mcp-extension/server/main.py"],
         "env": {
           "PYTHONPATH": "path/to/healthcare-mcp-extension/server:path/to/healthcare-mcp-extension/server/lib"
         }
       }
     }
   }
   ```

### Configuration Options

The DXT extension supports the following user-configurable options:

- **FDA API Key** (optional): For increased rate limits when querying FDA data
- **Cache TTL**: How long to cache API responses (default: 24 hours)
- **Debug Mode**: Enable detailed logging for troubleshooting

### Available Tools

The extension provides the same tools as the original MCP server:

1. **`fda_drug_lookup`**: Look up drug information from the FDA database
2. **`pubmed_search`**: Search medical literature in PubMed
3. **`health_topics`**: Get health information from Health.gov
4. **`clinical_trials_search`**: Search for clinical trials
5. **`lookup_icd_code`**: Look up ICD-10 medical codes
6. **`get_usage_stats`**: Get usage statistics for the current session
7. **`get_all_usage_stats`**: Get overall usage statistics

### Benefits of DXT Format

1. **Easy Installation**: Single-click installation in compatible applications
2. **No Dependencies**: All Python packages are bundled
3. **Configuration UI**: User-friendly interface for setting options
4. **Automatic Updates**: Support for extension updates through compatible clients
5. **Portability**: Works across different systems without setup

### Development

If you want to modify the extension:

1. Make changes to files in the `server/` directory
2. Update `manifest.json` if adding new tools or changing configuration
3. Increment the version in both `manifest.json` and `package.json`
4. Rebuild the DXT file:
   ```bash
   zip -r healthcare-mcp.dxt manifest.json server/ package.json -x "server/__pycache__/*" "server/**/__pycache__/*"
   ```

### Compatibility

- **Claude Desktop**: >=0.10.0
- **Platforms**: macOS, Windows, Linux
- **Python**: >=3.8,<4.0 (bundled, no installation required)

### Support

For issues related to the DXT extension:
- Check the original repository: https://github.com/Cicatriiz/healthcare-mcp-public
- Review DXT documentation: https://github.com/anthropics/dxt

### License

MIT License - same as the original Healthcare MCP Server
