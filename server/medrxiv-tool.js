import { BaseTool } from './base-tool.js';

/**
 * Tool for searching pre-print articles on medRxiv
 */
export class MedRxivTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.baseUrl = 'https://api.medrxiv.org/';
  }

  /**
   * Search for pre-print articles on medRxiv
   */
  async search(query, maxResults = 10) {
    // Input validation
    if (!query) {
      return this.formatErrorResponse('Search query is required');
    }

    // Validate max_results
    let validMaxResults;
    try {
      validMaxResults = parseInt(maxResults);
      if (validMaxResults < 1) {
        validMaxResults = 10;
      } else if (validMaxResults > 100) {
        validMaxResults = 100; // Limit to a reasonable number
      }
    } catch (error) {
      validMaxResults = 10;
    }

    // Create cache key
    const cacheKey = this.getCacheKey('medrxiv_search', query, validMaxResults);

    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for medRxiv search: ${query}`);
      return cachedResult;
    }

    try {
      console.error(`Searching medRxiv for: ${query}, max_results=${validMaxResults}`);

      // The medRxiv API is a bit different, it's a simple GET request
      // to a specific endpoint with the query in the URL path.
      // We'll search for the last 180 days of pre-prints.
      const server = 'medrxiv';
      const endpoint = `details/${server}/${query}/0/180/json`;
      const url = `${this.baseUrl}${endpoint}`;

      const data = await this.makeRequest(url);

      // Process the results
      const articles = data.collection.slice(0, validMaxResults).map(article => ({
        title: article.rel_title,
        authors: article.rel_authors,
        doi: article.rel_doi,
        abstract_url: `https://www.medrxiv.org/content/${article.rel_doi}`,
        publication_date: article.rel_date,
      }));

      const result = this.formatSuccessResponse({
        query: query,
        total_results: data.collection.length,
        articles: articles,
      });

      // Cache for 12 hours (43200 seconds)
      this.cache.set(cacheKey, result, 43200);

      return result;

    } catch (error) {
      console.error(`Error searching medRxiv: ${error.message}`);
      return this.formatErrorResponse(`Error searching medRxiv: ${error.message}`);
    }
  }
}

export default MedRxivTool;
