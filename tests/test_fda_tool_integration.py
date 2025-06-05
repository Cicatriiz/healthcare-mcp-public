import os
import pytest
import json
from src.tools.fda_tool import FDATool
import asyncio

@pytest.mark.asyncio
async def test_lookup_drug_label_integration():
    """Integration test: fetch real label info for ibuprofen from FDA API"""
    tool = FDATool()
    
    # Clear cache to ensure fresh data
    cache_key = tool._get_cache_key('fda_drug', 'label', 'ibuprofen')
    tool.cache.delete(cache_key)
    
    # Fetch drug information
    result = await tool.lookup_drug("ibuprofen", "label")
    
    # Basic assertions
    assert result["status"] == "success"
    assert result["drug_name"].lower() == "ibuprofen"
    assert result["total_results"] >= 1
    
    # Check structure (dict instead of list)
    assert isinstance(result["results"], dict)
    
    # Check for expected keys in the results
    expected_keys = ["brand_names", "generic_names", "indications", "dosage", "warnings"]
    for key in expected_keys:
        assert key in result["results"], f"Missing expected key: {key}"
    
    # Verify "ibuprofen" appears in the generic names
    generic_names = [name.lower() for name in result["results"]["generic_names"]]
    assert any("ibuprofen" in name for name in generic_names)
    
    # Check response size is reasonable (not massive like before)
    response_size = len(json.dumps(result))
    assert response_size < 20000, f"Response size ({response_size} chars) is too large"
    
    print(f"Integration test passed with response size: {response_size} chars")
    print(f"Available fields: {list(result['results'].keys())}")
