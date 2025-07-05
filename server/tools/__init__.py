# Import tools
import os
from tools.fda_tool import FDATool
from tools.pubmed_tool import PubMedTool

# Set up data directory
data_dir = os.environ.get('DATA_DIR', os.path.join(os.getcwd(), 'data'))
os.makedirs(data_dir, exist_ok=True)
cache_db_path = os.path.join(data_dir, 'healthcare_cache.db')

# Initialize tools
fda_tool = FDATool(cache_db_path=cache_db_path)
pubmed_tool = PubMedTool(cache_db_path=cache_db_path)

# Define tool actions for registration
fda_drug_lookup = {
    "name": "fda_drug_lookup",
    "description": "Look up drug information from the FDA database",
    "parameters": [
        {
            "name": "drug_name",
            "description": "Name of the drug to search for",
            "required": True,
            "type": "string"
        },
        {
            "name": "search_type",
            "description": "Type of information to retrieve: 'label', 'adverse_events', or 'general'",
            "required": False,
            "type": "string",
            "default": "general"
        }
    ],
    "handler": fda_tool.lookup_drug
}

pubmed_search = {
    "name": "pubmed_search",
    "description": "Search for medical literature in PubMed database",
    "parameters": [
        {
            "name": "query",
            "description": "Search query for medical literature",
            "required": True,
            "type": "string"
        },
        {
            "name": "max_results",
            "description": "Maximum number of results to return",
            "required": False,
            "type": "integer",
            "default": 5
        },
        {
            "name": "date_range",
            "description": "Limit to articles published within years (e.g. '5' for last 5 years)",
            "required": False,
            "type": "string",
            "default": ""
        }
    ],
    "handler": pubmed_tool.search_literature
}

# List of all tools for registration
all_tools = [
    fda_drug_lookup,
    pubmed_search
]
