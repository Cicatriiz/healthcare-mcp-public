import sqlite3
import time
import os
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List, Union

logger = logging.getLogger("healthcare-mcp")

class UsageService:
    """
    Service for tracking API usage with SQLite backend
    
    This service provides anonymous usage tracking functionality
    with connection pooling for better performance.
    """
    
    # Class-level connection pool
    _connection_pools: Dict[str, sqlite3.Connection] = {}
    _connection_locks: Dict[str, threading.Lock] = {}
    
    def __init__(self, db_path: str = "usage.db"):
        """
        Initialize usage tracking service with anonymous tracking only
        
        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = os.getenv("USAGE_DB_PATH", db_path)
        
        # Initialize connection lock for this database
        if self.db_path not in self._connection_locks:
            self._connection_locks[self.db_path] = threading.Lock()
        
        # Initialize the database
        self._init_db()
        
    async def init(self) -> None:
        """
        Initialize the usage service asynchronously
        
        This method is called during application startup
        """
        # Ensure database directory exists
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        
        logger.info(f"Usage service initialized with database at {self.db_path}")
    
    def _get_connection(self) -> sqlite3.Connection:
        """
        Get a connection from the pool or create a new one
        
        Returns:
            SQLite connection
        """
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
        
        # Create usage table for anonymous session tracking only
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            tool TEXT NOT NULL,
            timestamp REAL NOT NULL,
            api_calls INTEGER NOT NULL DEFAULT 1
        )
        ''')
        
        # Create indexes for faster queries
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_session_timestamp ON usage(session_id, timestamp)
        ''')
        
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_tool ON usage(tool)
        ''')
        
        conn.commit()
    
    def record_usage(self, session_id: str, tool: str, api_calls: int = 1) -> bool:
        """
        Record API usage for a session anonymously
        
        Args:
            session_id: Anonymous session identifier
            tool: Name of the tool used
            api_calls: Number of API calls made
            
        Returns:
            True if successful, False otherwise
        """
        if not session_id or not tool:
            logger.warning("Missing session_id or tool in record_usage")
            return False
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                "INSERT INTO usage (session_id, tool, timestamp, api_calls) VALUES (?, ?, ?, ?)",
                (session_id, tool, time.time(), api_calls)
            )
            
            conn.commit()
            return True
            
        except sqlite3.Error as e:
            logger.error(f"Error in record_usage(): {str(e)}")
            return False
    
    def get_monthly_usage(self, session_id: str, month: Optional[int] = None, year: Optional[int] = None) -> Dict[str, Any]:
        """
        Get current month's usage for a session
        
        Args:
            session_id: Anonymous session identifier
            month: Month number (1-12)
            year: Year (e.g., 2023)
            
        Returns:
            Dictionary with usage statistics
        """
        # Use current month/year if not specified
        current_date = datetime.now()
        if month is None:
            month = current_date.month
        if year is None:
            year = current_date.year
        
        # Validate month and year
        try:
            month = int(month)
            year = int(year)
            if month < 1 or month > 12:
                month = current_date.month
            if year < 2000 or year > 2100:  # Reasonable range
                year = current_date.year
        except (ValueError, TypeError):
            month = current_date.month
            year = current_date.year
        
        # Calculate start and end timestamps for the month
        start_date = datetime(year, month, 1).timestamp()
        if month == 12:
            end_date = datetime(year + 1, 1, 1).timestamp()
        else:
            end_date = datetime(year, month + 1, 1).timestamp()
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Get total API calls for the month
            cursor.execute(
                "SELECT SUM(api_calls) FROM usage WHERE session_id = ? AND timestamp >= ? AND timestamp < ?",
                (session_id, start_date, end_date)
            )
            total_calls = cursor.fetchone()[0] or 0
            
            # Get tool-specific usage
            cursor.execute(
                "SELECT tool, SUM(api_calls) FROM usage WHERE session_id = ? AND timestamp >= ? AND timestamp < ? GROUP BY tool",
                (session_id, start_date, end_date)
            )
            tool_usage = {tool: count for tool, count in cursor.fetchall()}
            
            # Get daily usage
            cursor.execute(
                """
                SELECT 
                    strftime('%Y-%m-%d', datetime(timestamp, 'unixepoch')) as date,
                    SUM(api_calls) as calls
                FROM usage 
                WHERE session_id = ? AND timestamp >= ? AND timestamp < ?
                GROUP BY date
                ORDER BY date
                """,
                (session_id, start_date, end_date)
            )
            daily_usage = {date: calls for date, calls in cursor.fetchall()}
            
            return {
                "session_id": session_id,
                "month": month,
                "year": year,
                "total_api_calls": total_calls,
                "tool_usage": tool_usage,
                "daily_usage": daily_usage
            }
            
        except sqlite3.Error as e:
            logger.error(f"Error in get_monthly_usage(): {str(e)}")
            return {
                "session_id": session_id,
                "month": month,
                "year": year,
                "total_api_calls": 0,
                "tool_usage": {},
                "daily_usage": {},
                "error": str(e)
            }
    
    def get_usage_stats(self) -> Dict[str, Any]:
        """
        Get overall usage statistics
        
        Returns:
            Dictionary with overall usage statistics
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Get total API calls
            cursor.execute("SELECT SUM(api_calls) FROM usage")
            total_calls = cursor.fetchone()[0] or 0
            
            # Get total unique sessions
            cursor.execute("SELECT COUNT(DISTINCT session_id) FROM usage")
            total_sessions = cursor.fetchone()[0] or 0
            
            # Get tool-specific usage
            cursor.execute(
                "SELECT tool, SUM(api_calls) FROM usage GROUP BY tool ORDER BY SUM(api_calls) DESC"
            )
            tool_usage = {tool: count for tool, count in cursor.fetchall()}
            
            # Get usage by month
            cursor.execute(
                """
                SELECT 
                    strftime('%Y-%m', datetime(timestamp, 'unixepoch')) as month,
                    SUM(api_calls) as calls
                FROM usage 
                GROUP BY month
                ORDER BY month DESC
                LIMIT 12
                """
            )
            monthly_usage = {month: calls for month, calls in cursor.fetchall()}
            
            return {
                "total_api_calls": total_calls,
                "total_unique_sessions": total_sessions,
                "tool_usage": tool_usage,
                "monthly_usage": monthly_usage
            }
            
        except sqlite3.Error as e:
            logger.error(f"Error in get_usage_stats(): {str(e)}")
            return {
                "error": str(e)
            }
    
    def cleanup_old_data(self, days: int = 365) -> int:
        """
        Clean up usage data older than specified days
        
        Args:
            days: Number of days to keep
            
        Returns:
            Number of deleted records
        """
        if days < 30:  # Safety check
            days = 30
        
        # Calculate cutoff timestamp
        cutoff_timestamp = time.time() - (days * 86400)  # 86400 seconds in a day
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("DELETE FROM usage WHERE timestamp < ?", (cutoff_timestamp,))
            deleted = cursor.rowcount
            
            conn.commit()
            logger.info(f"Cleaned up {deleted} old usage records")
            return deleted
            
        except sqlite3.Error as e:
            logger.error(f"Error in cleanup_old_data(): {str(e)}")
            return 0
            
    async def close(self) -> None:
        """
        Close the usage service and clean up resources
        
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
            logger.error(f"Error closing usage service: {str(e)}")
