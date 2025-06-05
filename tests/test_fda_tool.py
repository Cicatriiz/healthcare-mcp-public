import pytest
import os
import json
import tempfile
from unittest.mock import patch, MagicMock
from src.tools.fda_tool import FDATool

class TestFDATool:
    """Test suite for FDATool class"""
    
    @pytest.fixture
    def fda_tool(self):
        """Create an FDATool instance with a temporary cache database"""
        # Set up environment variable for testing
        os.environ["FDA_API_KEY"] = "test_api_key"
        
        # Create a tool with mocked cache
        tool = FDATool()
        
        # Mock the cache get and set methods
        tool.cache.get = MagicMock(return_value=None)
        tool.cache.set = MagicMock(return_value=True)
        tool.cache.delete = MagicMock(return_value=True)
        
        yield tool
        
        # Clean up
        if "FDA_API_KEY" in os.environ:
            del os.environ["FDA_API_KEY"]
    
    def test_init(self, fda_tool):
        """Test FDATool initialization"""
        assert fda_tool.api_key == "test_api_key"
        assert fda_tool.base_url == "https://api.fda.gov/drug"
        assert fda_tool.cache is not None
    
    @patch('src.tools.base_tool.BaseTool._make_request')
    async def test_lookup_drug_general(self, mock_request, fda_tool):
        """Test looking up general drug information"""
        # Mock response for general drug info
        mock_response = {
            "meta": {
                "results": {
                    "total": 1
                }
            },
            "results": [
                {
                    "generic_name": "ASPIRIN",
                    "brand_name": "BAYER",
                    "labeler_name": "Bayer Healthcare",
                    "product_type": "HUMAN PRESCRIPTION DRUG",
                    "route": ["ORAL"],
                    "marketing_status": "PRESCRIPTION"
                }
            ]
        }
        mock_request.return_value = mock_response
        
        # Test lookup
        result = await fda_tool.lookup_drug("aspirin", "general")
        
        # Verify result
        assert result["status"] == "success"
        assert result["drug_name"] == "aspirin"
        assert result["total_results"] == 1
        
        # Verify extracted data structure (dictionary instead of list)
        assert isinstance(result["results"], dict)
        assert result["results"]["generic_name"] == "ASPIRIN"
        assert result["results"]["brand_name"] == "BAYER"
        assert result["results"]["product_type"] == "HUMAN PRESCRIPTION DRUG"
        
        # Verify response size is reasonable
        result_size = len(json.dumps(result))
        assert result_size < 10000, f"Response size ({result_size}) is too large"
        
        # Verify API call
        mock_request.assert_called_once()
        args, kwargs = mock_request.call_args
        assert args[0] == "https://api.fda.gov/drug/ndc.json"
        assert kwargs["params"]["search"] == "generic_name:aspirin OR brand_name:aspirin"
        assert kwargs["params"]["limit"] == 1  # Updated from 3 to 1
        assert kwargs["params"]["api_key"] == "test_api_key"
    
    @patch('src.tools.base_tool.BaseTool._make_request')
    async def test_lookup_drug_label(self, mock_request, fda_tool):
        """Test looking up drug label information"""
        # Mock response for label info
        mock_response = {
            "meta": {
                "results": {
                    "total": 1
                }
            },
            "results": [
                {
                    "openfda": {
                        "generic_name": ["ASPIRIN"],
                        "brand_name": ["BAYER"],
                        "manufacturer_name": ["Bayer Healthcare"]
                    },
                    "indications_and_usage": ["Pain relief"],
                    "dosage_and_administration": ["Take as directed"],
                    "warnings_and_cautions": ["May cause stomach bleeding"],
                    "contraindications": ["Not for children"],
                    "adverse_reactions": ["<table>Very long HTML content</table>Nausea, headache"],
                    "drug_interactions": ["Interacts with blood thinners"],
                    "pregnancy": ["Consult doctor"]
                }
            ]
        }
        mock_request.return_value = mock_response
        
        # Test lookup
        result = await fda_tool.lookup_drug("aspirin", "label")
        
        # Verify result
        assert result["status"] == "success"
        assert result["drug_name"] == "aspirin"
        assert result["total_results"] == 1
        
        # Verify extracted data structure (dictionary instead of list)
        assert isinstance(result["results"], dict)
        assert "brand_names" in result["results"]
        assert "generic_names" in result["results"]
        assert "indications" in result["results"]
        assert "dosage" in result["results"]
        assert "warnings" in result["results"]
        assert "adverse_reactions" in result["results"]
        
        # Verify content extraction
        assert "ASPIRIN" in result["results"]["generic_names"]
        assert "BAYER" in result["results"]["brand_names"]
        assert "Bayer Healthcare" in result["results"]["manufacturer"]
        
        # Verify HTML sanitization
        assert "<table>" not in str(result["results"]["adverse_reactions"])
        assert "Nausea, headache" in str(result["results"]["adverse_reactions"])
        
        # Verify response size is reasonable
        result_size = len(json.dumps(result))
        assert result_size < 10000, f"Response size ({result_size}) is too large"
        
        # Verify API call
        mock_request.assert_called_once()
        args, kwargs = mock_request.call_args
        assert args[0] == "https://api.fda.gov/drug/label.json"
        assert kwargs["params"]["search"] == "openfda.generic_name:aspirin OR openfda.brand_name:aspirin"
        assert kwargs["params"]["limit"] == 1
    
    @patch('src.tools.base_tool.BaseTool._make_request')
    async def test_lookup_drug_adverse_events(self, mock_request, fda_tool):
        """Test looking up drug adverse events"""
        # Mock response for adverse events (now using label endpoint)
        mock_response = {
            "meta": {
                "results": {
                    "total": 1
                }
            },
            "results": [
                {
                    "openfda": {
                        "generic_name": ["ASPIRIN"],
                        "brand_name": ["BAYER"]
                    },
                    "adverse_reactions": ["Nausea, headache, dizziness"],
                    "warnings_and_cautions": ["May cause stomach bleeding"],
                    "boxed_warning": ["Serious cardiovascular risks"]
                }
            ]
        }
        mock_request.return_value = mock_response
        
        # Test lookup
        result = await fda_tool.lookup_drug("aspirin", "adverse_events")
        
        # Verify result
        assert result["status"] == "success"
        assert result["drug_name"] == "aspirin"
        assert result["total_results"] == 1
        
        # Verify extracted data structure (dictionary instead of list)
        assert isinstance(result["results"], dict)
        assert "brand_names" in result["results"]
        assert "generic_names" in result["results"]
        assert "adverse_reactions" in result["results"]
        assert "warnings" in result["results"]
        assert "boxed_warning" in result["results"]
        
        # Verify content extraction
        assert "ASPIRIN" in result["results"]["generic_names"]
        assert "BAYER" in result["results"]["brand_names"]
        assert "Nausea" in str(result["results"]["adverse_reactions"])
        
        # Verify response size is reasonable
        result_size = len(json.dumps(result))
        assert result_size < 10000, f"Response size ({result_size}) is too large"
        
        # Verify API call - now using label endpoint for adverse events
        mock_request.assert_called_once()
        args, kwargs = mock_request.call_args
        assert args[0] == "https://api.fda.gov/drug/label.json"
        assert kwargs["params"]["search"] == "openfda.generic_name:aspirin OR openfda.brand_name:aspirin"
    
    @patch('src.tools.base_tool.BaseTool._make_request')
    async def test_lookup_drug_invalid_type(self, mock_request, fda_tool):
        """Test looking up drug with invalid search type"""
        # Mock response
        mock_response = {
            "meta": {
                "results": {
                    "total": 1
                }
            },
            "results": [{
                "generic_name": "ASPIRIN",
                "brand_name": "BAYER",
                "product_type": "HUMAN PRESCRIPTION DRUG"
            }]
        }
        mock_request.return_value = mock_response
        
        # Test lookup with invalid type (should default to general)
        result = await fda_tool.lookup_drug("aspirin", "invalid_type")
        
        # Verify result
        assert result["status"] == "success"
        
        # Verify API call used general endpoint
        mock_request.assert_called_once()
        args, kwargs = mock_request.call_args
        assert args[0] == "https://api.fda.gov/drug/ndc.json"
    
    async def test_lookup_drug_empty_name(self, fda_tool):
        """Test looking up drug with empty name"""
        result = await fda_tool.lookup_drug("")
        
        # Verify error response
        assert result["status"] == "error"
        assert "Drug name is required" in result["error_message"]
    
    @patch('src.tools.base_tool.BaseTool._make_request')
    async def test_lookup_drug_api_error(self, mock_request, fda_tool):
        """Test handling API errors"""
        # Mock API error
        mock_request.side_effect = Exception("API connection error")
        
        # Test lookup
        result = await fda_tool.lookup_drug("aspirin")
        
        # Verify error response
        assert result["status"] == "error"
        assert "Error fetching drug information" in result["error_message"]
    
    @patch('src.tools.base_tool.BaseTool._make_request')
    async def test_lookup_drug_caching(self, mock_request, fda_tool):
        """Test caching functionality"""
        # Mock response
        mock_response = {
            "meta": {
                "results": {
                    "total": 1
                }
            },
            "results": [{
                "generic_name": "ASPIRIN",
                "brand_name": "BAYER",
                "product_type": "HUMAN PRESCRIPTION DRUG"
            }]
        }
        mock_request.return_value = mock_response
        
        # Setup cache behavior
        cache_data = {}
        
        def mock_cache_get(key):
            return cache_data.get(key)
            
        def mock_cache_set(key, value, ttl=None):
            cache_data[key] = value
            return True
            
        fda_tool.cache.get.side_effect = mock_cache_get
        fda_tool.cache.set.side_effect = mock_cache_set
        
        # First call should hit the API
        result1 = await fda_tool.lookup_drug("aspirin")
        assert result1["status"] == "success"
        assert mock_request.call_count == 1
        
        # Second call should use cache
        result2 = await fda_tool.lookup_drug("aspirin")
        assert result2["status"] == "success"
        assert mock_request.call_count == 1  # Still 1, not 2
        
        # Different drug should hit API again
        result3 = await fda_tool.lookup_drug("ibuprofen")
        assert result3["status"] == "success"
        assert mock_request.call_count == 2
        
    @patch('src.tools.base_tool.BaseTool._make_request')
    async def test_sanitize_text(self, mock_request, fda_tool):
        """Test text sanitization functionality"""
        # Create a large HTML table that will trigger the size threshold (>5000 chars)
        large_table = "<table styleCode='Botrule Lrule Rrule Toprule'>"
        # Add a header row
        large_table += "<tr><th>Adverse Reaction</th><th>Placebo (N=1000)</th><th>Drug (N=1000)</th></tr>"
        # Add many rows to make it exceed 5000 chars
        for i in range(200):  # This will create a very large table
            large_table += f"<tr><td>Adverse Effect {i}</td><td>{i}%</td><td>{i*2}%</td></tr>"
        large_table += "</table>"
        
        # Verify the table is actually large enough
        assert len(large_table) > 5000, f"Test table size ({len(large_table)}) should be >5000 chars"
        
        # Mock response with problematic HTML content
        mock_response = {
            "meta": {
                "results": {
                    "total": 1
                }
            },
            "results": [
                {
                    "openfda": {
                        "generic_name": ["FLUOXETINE"],
                        "brand_name": ["PROZAC"]
                    },
                    "adverse_reactions": [
                        large_table,  # Large table that should be replaced
                        "<p>Common adverse reactions include: <b>headache</b>, <i>nausea</i>, insomnia.</p>",  # HTML that should be cleaned
                        "Some patients may experience " + "very long text " * 200  # Long text that should be truncated
                    ],
                    "indications_and_usage": ["<p>For the treatment of <b>depression</b> and <i>anxiety</i></p>"]
                }
            ]
        }
        mock_request.return_value = mock_response
        
        # Test lookup
        result = await fda_tool.lookup_drug("fluoxetine", "label")
        
        # Verify HTML tags are removed from regular content
        assert "<p>" not in str(result["results"]["indications"])
        assert "<b>" not in str(result["results"]["indications"])
        assert "depression" in str(result["results"]["indications"])
        
        # Verify HTML tags are removed from adverse reactions
        for text in result["results"]["adverse_reactions"]:
            if "headache" in text:
                assert "<b>" not in text
                assert "<p>" not in text
                assert "<i>" not in text
        
        # Verify long text is truncated
        for text in result["results"]["adverse_reactions"]:
            assert len(text) <= 1000, f"Text not truncated properly: {len(text)} chars"
            
        # Verify table content is properly handled with replacement text
        table_replacement_found = False
        for text in result["results"]["adverse_reactions"]:
            if "[Table content removed due to size]" in text:
                table_replacement_found = True
                break
        assert table_replacement_found, "Table replacement text not found"
