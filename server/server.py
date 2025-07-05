import os
import logging
import structlog
from contextlib import asynccontextmanager
from typing import Optional, Union, Dict, Any, List, Annotated
from fastapi import FastAPI, Request, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from src.main import mcp
from src.tools.base_tool import BaseTool
from src.dependencies import (
    get_cache_service, 
    get_usage_service, 
    get_fda_tool, 
    get_pubmed_tool, 
    get_healthfinder_tool, 
    get_clinical_trials_tool, 
    get_medical_terminology_tool
)

# Set up structured logging
logging.basicConfig(level=logging.DEBUG)
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)
logger = structlog.get_logger("healthcare-mcp")

# Load environment variables
load_dotenv()

# Add lifespan event handlers
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup: Initialize services
    logger.info("Starting Healthcare MCP Server")
    
    # Initialize services if needed
    try:
        from src.services.cache_service import CacheService
        cache = CacheService()
        await cache.init()
        logger.info("Cache service initialized")
    except Exception as e:
        logger.error("Failed to initialize cache service", error=str(e))
    
    try:
        from src.services.usage_service import UsageService
        usage = UsageService()
        await usage.init()
        logger.info("Usage service initialized")
    except Exception as e:
        logger.error("Failed to initialize usage service", error=str(e))
    
    yield  # Server is running
    
    # Shutdown: Clean up resources
    logger.info("Shutting down Healthcare MCP Server")
    
    # Close the shared HTTP client
    try:
        from src.tools.base_tool import BaseTool
        await BaseTool.close_http_client()
        logger.info("HTTP client closed")
    except Exception as e:
        logger.error("Failed to close HTTP client", error=str(e))
    
    # Close services
    try:
        from src.services.cache_service import CacheService
        cache = CacheService()
        await cache.close()
        logger.info("Cache service closed")
    except Exception as e:
        logger.error("Failed to close cache service", error=str(e))
        
    try:
        from src.services.usage_service import UsageService
        usage = UsageService()
        await usage.close()
        logger.info("Usage service closed")
    except Exception as e:
        logger.error("Failed to close usage service", error=str(e))

# Set up rate limiter
limiter = Limiter(key_func=get_remote_address)

