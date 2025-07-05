import logging
from typing import Dict, Any, List, Optional, Union
from tools.base_tool import BaseTool

logger = logging.getLogger("healthcare-mcp")

class MedicalTerminologyTool(BaseTool):
    """Tool for looking up ICD-10 codes and medical terminology"""
    
    def __init__(self):
        """Initialize Medical Terminology tool with base URL and caching"""
        super().__init__(cache_db_path="healthcare_cache.db")
        self.icd10_base_url = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
    
    async def lookup_icd_code(self, code: Optional[str] = None, description: Optional[str] = None, max_results: int = 10) -> Dict[str, Any]:
        """
        Look up ICD-10 codes by code or description
        
        Args:
            code: ICD-10 code to look up (optional if description is provided)
            description: Medical condition description to search for (optional if code is provided)
            max_results: Maximum number of results to return
            
        Returns:
            Dictionary containing ICD-10 code information or error details
        """
        # Input validation
        if not code and not description:
            return self._format_error_response("Either code or description must be provided")
        
        # Determine search term
        search_term = code if code else description
        
        # Validate max_results
        try:
            max_results = int(max_results)
            if max_results < 1:
                max_results = 10
            elif max_results > 100:
                max_results = 100  # Limit to reasonable number
        except (ValueError, TypeError):
            max_results = 10
        
        # Create cache key
        cache_key = self._get_cache_key("icd10", search_term, max_results)
        
        # Check cache first
        cached_result = self.cache.get(cache_key)
        if cached_result:
            logger.info(f"Cache hit for ICD-10 lookup: {search_term}")
            return cached_result
            
        try:
            logger.info(f"Looking up ICD-10 code: {search_term}, max_results={max_results}")
            
            # Build parameters
            params = {
                "terms": search_term,
                "maxList": max_results,
                "df": "code,name"  # Display fields
            }
            
            # Make the request
            data = await self._make_request(self.icd10_base_url, params=params)
            
            # Process the response
            codes = await self._process_icd10_response(data, search_term)
            
            # Create result object
            result = self._format_success_response(
                search_term=search_term,
                total_results=len(codes),
                results=codes
            )
            
            # Cache for 30 days (ICD-10 codes don't change frequently)
            self.cache.set(cache_key, result, ttl=30*86400)
            
            return result
                
        except Exception as e:
            logger.error(f"Error looking up ICD-10 code: {str(e)}")
            return self._format_error_response(f"Error looking up ICD-10 code: {str(e)}")
    
    async def _process_icd10_response(self, data: List[Any], search_term: str) -> List[Dict[str, Any]]:
        """
        Process ICD-10 code data from API response
        
        Args:
            data: Response data from ICD-10 API
            search_term: Original search term
            
        Returns:
            List of processed ICD-10 code data
        """
        codes = []
        
        # The API returns data in a specific format:
        # [0] = status code
        # [1] = list of codes
        # [2] = display field names
        # [3] = list of descriptions
        if len(data) >= 4 and isinstance(data[3], list):
            code_values = data[1]  # The codes are in the second element
            descriptions = data[3]  # The descriptions are in the fourth element
            
            for i in range(len(code_values)):
                # Parse out the ICD-10 code details
                code_text = code_values[i]
                description_text = descriptions[i][1] if len(descriptions[i]) > 1 else "No description"
                
                # Extract category information (usually the first 3 characters)
                category = code_text.split('.')[0] if '.' in code_text else code_text[:3]
                
                code_info = {
                    "code": code_text,
                    "description": description_text,
                    "category": category
                }
                
                # Add chapter information if we can determine it
                chapter = self._get_icd10_chapter(category)
                if chapter:
                    code_info["chapter"] = chapter["number"]
                    code_info["chapter_description"] = chapter["description"]
                
                codes.append(code_info)
        
        return codes
    
    def _get_icd10_chapter(self, category_code: str) -> Optional[Dict[str, str]]:
        """
        Get the ICD-10 chapter information for a given category code.
        This is a simplified version that works for the main ICD-10-CM chapters.
        
        Args:
            category_code: ICD-10 category code
            
        Returns:
            Dictionary containing chapter number and description, or None if not found
        """
        # Convert to uppercase just to be safe
        category_code = category_code.upper()
        
        # The first character of the category code determines the chapter
        first_char = category_code[0] if category_code else ''
        
        # Define chapters
        icd10_chapters = {
            'A-B': {"number": "I", "description": "Certain infectious and parasitic diseases"},
            'C': {"number": "II", "description": "Neoplasms"},
            'D1': {"number": "II", "description": "Neoplasms"},
            'D2': {"number": "III", "description": "Diseases of the blood and blood-forming organs and certain disorders involving the immune mechanism"},
            'E': {"number": "IV", "description": "Endocrine, nutritional and metabolic diseases"},
            'F': {"number": "V", "description": "Mental and behavioral disorders"},
            'G': {"number": "VI", "description": "Diseases of the nervous system"},
            'H1': {"number": "VII", "description": "Diseases of the eye and adnexa"},
            'H2': {"number": "VIII", "description": "Diseases of the ear and mastoid process"},
            'I': {"number": "IX", "description": "Diseases of the circulatory system"},
            'J': {"number": "X", "description": "Diseases of the respiratory system"},
            'K': {"number": "XI", "description": "Diseases of the digestive system"},
            'L': {"number": "XII", "description": "Diseases of the skin and subcutaneous tissue"},
            'M': {"number": "XIII", "description": "Diseases of the musculoskeletal system and connective tissue"},
            'N': {"number": "XIV", "description": "Diseases of the genitourinary system"},
            'O': {"number": "XV", "description": "Pregnancy, childbirth and the puerperium"},
            'P': {"number": "XVI", "description": "Certain conditions originating in the perinatal period"},
            'Q': {"number": "XVII", "description": "Congenital malformations, deformations and chromosomal abnormalities"},
            'R': {"number": "XVIII", "description": "Symptoms, signs and abnormal clinical and laboratory findings, not elsewhere classified"},
            'S-T': {"number": "XIX", "description": "Injury, poisoning and certain other consequences of external causes"},
            'V-Y': {"number": "XX", "description": "External causes of morbidity and mortality"},
            'Z': {"number": "XXI", "description": "Factors influencing health status and contact with health services"}
        }
        
        # Determine the chapter based on the first character and code range
        if 'A' <= first_char <= 'B':
            return icd10_chapters['A-B']
        elif first_char == 'C':
            return icd10_chapters['C']
        elif first_char == 'D':
            if category_code <= 'D48':
                return icd10_chapters['D1']  # Neoplasms
            else:
                return icd10_chapters['D2']  # Blood diseases
        elif first_char == 'E':
            return icd10_chapters['E']
        elif first_char == 'F':
            return icd10_chapters['F']
        elif first_char == 'G':
            return icd10_chapters['G']
        elif first_char == 'H':
            if category_code <= 'H59':
                return icd10_chapters['H1']  # Eye diseases
            else:
                return icd10_chapters['H2']  # Ear diseases
        elif first_char == 'I':
            return icd10_chapters['I']
        elif first_char == 'J':
            return icd10_chapters['J']
        elif first_char == 'K':
            return icd10_chapters['K']
        elif first_char == 'L':
            return icd10_chapters['L']
        elif first_char == 'M':
            return icd10_chapters['M']
        elif first_char == 'N':
            return icd10_chapters['N']
        elif first_char == 'O':
            return icd10_chapters['O']
        elif first_char == 'P':
            return icd10_chapters['P']
        elif first_char == 'Q':
            return icd10_chapters['Q']
        elif first_char == 'R':
            return icd10_chapters['R']
        elif first_char == 'S' or first_char == 'T':
            return icd10_chapters['S-T']
        elif first_char in ['V', 'W', 'X', 'Y']:
            return icd10_chapters['V-Y']
        elif first_char == 'Z':
            return icd10_chapters['Z']
        else:
            return None