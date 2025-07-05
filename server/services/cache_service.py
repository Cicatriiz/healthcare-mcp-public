import json
import time
import os
import sqlite3
import logging
import threading
from pathlib import Path
from typing import Any, Dict, Optional, Union

logger = logging.getLogger("healthcare-mcp")

class CacheService:
    """
    Cache service with SQLite backend and connection pooling
    
    This service provides caching functionality with automatic expiration
    and connection pooling for better performance.
    """
    
    # Class-level connection pool
    _connection_pools: Dict[str, sqlite3.Connection] = {}
    _connection_locks: Dict[str, threading.Lock] = {}
    
    def __init__(self, db_path: str = "cache.db", ttl: int = 3600):  # Default TTL: 1 hour
        """
        Initialize cache service with SQLite backend
        
        Args:
            db_path: Path to the SQLite database file
            ttl: Default time-to-live for cache entries in seconds
        """
        self.db_path = os.getenv("CACHE_DB_PATH", db_path)
        self.default_ttl = ttl
        
        # Initialize connection lock for this database
        if self.db_path not in self._connection_locks:
            self._connection_locks[self.db_path] = threading.Lock()
        
        # Initialize the database
        self._init_db()
        
        # Schedule periodic cleanup of expired entries
        self._schedule_cleanup()
        
    async def init(self) -> None:
        """
        Initialize the cache service asynchronously
        
        This method is called during application startup
        """
        # Ensure database directory exists
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        
        # Clear expired entries on startup
        self.clear_expired()
        
        logger.info(f"Cache service initialized with database at {self.db_path}")
    
    def _get_connection(self) -> sqlite3.Connection:
        """
        Get a connection from the pool or create a new one
        
        Returns:
            SQLite connection
        """
        # Create a lock for this database path if it doesn't exist
        if self.db_path not in self._connection_locks:
            self._connection_locks[self.db_path] = threading.RLock()
            
        with self._connection_locks[self.db_path]:
            if self.db_path not in self._connection_pools:
                logger.debug(f"Creating new database connection for {self.db_path}")
                conn = sqlite3.connect(self.db_path, check_same_thread=False)
                # Enable WAL mode for better concurrency
                conn.execute("PRAGMA journal_mode=WAL")
                # Enable foreign keys
                conn.execute("PRAGMA foreign_keys=ON")
                self._connection_pools[self.db_path] = conn
            
            return self._connection_pools[self.db_path]
    
    def _init_db(self) -> None:
        """Initialize the SQLite database if it doesn't exist"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Create cache table if it doesn't exist
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at REAL NOT NULL,
            created_at REAL NOT NULL
        )
        ''')
        
        # Create index on expires_at for faster cleanup
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_expires_at ON cache(expires_at)
        ''')
        
        conn.commit()
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache if it exists and is not expired
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found or expired
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Get cache entry
            cursor.execute("SELECT data, expires_at FROM cache WHERE key = ?", (key,))
            result = cursor.fetchone()
            
            if not result:
                return None
            
            data, expires_at = result
            
            # Check if expired
            if expires_at < time.time():
                # Delete expired entry asynchronously
                threading.Thread(target=self._delete_expired, args=(key,)).start()
                return None
            
            # Parse JSON data
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                logger.error(f"Failed to decode JSON data for key: {key}")
                return None
                
        except sqlite3.Error as e:
            logger.error(f"Database error in get(): {str(e)}")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Set value in cache with optional TTL
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (optional)
            
        Returns:
            True if successful, False otherwise
        """
        ttl = ttl or self.default_ttl
        expires_at = time.time() + ttl
        created_at = time.time()
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Serialize value to JSON
            serialized_value = json.dumps(value)
            
            # Insert or replace cache entry
            cursor.execute(
                "INSERT OR REPLACE INTO cache (key, data, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (key, serialized_value, expires_at, created_at)
            )
            
            conn.commit()
            return True
            
        except (sqlite3.Error, json.JSONEncodeError) as e:
            logger.error(f"Error in set(): {str(e)}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        Delete value from cache
        
        Args:
            key: Cache key
            
        Returns:
            True if deleted, False otherwise
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("DELETE FROM cache WHERE key = ?", (key,))
            deleted = cursor.rowcount > 0
            
            conn.commit()
            return deleted
            
        except sqlite3.Error as e:
            logger.error(f"Error in delete(): {str(e)}")
            return False
    
    def _delete_expired(self, key: str) -> None:
        """
        Delete an expired cache entry
        
        Args:
            key: Cache key
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("DELETE FROM cache WHERE key = ?", (key,))
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error in _delete_expired(): {str(e)}")
    
    def clear_expired(self) -> int:
        """
        Clear all expired cache entries
        
        Returns:
            Number of deleted entries
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("DELETE FROM cache WHERE expires_at < ?", (time.time(),))
            deleted = cursor.rowcount
            
            conn.commit()
            logger.info(f"Cleared {deleted} expired cache entries")
            return deleted
            
        except sqlite3.Error as e:
            logger.error(f"Error in clear_expired(): {str(e)}")
            return 0
    
    def _schedule_cleanup(self) -> None:
        """Schedule periodic cleanup of expired entries"""
        # This would normally use a background task scheduler
        # For simplicity, we'll just log a message
        logger.info("Cache cleanup would be scheduled here in a production environment")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics
        
        Returns:
            Dictionary with cache statistics
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Get total entries
            cursor.execute("SELECT COUNT(*) FROM cache")
            total_entries = cursor.fetchone()[0]
            
            # Get expired entries
            cursor.execute("SELECT COUNT(*) FROM cache WHERE expires_at < ?", (time.time(),))
            expired_entries = cursor.fetchone()[0]
            
            # Get average TTL
            cursor.execute("SELECT AVG(expires_at - created_at) FROM cache")
            avg_ttl = cursor.fetchone()[0] or 0
            
            return {
                "total_entries": total_entries,
                "expired_entries": expired_entries,
                "valid_entries": total_entries - expired_entries,
                "average_ttl_seconds": round(avg_ttl, 2)
            }
            
        except sqlite3.Error as e:
            logger.error(f"Error in get_stats(): {str(e)}")
            return {
                "error": str(e)
            }
            
    async def close(self) -> None:
        """
        Close the cache service and clean up resources
        
        This method is called during application shutdown
        """
        try:
            # Close database connection if it exists
            if self.db_path in self._connection_pools:
                with self._connection_locks[self.db_path]:
                    conn = self._connection_pools[self.db_path]
                    conn.close()
                    del self._connection_pools[self.db_path]
                    logger.info(f"Closed database connection for {self.db_path}")
        except Exception as e:
            logger.error(f"Error closing cache service: {str(e)}")