# Create FastAPI app with lifespan
app = FastAPI(
    title="Healthcare MCP API",
    description="Healthcare MCP server for medical information access",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Add rate limiter to app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Add OpenTelemetry instrumentation if enabled
if os.getenv("ENABLE_TELEMETRY", "false").lower() == "true":
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor.instrument_app(app)
        logger.info("OpenTelemetry instrumentation enabled")
    except ImportError:
        logger.warning("OpenTelemetry packages not installed, skipping instrumentation")

# Import necessary components for request handling
from fastapi import Body, Query, Path, BackgroundTasks
from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, Any, Optional, List, Union, Annotated

# Define tool request model
class ToolRequest(BaseModel):
    """Request model for tool execution"""
    model_config = ConfigDict(extra="forbid")
    
    name: str = Field(..., description="Name of the tool to execute")
    arguments: Dict[str, Any] = Field(..., description="Arguments to pass to the tool")
    session_id: Optional[str] = Field(None, description="Session ID for tracking usage")

# Define error response model
class ErrorResponse(BaseModel):
    """Standard error response"""
    model_config = ConfigDict(frozen=True)
    
    status: str = Field("error", description="Status of the response")
    error_message: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Error code for categorization")
    
# Define success response model
class SuccessResponse(BaseModel):
    """Base success response"""
    model_config = ConfigDict(extra="allow")
    
    status: str = Field("success", description="Status of the response")

# Mount SSE endpoint (but don't mount it at the same path as other APIs)
app.mount("/mcp/sse", mcp.sse_app())

# Define API endpoints for each tool
@app.get("/api/fda",
          summary="Look up drug information from the FDA database",
          description="Search for drug information in the FDA database by drug name and search type",
          response_model=Union[SuccessResponse, ErrorResponse],
          tags=["Drug Information"])
@limiter.limit("60/minute")
async def api_fda_drug_lookup(
    request: Request,
    drug_name: Annotated[str, Query(description="Name of the drug to search for")],
    search_type: Annotated[str, Query(description="Type of information to retrieve: 'label', 'adverse_events', or 'general'")] = "general",
    session_id: Annotated[Optional[str], Header(description="Session ID for tracking usage")] = None
):
    """
    Look up drug information from the FDA database
    
    - **drug_name**: Name of the drug to search for
    - **search_type**: Type of information to retrieve: 'label', 'adverse_events', or 'general'
    - **session_id**: Optional session ID for tracking usage
    """
    try:
        from src.main import fda_drug_lookup
        logger.info("FDA drug lookup request", drug_name=drug_name, search_type=search_type, session_id=session_id)
        return await fda_drug_lookup(session_id, drug_name, search_type)
    except Exception as e:
        logger.error("Error in FDA drug lookup", error=str(e), drug_name=drug_name)
        return ErrorResponse(error_message=f"Error looking up drug information: {str(e)}")

@app.get("/api/pubmed",
          summary="Search for medical literature in PubMed database",
          description="Search for medical literature in PubMed database by query, with options for max results and date range",
          response_model=Union[SuccessResponse, ErrorResponse],
          tags=["Medical Literature"])
@limiter.limit("30/minute")
async def api_pubmed_search(
    request: Request,
    query: Annotated[str, Query(description="Search query for medical literature")],
    max_results: Annotated[int, Query(description="Maximum number of results to return", ge=1, le=50)] = 5,
    date_range: Annotated[str, Query(description="Limit to articles published within years (e.g. '5' for last 5 years)")] = "",
    session_id: Annotated[Optional[str], Header(description="Session ID for tracking usage")] = None
):
    """
    Search for medical literature in PubMed database
    
    - **query**: Search query for medical literature
    - **max_results**: Maximum number of results to return (1-50)
    - **date_range**: Limit to articles published within years (e.g. '5' for last 5 years)
    - **session_id**: Optional session ID for tracking usage
    """
    try:
        from src.main import pubmed_search
        logger.info("PubMed search request", query=query, max_results=max_results, date_range=date_range, session_id=session_id)
        return await pubmed_search(session_id, query, max_results, date_range)
    except Exception as e:
        logger.error("Error in PubMed search", error=str(e), query=query)
        return ErrorResponse(error_message=f"Error searching PubMed: {str(e)}")

@app.get("/api/health_finder",
          summary="Get evidence-based health information on various topics",
          description="Access evidence-based health information from Health.gov",
          response_model=Union[SuccessResponse, ErrorResponse],
          tags=["Health Information"])
@limiter.limit("60/minute")
async def api_health_topics(
    request: Request,
    topic: Annotated[str, Query(description="Health topic to search for information")],
    language: Annotated[str, Query(description="Language for content (en or es)")] = "en",
    session_id: Annotated[Optional[str], Header(description="Session ID for tracking usage")] = None
):
    """
    Get evidence-based health information on various topics
    
    - **topic**: Health topic to search for information
    - **language**: Language for content (en or es)
    - **session_id**: Optional session ID for tracking usage
    """
    try:
        from src.main import health_topics
        logger.info("Health topics request", topic=topic, language=language, session_id=session_id)
        return await health_topics(session_id, topic, language)
    except Exception as e:
        logger.error("Error in health topics", error=str(e), topic=topic)
        return ErrorResponse(error_message=f"Error fetching health information: {str(e)}")

@app.get("/api/clinical_trials",
          summary="Search for clinical trials by condition and status",
          description="Search for clinical trials by medical condition, status, and other parameters",
          response_model=Union[SuccessResponse, ErrorResponse],
          tags=["Clinical Trials"])
@limiter.limit("30/minute")
async def api_clinical_trials(
    request: Request,
    condition: Annotated[str, Query(description="Medical condition or disease to search for")],
    status: Annotated[str, Query(description="Trial status (recruiting, completed, active, not_recruiting, or all)")] = "recruiting",
    max_results: Annotated[int, Query(description="Maximum number of results to return", ge=1, le=100)] = 10,
    session_id: Annotated[Optional[str], Header(description="Session ID for tracking usage")] = None,
    clinical_trials_tool = Depends(get_clinical_trials_tool),
    usage_service = Depends(get_usage_service)
):
    """
    Search for clinical trials by condition, status, and other parameters
    
    - **condition**: Medical condition or disease to search for
    - **status**: Trial status (recruiting, completed, active, not_recruiting, or all)
    - **max_results**: Maximum number of results to return (1-100)
    - **session_id**: Optional session ID for tracking usage
    """
    try:
        logger.info("Clinical trials search request", 
                   condition=condition, 
                   status=status, 
                   max_results=max_results,
                   session_id=session_id)
        
        # Track usage
        if session_id:
            await usage_service.track_usage(session_id, "clinical_trials_search", {
                "condition": condition,
                "status": status,
                "max_results": max_results
            })
        
        # Call the tool directly
        result = await clinical_trials_tool.search_trials(condition, status, max_results)
        return result
    except Exception as e:
        logger.error("Error in clinical trials search", error=str(e), condition=condition)
        return ErrorResponse(error_message=f"Error searching clinical trials: {str(e)}")

@app.get("/api/medical_terminology",
          summary="Look up ICD-10 codes by code or description",
          description="Look up ICD-10 codes and medical terminology definitions",
          response_model=Union[SuccessResponse, ErrorResponse],
          tags=["Medical Terminology"])
@limiter.limit("60/minute")
async def api_lookup_icd_code(
    request: Request,
    code: Annotated[Optional[str], Query(description="ICD-10 code to look up (optional if description is provided)")] = None,
    description: Annotated[Optional[str], Query(description="Medical condition description to search for (optional if code is provided)")] = None,
    max_results: Annotated[int, Query(description="Maximum number of results to return", ge=1, le=50)] = 10,
    session_id: Annotated[Optional[str], Header(description="Session ID for tracking usage")] = None
):
    """
    Look up ICD-10 codes by code or description
    
    - **code**: ICD-10 code to look up (optional if description is provided)
    - **description**: Medical condition description to search for (optional if code is provided)
    - **max_results**: Maximum number of results to return (1-50)
    - **session_id**: Optional session ID for tracking usage
    """
    try:
        from src.main import lookup_icd_code
        logger.info("ICD code lookup request", 
                   code=code, 
                   description=description, 
                   max_results=max_results,
                   session_id=session_id)
        return await lookup_icd_code(session_id, code, description, max_results)
    except Exception as e:
        logger.error("Error in ICD code lookup", error=str(e), code=code, description=description)
        return ErrorResponse(error_message=f"Error looking up ICD-10 code: {str(e)}")

@app.get("/api/usage_stats",
         summary="Get usage statistics for the current session",
         description="Get a summary of API usage for the current session",
         response_model=Union[SuccessResponse, ErrorResponse],
         tags=["Monitoring"])
@limiter.limit("120/minute")
async def api_usage_stats(
    request: Request,
    session_id: Annotated[Optional[str], Query(description="Session ID to get usage statistics for")] = None
):
    """
    Get usage statistics for the current session
    
    - **session_id**: Session ID to get usage statistics for (optional)
    
    Returns a summary of API usage for the specified session or all sessions if no session ID is provided
    """
    try:
        from src.main import get_usage_stats
        logger.info("Usage stats request", session_id=session_id)
        return await get_usage_stats(session_id)
    except Exception as e:
        logger.error("Error in usage stats", error=str(e), session_id=session_id)
        return ErrorResponse(error_message=f"Error getting usage statistics: {str(e)}")

@app.get("/api/all_usage_stats",
         summary="Get overall usage statistics",
         description="Get a summary of API usage across all sessions",
         response_model=Union[SuccessResponse, ErrorResponse],
         tags=["Monitoring"])
@limiter.limit("30/minute")
async def api_all_usage_stats(
    request: Request,
    days: Annotated[int, Query(description="Number of days to include in the statistics", ge=1, le=365)] = 30
):
    """
    Get overall usage statistics
    
    - **days**: Number of days to include in the statistics (1-365, default: 30)
    
    Returns a summary of API usage across all sessions for the specified time period
    """
    try:
        from src.main import get_all_usage_stats
        logger.info("All usage stats request", days=days)
        return await get_all_usage_stats(None, days=days)
    except Exception as e:
        logger.error("Error in all usage stats", error=str(e))
        return ErrorResponse(error_message=f"Error getting all usage statistics: {str(e)}")

# Add the specific call-tool endpoint
@app.post("/mcp/call-tool",
          summary="Call a specific tool by name",
          description="Generic endpoint to call any tool by name with arguments",
          response_model=Union[SuccessResponse, ErrorResponse],
          tags=["Tool Execution"])
@limiter.limit("60/minute")
async def call_tool(
    request: Request,
    tool_request: ToolRequest = Body(...),
):
    """
    Call a specific tool by name
    
    - **name**: Name of the tool to call
    - **arguments**: Arguments to pass to the tool
    - **session_id**: Optional session ID for tracking usage
    """
    try:
        from src.main import fda_drug_lookup, pubmed_search, health_topics, clinical_trials_search, lookup_icd_code, get_usage_stats, get_all_usage_stats
        
        tool_name = tool_request.name
        arguments = tool_request.arguments
        session_id = tool_request.session_id
        
        logger.info("Tool call request", 
                   tool_name=tool_name, 
                   session_id=session_id)
        
        # Map tool names to their corresponding functions
        tool_mapping = {
            "fda_drug_lookup": lambda args: fda_drug_lookup(session_id, **args),
            "pubmed_search": lambda args: pubmed_search(session_id, **args),
            "health_topics": lambda args: health_topics(session_id, **args),
            "clinical_trials_search": lambda args: clinical_trials_search(session_id, **args),
            "lookup_icd_code": lambda args: lookup_icd_code(session_id, **args),
            "get_usage_stats": lambda _: get_usage_stats(session_id),
            "get_all_usage_stats": lambda args: get_all_usage_stats(session_id, **args)
        }
        
        if tool_name not in tool_mapping:
            logger.warning("Tool not found", tool_name=tool_name)
            return ErrorResponse(
                error_message=f"Tool '{tool_name}' not found",
                error_code="TOOL_NOT_FOUND"
            )
        
        # Call the appropriate tool function
        result = await tool_mapping[tool_name](arguments)
        return result
    except Exception as e:
        logger.error("Error in tool call", error=str(e), tool_name=tool_request.name)
        return ErrorResponse(
            error_message=f"Error calling tool: {str(e)}",
            error_code="TOOL_EXECUTION_ERROR"
        )

# Health check endpoint
@app.get("/health",
         summary="Health check endpoint",
         description="Check if the server is running properly",
         tags=["Monitoring"])
@limiter.limit("300/minute")
async def health_check(request: Request):
    """
    Health check endpoint
    
    Returns the status and version of the server along with service health information
    """
    logger.info("Health check request")
    
    # Check if cache service is available
    cache_status = "ok"
    try:
        from src.services.cache_service import CacheService
        cache = CacheService()
        await cache.init()
        # Just check if we can access the cache
        cache_stats = await cache.get_stats()
        await cache.close()
        if isinstance(cache_stats, dict) and "error" in cache_stats:
            cache_status = f"error: {cache_stats['error']}"
    except Exception as e:
        cache_status = f"error: {str(e)}"
    
    # Check if usage service is available
    usage_status = "ok"
    try:
        from src.services.usage_service import UsageService
        usage = UsageService()
        await usage.init()
        # Just check if we can access the usage stats
        usage_stats = await usage.get_usage_stats()
        await usage.close()
        if isinstance(usage_stats, dict) and "error" in usage_stats:
            usage_status = f"error: {usage_stats['error']}"
    except Exception as e:
        usage_status = f"error: {str(e)}"
    
    # Get current timestamp in ISO format
    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).isoformat()
    
    return {
        "status": "healthy", 
        "version": "1.0.0",
        "timestamp": timestamp,
        "services": {
            "cache": cache_status,
            "usage": usage_status
        }
    }

