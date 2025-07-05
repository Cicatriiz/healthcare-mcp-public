import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from tools.base_tool import BaseTool

logger = logging.getLogger("healthcare-mcp")

class PubMedTool(BaseTool):
    """Tool for searching medical literature in PubMed database"""
    
    def __init__(self, cache_db_path: str = "healthcare_cache.db"):
        """Initialize the PubMed tool with API key and base URL"""
        super().__init__(cache_db_path=cache_db_path)
        self.api_key = os.getenv("PUBMED_API_KEY", "")
        self.base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    
    async def search_literature(self, query: str, max_results: int = 5, date_range: str = "") -> Dict[str, Any]:
        """
        Search for medical literature in PubMed database with caching
        
        Args:
            query: Search query for medical literature
            max_results: Maximum number of results to return
            date_range: Limit to articles published within years (e.g. '5' for last 5 years)
            
        Returns:
            Dictionary containing search results or error details
        """
        # Input validation
        if not query:
            return self._format_error_response("Search query is required")
        
        # Validate max_results
        try:
            max_results = int(max_results)
            if max_results < 1:
                max_results = 5
            elif max_results > 100:
                max_results = 100  # Limit to reasonable number
        except (ValueError, TypeError):
            max_results = 5
        
        # Create cache key
        cache_key = self._get_cache_key("pubmed_search", query, max_results, date_range)
        
        # Check cache first
        cached_result = self.cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache hit for PubMed search: {query}")
            return cached_result
            
        try:
            logger.info(f"Searching PubMed for: {query}, max_results={max_results}, date_range={date_range}")
            
            # Process query with date range if provided
            processed_query = query
            if date_range:
                try:
                    years_back = int(date_range)
                    current_year = datetime.now().year
                    min_year = current_year - years_back
                    processed_query += f" AND {min_year}:{current_year}[pdat]"
                    logger.debug(f"Added date range filter: {min_year}-{current_year}")
                except ValueError:
                    # If date_range isn't a valid integer, just ignore it
                    logger.warning(f"Invalid date range: {date_range}, ignoring")
                    pass
            
            # Search PubMed to get article IDs
            search_params = {
                "db": "pubmed",
                "term": processed_query,
                "retmax": max_results,
                "format": "json"
            }
            
            # Add API key if available
            if self.api_key:
                search_params["api_key"] = self.api_key
            
            # Make the search request
            search_endpoint = f"{self.base_url}esearch.fcgi"
            search_data = await self._make_request(search_endpoint, params=search_params)
            
            # Extract article IDs and total count
            id_list = search_data.get("esearchresult", {}).get("idlist", [])
            total_results = int(search_data.get("esearchresult", {}).get("count", 0))
            
            # If we have results, fetch article details
            articles = []
            if id_list:
                # Prepare parameters for summary request
                summary_params = {
                    "db": "pubmed",
                    "id": ",".join(id_list),
                    "retmode": "json"
                }
                
                # Add API key if available
                if self.api_key:
                    summary_params["api_key"] = self.api_key
                
                # Make the summary request
                summary_endpoint = f"{self.base_url}esummary.fcgi"
                summary_data = await self._make_request(summary_endpoint, params=summary_params)
                
                # Process article data
                articles = await self._process_article_data(id_list, summary_data)
            
            # Create result object
            result = self._format_success_response(
                query=query,
                total_results=total_results,
                articles=articles
            )
            
            # Cache for 12 hours (43200 seconds)
            self.cache.set(cache_key, result, ttl=43200)
            
            return result
                
        except Exception as e:
            logger.error(f"Error searching PubMed: {str(e)}")
            return self._format_error_response(f"Error searching PubMed: {str(e)}")
    
    async def _process_article_data(self, id_list: List[str], summary_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Process article data from PubMed API response
        
        Args:
            id_list: List of article IDs
            summary_data: Summary data from PubMed API
            
        Returns:
            List of processed article data
        """
        articles = []
        
        # Get the result data
        result_data = summary_data.get("result", {})
        
        # Process each article
        for article_id in id_list:
            if article_id in result_data:
                article_data = result_data[article_id]
                
                # Extract authors
                authors = []
                if "authors" in article_data:
                    authors = [author.get("name", "") for author in article_data["authors"] if "name" in author]
                
                # Create article object
                article = {
                    "id": article_id,
                    "title": article_data.get("title", ""),
                    "authors": authors,
                    "journal": article_data.get("fulljournalname", ""),
                    "publication_date": article_data.get("pubdate", ""),
                    "abstract_url": f"https://pubmed.ncbi.nlm.nih.gov/{article_id}/",
                }
                
                # Add additional fields if available
                if "articleids" in article_data:
                    for id_obj in article_data["articleids"]:
                        if id_obj.get("idtype") == "doi":
                            article["doi"] = id_obj.get("value", "")
                
                articles.append(article)
        
        return articles
