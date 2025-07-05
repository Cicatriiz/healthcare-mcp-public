import os
import requests
import hashlib
import logging
from typing import Any, Dict, Optional, Union
from services.cache_service import CacheService

logger = logging.getLogger("healthcare-mcp")

class BaseTool:
    """Base class for all healthcare tools with common functionality"""
    
    def __init__(self, cache_db_path: str = "healthcare_cache.db", default_ttl: int = 3600):
        """
        Initialize the base tool with caching
        
        Args:
            cache_db_path: Path to the cache database
            default_ttl: Default time-to-live for cache entries in seconds
        """
        self.cache = CacheService(db_path=cache_db_path, ttl=default_ttl)
        self.api_key = None
        self.base_url = None
    
    def _get_cache_key(self, prefix: str, *args) -> str:
        """
        Generate a cache key from the prefix and arguments
        
        Args:
            prefix: Prefix for the cache key
            *args: Arguments to include in the cache key
        
        Returns:
            A hashed cache key
        """
        # Create a string from all arguments
        key_parts = [prefix]
        for arg in args:
            if arg is not None:
                key_parts.append(str(arg))
        
        # Join and hash
        cache_key = "_".join(key_parts)
        return hashlib.md5(cache_key.encode()).hexdigest()
    
    async def _make_request(self, 
                           url: str, 
                           method: str = "GET", 
                           params: Optional[Dict[str, Any]] = None, 
                           headers: Optional[Dict[str, str]] = None, 
                           data: Optional[Any] = None,
                           json_data: Optional[Dict[str, Any]] = None,
                           timeout: int = 30) -> Dict[str, Any]:
        """
        Make an HTTP request with error handling
        
        Args:
            url: URL to request
            method: HTTP method (GET, POST, etc.)
            params: URL parameters
            headers: HTTP headers
            data: Request body data
            json_data: JSON data for the request body
            timeout: Request timeout in seconds
            
        Returns:
            Response data as a dictionary
        """
        try:
            # Set up headers if not provided
            if headers is None:
                headers = {}
            # Add a default User-Agent if not present
            if 'User-Agent' not in headers:
                headers['User-Agent'] = 'healthcare-mcp/1.0 (Linux)'
            logger.debug(f"Making {method} request to {url} with params={params} headers={headers}")
            response = requests.request(
                method=method,
                url=url,
                params=params,
                headers=headers,
                data=data,
                json=json_data,
                timeout=timeout
            )
            logger.debug(f"FDA API response status: {response.status_code}")
            logger.debug(f"FDA API response body: {response.text}")
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Request error: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"FDA API error response: {e.response.text}")
            raise
    
    def _format_error_response(self, error_message: str) -> Dict[str, str]:
        """
        Format an error response
        
        Args:
            error_message: Error message
            
        Returns:
            Formatted error response
        """
        return {
            "status": "error",
            "error_message": error_message
        }
    
    def _format_success_response(self, **kwargs) -> Dict[str, Any]:
        """
        Format a success response
        
        Args:
            **kwargs: Key-value pairs to include in the response
            
        Returns:
            Formatted success response
        """
        response = {"status": "success"}
        response.update(kwargs)
        return response