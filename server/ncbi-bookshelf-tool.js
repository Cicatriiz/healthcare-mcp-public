import { BaseTool } from './base-tool.js';

/**
 * Tool for searching the NCBI Bookshelf
 */
export class NcbiBookshelfTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
    this.apiKey = process.env.NCBI_API_KEY || '';
  }

  /**
   * Search the NCBI Bookshelf
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
    const cacheKey = this.getCacheKey('ncbi_bookshelf_search', query, validMaxResults);

    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for NCBI Bookshelf search: ${query}`);
      return cachedResult;
    }

    try {
      console.error(`Searching NCBI Bookshelf for: ${query}, max_results=${validMaxResults}`);

      // Search NCBI Bookshelf to get document IDs
      const searchParams = {
        db: 'books',
        term: query,
        retmax: validMaxResults,
        format: 'json',
        ...(this.apiKey && { api_key: this.apiKey }),
      };
      const searchEndpoint = `${this.baseUrl}esearch.fcgi`;
      const searchUrl = this.buildUrl(searchEndpoint, searchParams);
      const searchData = await this.makeRequest(searchUrl);

      const idList = searchData.esearchresult?.idlist || [];
      const totalResults = parseInt(searchData.esearchresult?.count || 0);

      let books = [];
      if (idList.length > 0) {
        const summaryParams = {
          db: 'books',
          id: idList.join(','),
          retmode: 'json',
          ...(this.apiKey && { api_key: this.apiKey }),
        };
        const summaryEndpoint = `${this.baseUrl}esummary.fcgi`;
        const summaryUrl = this.buildUrl(summaryEndpoint, summaryParams);
        const summaryData = await this.makeRequest(summaryUrl);

        books = idList.map(id => {
          const bookData = summaryData.result[id];
          return {
            id: id,
            title: bookData.title,
            authors: bookData.authors ? bookData.authors.map(a => a.name) : [],
            publication_date: bookData.pubdate,
            url: `https://www.ncbi.nlm.nih.gov/books/${id}/`,
          };
        });
      }

      const result = this.formatSuccessResponse({
        query: query,
        total_results: totalResults,
        books: books,
      });

      // Cache for 1 day (86400 seconds)
      this.cache.set(cacheKey, result, 86400);

      return result;

    } catch (error) {
      console.error(`Error searching NCBI Bookshelf: ${error.message}`);
      return this.formatErrorResponse(`Error searching NCBI Bookshelf: ${error.message}`);
    }
  }
}

export default NcbiBookshelfTool;