# Redirect root to docs
@app.get("/",
         summary="Redirect to API documentation",
         description="Redirects to the Swagger UI documentation",
         tags=["Documentation"])
@limiter.limit("300/minute")
async def redirect_to_docs(request: Request):
    """
    Redirect to API documentation
    
    Redirects to the Swagger UI documentation
    """
    from fastapi.responses import RedirectResponse
    logger.info("Root request, redirecting to docs")
    return RedirectResponse(url="/docs")

# Information about premium version
@app.get("/premium-info",
         summary="Get information about the premium version",
         description="Get information about the premium version of the Healthcare MCP Server",
         response_model=SuccessResponse,
         tags=["Documentation"])
@limiter.limit("120/minute")
async def premium_info(request: Request):
    """
    Get information about the premium version
    
    Returns information about the premium version of the Healthcare MCP Server including features, 
    pricing, and contact information
    """
    logger.info("Premium info request")
    return {
        "status": "success",
        "message": "This is the free version of Healthcare MCP Server.",
        "premium_url": "https://healthcaremcp.com",
        "features": [
            "Unlimited API calls (500 requests per minute)",
            "Advanced healthcare data tools (SNOMED CT, RxNorm, LOINC)",
            "Custom integrations with EHR systems",
            "Priority support with 24/7 availability",
            "Advanced analytics and usage reporting",
            "Private deployment options"
        ],
        "pricing": {
            "basic": "$99/month",
            "professional": "$299/month",
            "enterprise": "Contact for pricing"
        },
        "contact": "premium@healthcaremcp.com"
    }

# End of API endpoints

if __name__ == "__main__":
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser(description='Healthcare MCP Server')
    parser.add_argument('--port', type=int, default=int(os.getenv("PORT", "8000")), help='Port to run the server on')
    parser.add_argument('--host', type=str, default="0.0.0.0", help='Host to run the server on')
    args = parser.parse_args()
    port = args.port
    logger.info("Starting server", port=port)
    uvicorn.run(app, 
                host=args.host, 
                port=port, 
                log_level="info",
                access_log=True,
                workers=int(os.getenv("WORKERS", "1")))
