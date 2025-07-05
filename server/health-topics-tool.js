import { BaseTool } from './base-tool.js';

/**
 * Tool for accessing health information from Health.gov
 */
export class HealthTopicsTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
    this.baseUrl = 'https://health.gov/myhealthfinder/api/v3';
  }

  /**
   * Get evidence-based health information on various topics
   */
  async getHealthTopics(topic, language = 'en') {
    // Input validation
    if (!topic) {
      return this.formatErrorResponse('Topic is required');
    }
    
    // Validate language
    if (!['en', 'es'].includes(language.toLowerCase())) {
      language = 'en';
    }
    
    // Create cache key
    const cacheKey = this.getCacheKey('health_topics', topic, language);
    
    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      console.error(`Cache hit for Health Topics search: ${topic}`);
      return cachedResult;
    }
    
    try {
      console.error(`Searching Health Topics for: ${topic}, language: ${language}`);
      
      // Build API URL with parameters
      const params = {
        keyword: topic,
        lang: language,
        api: '1'
      };
      
      const url = this.buildUrl(`${this.baseUrl}/topics.json`, params);
      
      // Make the request
      const data = await this.makeRequest(url);
      
      // Process the response
      let topics = [];
      let totalResults = 0;
      
      if (data && data.Result && data.Result.Topics) {
        const rawTopics = data.Result.Topics.Topic || [];
        totalResults = rawTopics.length;
        
        // Process each topic
        for (const rawTopic of rawTopics) {
          const processedTopic = {
            title: rawTopic.Title || '',
            url: rawTopic.AccessibleVersion || rawTopic.LastUpdate || '',
            last_updated: rawTopic.LastUpdate || '',
            section: rawTopic.Sections?.Section?.[0]?.Title || '',
            description: rawTopic.Sections?.Section?.[0]?.Description || '',
            content: []
          };
          
          // Extract content from sections
          if (rawTopic.Sections && rawTopic.Sections.Section) {
            for (const section of rawTopic.Sections.Section) {
              if (section.Content) {
                // Clean and limit content
                let content = section.Content;
                if (typeof content === 'string') {
                  // Remove HTML and limit size
                  content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                  if (content.length > 500) {
                    content = content.substring(0, 497) + '...';
                  }
                  if (content) {
                    processedTopic.content.push(content);
                  }
                }
              }
            }
          }
          
          topics.push(processedTopic);
        }
      }
      
      // Create result object
      const result = this.formatSuccessResponse({
        search_term: topic,
        language: language,
        total_results: totalResults,
        topics: topics
      });
      
      // Cache for 24 hours (86400 seconds)
      this.cache.set(cacheKey, result, 86400);
      
      return result;
      
    } catch (error) {
      console.error(`Error searching Health Topics: ${error.message}`);
      return this.formatErrorResponse(`Error searching health topics: ${error.message}`);
    }
  }
}

export default HealthTopicsTool;
