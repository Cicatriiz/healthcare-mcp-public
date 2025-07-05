import NodeCache from 'node-cache';
import crypto from 'crypto';

/**
 * Cache service for storing API responses
 */
export class CacheService {
  constructor(ttl = 3600) {
    this.cache = new NodeCache({
      stdTTL: ttl,
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false
    });
    
    this.cache.on('expired', (key, value) => {
      console.error(`Cache key expired: ${key}`);
    });
  }

  /**
   * Generate a cache key from prefix and arguments
   */
  getCacheKey(prefix, ...args) {
    const keyParts = [prefix];
    for (const arg of args) {
      if (arg !== null && arg !== undefined) {
        keyParts.push(String(arg));
      }
    }
    const cacheKey = keyParts.join('_');
    return crypto.createHash('md5').update(cacheKey).digest('hex');
  }

  /**
   * Get a value from cache
   */
  get(key) {
    return this.cache.get(key);
  }

  /**
   * Set a value in cache
   */
  set(key, value, ttl = null) {
    if (ttl !== null) {
      return this.cache.set(key, value, ttl);
    }
    return this.cache.set(key, value);
  }

  /**
   * Delete a key from cache
   */
  del(key) {
    return this.cache.del(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    return this.cache.flushAll();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }
}

export default CacheService;
