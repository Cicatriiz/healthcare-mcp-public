"""
Dependency injection module for FastAPI
"""
import logging
from typing import AsyncGenerator, Optional
from fastapi import Depends

from src.services.cache_service import CacheService
from src.services.usage_service import UsageService
from src.tools.fda_tool import FDATool
from src.tools.pubmed_tool import PubMedTool
from src.tools.healthfinder_tool import HealthFinderTool
from src.tools.clinical_trials_tool import ClinicalTrialsTool
from src.tools.medical_terminology_tool import MedicalTerminologyTool

logger = logging.getLogger("healthcare-mcp")

# Singleton instances
_cache_service: Optional[CacheService] = None
_usage_service: Optional[UsageService] = None

# Tool instances
_fda_tool: Optional[FDATool] = None
_pubmed_tool: Optional[PubMedTool] = None
_healthfinder_tool: Optional[HealthFinderTool] = None
_clinical_trials_tool: Optional[ClinicalTrialsTool] = None
_medical_terminology_tool: Optional[MedicalTerminologyTool] = None

async def get_cache_service() -> AsyncGenerator[CacheService, None]:
    """
    Get or create the cache service instance
    
    Returns:
        CacheService: The cache service instance
    """
    global _cache_service
    
    if _cache_service is None:
        logger.info("Initializing cache service")
        _cache_service = CacheService()
        await _cache_service.init()
    
    try:
        yield _cache_service
    except Exception as e:
        logger.error(f"Error with cache service: {str(e)}")
        raise

async def get_usage_service() -> AsyncGenerator[UsageService, None]:
    """
    Get or create the usage service instance
    
    Returns:
        UsageService: The usage service instance
    """
    global _usage_service
    
    if _usage_service is None:
        logger.info("Initializing usage service")
        _usage_service = UsageService()
        await _usage_service.init()
    
    try:
        yield _usage_service
    except Exception as e:
        logger.error(f"Error with usage service: {str(e)}")
        raise

async def get_fda_tool() -> AsyncGenerator[FDATool, None]:
    """
    Get or create the FDA tool instance
    
    Returns:
        FDATool: The FDA tool instance
    """
    global _fda_tool
    
    if _fda_tool is None:
        logger.info("Initializing FDA tool")
        _fda_tool = FDATool()
    
    try:
        yield _fda_tool
    except Exception as e:
        logger.error(f"Error with FDA tool: {str(e)}")
        raise

async def get_pubmed_tool() -> AsyncGenerator[PubMedTool, None]:
    """
    Get or create the PubMed tool instance
    
    Returns:
        PubMedTool: The PubMed tool instance
    """
    global _pubmed_tool
    
    if _pubmed_tool is None:
        logger.info("Initializing PubMed tool")
        _pubmed_tool = PubMedTool()
    
    try:
        yield _pubmed_tool
    except Exception as e:
        logger.error(f"Error with PubMed tool: {str(e)}")
        raise

async def get_healthfinder_tool() -> AsyncGenerator[HealthFinderTool, None]:
    """
    Get or create the HealthFinder tool instance
    
    Returns:
        HealthFinderTool: The HealthFinder tool instance
    """
    global _healthfinder_tool
    
    if _healthfinder_tool is None:
        logger.info("Initializing HealthFinder tool")
        _healthfinder_tool = HealthFinderTool()
    
    try:
        yield _healthfinder_tool
    except Exception as e:
        logger.error(f"Error with HealthFinder tool: {str(e)}")
        raise

async def get_clinical_trials_tool() -> AsyncGenerator[ClinicalTrialsTool, None]:
    """
    Get or create the ClinicalTrials tool instance
    
    Returns:
        ClinicalTrialsTool: The ClinicalTrials tool instance
    """
    global _clinical_trials_tool
    
    if _clinical_trials_tool is None:
        logger.info("Initializing ClinicalTrials tool")
        _clinical_trials_tool = ClinicalTrialsTool()
    
    try:
        yield _clinical_trials_tool
    except Exception as e:
        logger.error(f"Error with ClinicalTrials tool: {str(e)}")
        raise

async def get_medical_terminology_tool() -> AsyncGenerator[MedicalTerminologyTool, None]:
    """
    Get or create the MedicalTerminology tool instance
    
    Returns:
        MedicalTerminologyTool: The MedicalTerminology tool instance
    """
    global _medical_terminology_tool
    
    if _medical_terminology_tool is None:
        logger.info("Initializing MedicalTerminology tool")
        _medical_terminology_tool = MedicalTerminologyTool()
    
    try:
        yield _medical_terminology_tool
    except Exception as e:
        logger.error(f"Error with MedicalTerminology tool: {str(e)}")
        raise