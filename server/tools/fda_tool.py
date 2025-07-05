import os
import logging
import re
from typing import Dict, Any, Optional, List
from tools.base_tool import BaseTool

logger = logging.getLogger("healthcare-mcp")

class FDATool(BaseTool):
    """Tool for accessing FDA drug information"""
    
    def __init__(self, cache_db_path: str = "healthcare_cache.db"):
        """Initialize the FDA tool with API key and base URL"""
        super().__init__(cache_db_path=cache_db_path)
        self.api_key = os.getenv("FDA_API_KEY", "")
        self.base_url = "https://api.fda.gov/drug"
    
    def _extract_key_info(self, data: Dict[str, Any], search_type: str) -> Dict[str, Any]:
        """
        Extract and sanitize key information from FDA API response
        
        Args:
            data: Raw FDA API response data
            search_type: Type of search performed
            
        Returns:
            Dictionary with extracted and sanitized information
        """
        extracted = {}
        
        # Handle empty results
        if not data or not isinstance(data, dict) or "results" not in data:
            return extracted
            
        # Get the first result (most relevant)
        result = data["results"][0] if data["results"] else {}
        
        # Extract basic information based on search type
        if search_type == "label":
            # Extract drug identification
            if "openfda" in result:
                openfda = result.get("openfda", {})
                extracted["brand_names"] = openfda.get("brand_name", [])[:3]  # Limit to 3 names
                extracted["generic_names"] = openfda.get("generic_name", [])[:3]
                extracted["manufacturer"] = openfda.get("manufacturer_name", [])[:1]
                
            # Extract key clinical information (limit size)
            extracted["indications"] = self._sanitize_text(result.get("indications_and_usage", []))
            extracted["dosage"] = self._sanitize_text(result.get("dosage_and_administration", []))
            extracted["warnings"] = self._sanitize_text(result.get("warnings_and_cautions", []))
            extracted["contraindications"] = self._sanitize_text(result.get("contraindications", []))
            
            # Extract adverse reactions (but sanitize to remove HTML)
            raw_adverse = result.get("adverse_reactions", [])
            extracted["adverse_reactions"] = self._sanitize_text(raw_adverse)
            
            # Extract drug interactions
            extracted["drug_interactions"] = self._sanitize_text(result.get("drug_interactions", []))
            
            # Extract pregnancy info
            extracted["pregnancy"] = self._sanitize_text(result.get("pregnancy", []))
            
        elif search_type == "adverse_events":
            # We'll use the label data but focus specifically on adverse events
            if "openfda" in result:
                openfda = result.get("openfda", {})
                extracted["brand_names"] = openfda.get("brand_name", [])[:3]
                extracted["generic_names"] = openfda.get("generic_name", [])[:3]
            
            # Focus on adverse reactions and warnings
            extracted["adverse_reactions"] = self._sanitize_text(result.get("adverse_reactions", []))
            extracted["warnings"] = self._sanitize_text(result.get("warnings_and_cautions", []))
            extracted["boxed_warning"] = self._sanitize_text(result.get("boxed_warning", []))
            
        else:  # general
            # Extract basic drug identification
            extracted["generic_name"] = result.get("generic_name", "")
            extracted["brand_name"] = result.get("brand_name", "")
            extracted["manufacturer"] = result.get("labeler_name", "")
            extracted["product_type"] = result.get("product_type", "")
            extracted["route"] = result.get("route", [])
            extracted["marketing_status"] = result.get("marketing_status", "")
        
        return extracted
    
    def _sanitize_text(self, text_list: List[str]) -> List[str]:
        """
        Sanitize text to remove HTML and limit size
        
        Args:
            text_list: List of text strings that may contain HTML
            
        Returns:
            List of sanitized text strings
        """
        if not text_list:
            return []
            
        sanitized = []
        for text in text_list:
            if not text:
                continue
                
            # Skip if it's just a massive HTML table
            if len(text) > 5000 and ("<table" in text.lower() or "<td" in text.lower()):
                sanitized.append("[Table content removed due to size]")
                continue
                
            # Remove HTML tags
            clean_text = re.sub(r'<[^>]*>', ' ', text)
            
            # Remove multiple spaces
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()
            
            # Truncate if still too long
            if len(clean_text) > 1000:
                clean_text = clean_text[:997] + "..."
                
            sanitized.append(clean_text)
            
        return sanitized
    
    async def lookup_drug(self, drug_name: str, search_type: str = "general") -> Dict[str, Any]:
        """
        Look up drug information from the FDA database with caching
        
        Args:
            drug_name: Name of the drug to search for
            search_type: Type of information to retrieve: 'label', 'adverse_events', or 'general'
            
        Returns:
            Dictionary containing drug information or error details
        """
        # Input validation
        if not drug_name:
            return self._format_error_response("Drug name is required")
        
        # Normalize search type
        search_type = search_type.lower()
        if search_type not in ["label", "adverse_events", "general"]:
            search_type = "general"
        
        # Create cache key
        cache_key = self._get_cache_key("fda_drug", search_type, drug_name)
        
        # Check cache first
        cached_result = self.cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache hit for FDA drug lookup: {drug_name}, {search_type}")
            return cached_result
        
        # If not in cache, fetch from API
        try:
            logger.info(f"Fetching FDA drug information for {drug_name}, type: {search_type}")
            
            # Determine endpoint and query based on search type
            # Note: For adverse_events, we now use label data instead of event.json
            if search_type == "adverse_events":
                endpoint = f"{self.base_url}/label.json"
                query = f"openfda.generic_name:{drug_name} OR openfda.brand_name:{drug_name}"
            elif search_type == "label":
                endpoint = f"{self.base_url}/label.json"
                query = f"openfda.generic_name:{drug_name} OR openfda.brand_name:{drug_name}"
            else:  # general
                endpoint = f"{self.base_url}/ndc.json"
                query = f"generic_name:{drug_name} OR brand_name:{drug_name}"
            
            # Build API URL
            params = {
                "search": query,
                "limit": 1  # Reduced from 3 to 1 to limit response size
            }
            
            # Add API key if available
            if self.api_key:
                params["api_key"] = self.api_key
            
            # Make the request
            data = await self._make_request(endpoint, params=params)
            
            # Extract and sanitize key information
            extracted_data = self._extract_key_info(data, search_type)
            
            # Process the response
            result = self._format_success_response(
                drug_name=drug_name,
                results=extracted_data,
                total_results=data.get("meta", {}).get("results", {}).get("total", 0)
            )
            
            # Cache for 24 hours (86400 seconds)
            self.cache.set(cache_key, result, ttl=86400)
            
            return result
                
        except Exception as e:
            logger.error(f"Error fetching FDA drug information: {str(e)}")
            return self._format_error_response(f"Error fetching drug information: {str(e)}")
