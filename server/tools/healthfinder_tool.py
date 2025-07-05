import os
import logging
from typing import Dict, Any, List, Optional
from tools.base_tool import BaseTool

logger = logging.getLogger("healthcare-mcp")

class HealthFinderTool(BaseTool):
    """Tool for accessing health information from Health.gov"""
    
    def __init__(self):
        """Initialize the HealthFinder tool with base URL and HTTP client"""
        super().__init__(cache_db_path="healthcare_cache.db")
        self.base_url = "https://health.gov/myhealthfinder/api/v3"
        # Initialize http_client
        import requests
        self.http_client = requests
    
    async def get_health_topics(self, topic: str, language: str = "en") -> Dict[str, Any]:
        """
        Get evidence-based health information on various topics with caching
        
        Args:
            topic: Health topic to search for information
            language: Language for content (en or es)
            
        Returns:
            Dictionary containing health information or error details
        """
        # Input validation
        if not topic:
            return self._format_error_response("Topic is required")
        
        # Validate language
        language = language.lower()
        if language not in ["en", "es"]:
            language = "en"  # Default to English
        
        # Create cache key
        cache_key = self._get_cache_key("health_topics", topic, language)
        
        # Check cache first
        cached_result = self.cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache hit for health topics: {topic}, language={language}")
            return cached_result
            
        try:
            logger.info(f"Fetching health information for topic: {topic}, language={language}")
            
            # Construct the API URL
            endpoint = f"{self.base_url}/topicsearch.json"
            params = {
                "keyword": topic,
                "lang": language
            }
            
            # Make the API request using the base tool's _make_request method
            data = await self._make_request(
                url=endpoint,
                method="GET",
                params=params
            )
            
            # Parse the response
            result_data = data.get("Result", {})
            
            # Extract topics from the response
            topics = await self._extract_topics(result_data)
            
            # Create result object
            result = self._format_success_response(
                search_term=topic,
                language=language,
                total_results=result_data.get("Total", 0) if isinstance(result_data, dict) else 0,
                topics=topics
            )
            
            # Cache for 1 week (604800 seconds) since health information doesn't change often
            self.cache.set(cache_key, result, ttl=604800)
            
            return result
                
        except Exception as e:
            logger.error(f"Error fetching health information: {str(e)}")
            return self._format_error_response(f"Error fetching health information: {str(e)}")
    
    async def _extract_topics(self, result_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract topics from Health.gov API response
        
        Args:
            result_data: Result data from Health.gov API
            
        Returns:
            List of processed topic data
        """
        topics = []
        resources = result_data.get("Resources", {})
        
        # Check if Resources is a dictionary
        if not isinstance(resources, dict):
            logger.warning("Resources is not a dictionary")
            return topics
        
        resource_list = resources.get("Resource", [])
        
        # Check if Resource is a list
        if not isinstance(resource_list, list):
            resource_list = [resource_list] if resource_list else []
        
        # Process each resource
        for resource in resource_list:
            # Make sure resource is a dictionary
            if not isinstance(resource, dict):
                continue
            
            # Extract topic data
            topic = {
                "title": resource.get("Title", ""),
                "url": resource.get("AccessibleVersion", ""),
                "last_updated": resource.get("LastUpdate", ""),
                "section": resource.get("Section", ""),
                "description": ""
            }
            
            # Extract description from categories
            categories = resource.get("Categories", {})
            if isinstance(categories, dict):
                category_list = categories.get("Category", [])
                if not isinstance(category_list, list):
                    category_list = [category_list] if category_list else []
                
                if category_list and isinstance(category_list[0], dict):
                    topic["description"] = category_list[0].get("Title", "")
            
            # Add content if available
            if "Sections" in resource and isinstance(resource["Sections"], dict):
                sections = resource["Sections"].get("Section", [])
                if not isinstance(sections, list):
                    sections = [sections] if sections else []
                
                content = []
                for section in sections:
                    if isinstance(section, dict) and "Content" in section:
                        content.append(section["Content"])
                
                if content:
                    topic["content"] = content
            
            topics.append(topic)
        
        return topics
