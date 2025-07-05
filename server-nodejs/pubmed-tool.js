import { BaseTool } from './base-tool.js';

/**
 * Tool for searching medical literature in PubMed database
 */
export class PubMedTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.apiKey = process.env.PUBMED_API_KEY || '';
    this.baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  }

  /**
   * Process article data from PubMed API response
   */
  processArticleData(idList, summaryData) {
    const articles = [];
    
    // Get the result data
    const resultData = summaryData.result || {};
    
    // Process each article
    for (const articleId of idList) {
      if (articleId in resultData) {
        const articleData = resultData[articleId];
        
        // Extract authors
        const authors = [];
        if (articleData.authors) {
          for (const author of articleData.authors) {
            if (author.name) {
              authors.push(author.name);
            }
          }
        }
        
        // Create article object
        const article = {
          id: articleId,
          title: articleData.title || '',
          authors: authors,
          journal: articleData.fulljournalname || '',
          publication_date: articleData.pubdate || '',
          abstract_url: `https://pubmed.ncbi.nlm.nih.gov/${articleId}/`
        };
        
        // Add additional fields if available
        if (articleData.articleids) {
          for (const idObj of articleData.articleids) {
            if (idObj.idtype === 'doi') {
              article.doi = idObj.value || '';
            }
          }
        }
        
        articles.push(article);
      }
    }
    
    return articles;
  }

  /**
   * Search for medical literature in PubMed database
   */
  async searchLiterature(query, maxResults = 5, dateRange = '') {
    // Input validation
    if (!query) {
      return this.formatErrorResponse('Search query is required');
    }
    
    // Validate max_results
    let validMaxResults;
    try {
      validMaxResults = parseInt(maxResults);
      if (validMaxResults < 1) {
        validMaxResults = 5;
      } else if (validMaxResults > 100) {
        validMaxResults = 100; // Limit to reasonable number
      }
    } catch (error) {
      validMaxResults = 5;
    }
    
    // Create cache key
    const cacheKey = this.getCacheKey('pubmed_search', query, validMaxResults, dateRange);
    
    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for PubMed search: ${query}`);
      return cachedResult;
    }
    
    try {
      console.error(`Searching PubMed for: ${query}, max_results=${validMaxResults}, date_range=${dateRange}`);
      
      // Process query with date range if provided
      let processedQuery = query;
      if (dateRange) {
        try {
          const yearsBack = parseInt(dateRange);
          const currentYear = new Date().getFullYear();
          const minYear = currentYear - yearsBack;
          processedQuery += ` AND ${minYear}:${currentYear}[pdat]`;
          console.error(`Added date range filter: ${minYear}-${currentYear}`);
        } catch (error) {
          // If date_range isn't a valid integer, just ignore it
          console.error(`Invalid date range: ${dateRange}, ignoring`);
        }
      }
      
      // Search PubMed to get article IDs
      const searchParams = {
        db: 'pubmed',
        term: processedQuery,
        retmax: validMaxResults,
        format: 'json'
      };
      
      // Add API key if available
      if (this.apiKey) {
        searchParams.api_key = this.apiKey;
      }
      
      // Make the search request
      const searchEndpoint = `${this.baseUrl}esearch.fcgi`;
      const searchUrl = this.buildUrl(searchEndpoint, searchParams);
      const searchData = await this.makeRequest(searchUrl);
      
      // Extract article IDs and total count
      const idList = searchData.esearchresult?.idlist || [];
      const totalResults = parseInt(searchData.esearchresult?.count || 0);
      
      // If we have results, fetch article details
      let articles = [];
      if (idList.length > 0) {
        // Prepare parameters for summary request
        const summaryParams = {
          db: 'pubmed',
          id: idList.join(','),
          retmode: 'json'
        };
        
        // Add API key if available
        if (this.apiKey) {
          summaryParams.api_key = this.apiKey;
        }
        
        // Make the summary request
        const summaryEndpoint = `${this.baseUrl}esummary.fcgi`;
        const summaryUrl = this.buildUrl(summaryEndpoint, summaryParams);
        const summaryData = await this.makeRequest(summaryUrl);
        
        // Process article data
        articles = this.processArticleData(idList, summaryData);
      }
      
      // Create result object
      const result = this.formatSuccessResponse({
        query: query,
        total_results: totalResults,
        date_range: dateRange,
        articles: articles
      });
      
      // Cache for 12 hours (43200 seconds)
      this.cache.set(cacheKey, result, 43200);
      
      return result;
      
    } catch (error) {
      console.error(`Error searching PubMed: ${error.message}`);
      return this.formatErrorResponse(`Error searching PubMed: ${error.message}`);
    }
  }
}

export default PubMedTool;
