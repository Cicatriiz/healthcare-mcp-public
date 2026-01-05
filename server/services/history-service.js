#!/usr/bin/env node

/**
 * History Service - Local Shortage Tracking Database
 * Stores daily snapshots of FDA shortage data to enable:
 * - Accurate duration calculations
 * - Trend analysis over time
 * - Resolution tracking
 * - Data quality improvements
 *
 * Uses SQLite for simplicity and zero-configuration setup
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HistoryService {
  constructor(dbPath = null) {
    // Default DB location: server/data/shortage-history.db
    this.dbPath = dbPath || path.join(__dirname, '..', 'data', 'shortage-history.db');
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize database and create tables if needed
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Open database
      this.db = new sqlite3.Database(this.dbPath);

      // Promisify database methods
      this.db.run = promisify(this.db.run);
      this.db.get = promisify(this.db.get);
      this.db.all = promisify(this.db.all);

      // Create tables
      await this.createTables();

      this.initialized = true;
      console.log(`[HistoryService] Initialized database at ${this.dbPath}`);

    } catch (error) {
      console.error('[HistoryService] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    // Snapshots table - stores daily snapshots of shortage data
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL,
        ndc TEXT NOT NULL,
        generic_name TEXT,
        brand_name TEXT,
        manufacturer TEXT,
        status TEXT NOT NULL,
        dosage_form TEXT,
        route TEXT,
        therapeutic_categories TEXT,
        shortage_reason TEXT,
        initial_date TEXT,
        resolution_date TEXT,
        raw_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(snapshot_date, ndc)
      )
    `);

    // Create indexes for faster queries
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_date
      ON snapshots(snapshot_date)
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_ndc
      ON snapshots(ndc)
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_status
      ON snapshots(status)
    `);

    // Status changes table - tracks when shortages change status
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS status_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ndc TEXT NOT NULL,
        generic_name TEXT,
        from_status TEXT,
        to_status TEXT NOT NULL,
        change_date TEXT NOT NULL,
        days_active INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_status_changes_ndc
      ON status_changes(ndc)
    `);

    // Metadata table - stores snapshot metadata
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS metadata (
        snapshot_date TEXT PRIMARY KEY,
        total_shortages INTEGER,
        active_shortages INTEGER,
        resolved_shortages INTEGER,
        new_shortages INTEGER,
        newly_resolved INTEGER,
        snapshot_duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Take a snapshot of current FDA shortage data
   * This should be run daily via cron job
   */
  async takeSnapshot(fdaShortageTool) {
    await this.initialize();

    const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const startTime = Date.now();

    console.log(`[HistoryService] Taking snapshot for ${snapshotDate}...`);

    try {
      // Fetch all current shortages from FDA
      const result = await fdaShortageTool.fetchAllShortages();

      if (result.status === 'error') {
        throw new Error(result.error_message);
      }

      const shortages = result.shortages || [];
      let newCount = 0;
      let resolvedCount = 0;
      const activeShortages = shortages.filter(s => s.status === 'active');
      const resolvedShortages = shortages.filter(s => s.status === 'resolved');

      // Get previous day's snapshot to detect changes
      const previousDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const previousNDCs = await this.db.all(
        'SELECT ndc, status FROM snapshots WHERE snapshot_date = ?',
        [previousDate]
      );

      const previousMap = new Map(previousNDCs.map(row => [row.ndc, row.status]));

      // Insert/update snapshots
      for (const shortage of shortages) {
        const therapeuticCategories = Array.isArray(shortage.therapeutic_categories)
          ? shortage.therapeutic_categories.join('|')
          : '';

        const shortageReasons = Array.isArray(shortage.shortage_reasons)
          ? shortage.shortage_reasons.join('|')
          : '';

        // Insert snapshot (ignore if duplicate)
        await this.db.run(`
          INSERT OR REPLACE INTO snapshots
          (snapshot_date, ndc, generic_name, brand_name, manufacturer, status,
           dosage_form, route, therapeutic_categories, shortage_reason,
           initial_date, resolution_date, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          snapshotDate,
          shortage.ndc,
          shortage.generic_name,
          shortage.brand_name,
          shortage.manufacturer,
          shortage.status,
          shortage.dosage_form,
          shortage.route,
          therapeuticCategories,
          shortageReasons,
          shortage.initial_date,
          shortage.resolution_date,
          JSON.stringify(shortage)
        ]);

        // Detect status changes
        const previousStatus = previousMap.get(shortage.ndc);

        if (!previousStatus) {
          // New shortage
          newCount++;
        } else if (previousStatus !== shortage.status) {
          // Status changed
          if (shortage.status === 'resolved') {
            resolvedCount++;
          }

          // Calculate days active (from our historical data)
          const firstSeen = await this.db.get(
            'SELECT MIN(snapshot_date) as first_date FROM snapshots WHERE ndc = ? AND status = ?',
            [shortage.ndc, 'active']
          );

          let daysActive = null;
          if (firstSeen && firstSeen.first_date) {
            const firstDate = new Date(firstSeen.first_date);
            const currentDate = new Date(snapshotDate);
            daysActive = Math.floor((currentDate - firstDate) / (1000 * 60 * 60 * 24));
          }

          // Record status change
          await this.db.run(`
            INSERT INTO status_changes
            (ndc, generic_name, from_status, to_status, change_date, days_active)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            shortage.ndc,
            shortage.generic_name,
            previousStatus,
            shortage.status,
            snapshotDate,
            daysActive
          ]);
        }
      }

      // Store metadata
      const duration = Date.now() - startTime;
      await this.db.run(`
        INSERT OR REPLACE INTO metadata
        (snapshot_date, total_shortages, active_shortages, resolved_shortages,
         new_shortages, newly_resolved, snapshot_duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        snapshotDate,
        shortages.length,
        activeShortages.length,
        resolvedShortages.length,
        newCount,
        resolvedCount,
        duration
      ]);

      console.log(`[HistoryService] Snapshot complete: ${shortages.length} shortages, ${newCount} new, ${resolvedCount} resolved (${duration}ms)`);

      return {
        status: 'success',
        snapshot_date: snapshotDate,
        total: shortages.length,
        active: activeShortages.length,
        resolved: resolvedShortages.length,
        new: newCount,
        newly_resolved: resolvedCount,
        duration_ms: duration
      };

    } catch (error) {
      console.error('[HistoryService] Snapshot error:', error);
      return {
        status: 'error',
        error_message: `Failed to take snapshot: ${error.message}`
      };
    }
  }

  /**
   * Get actual resolution duration from historical data
   * This fixes FDA's poor timestamp data
   */
  async getActualDuration(ndc) {
    await this.initialize();

    try {
      // Get first active snapshot and first resolved snapshot
      const firstActive = await this.db.get(`
        SELECT snapshot_date FROM snapshots
        WHERE ndc = ? AND status = 'active'
        ORDER BY snapshot_date ASC LIMIT 1
      `, [ndc]);

      const firstResolved = await this.db.get(`
        SELECT snapshot_date FROM snapshots
        WHERE ndc = ? AND status = 'resolved'
        ORDER BY snapshot_date ASC LIMIT 1
      `, [ndc]);

      if (!firstActive) {
        return null; // No historical data
      }

      if (!firstResolved) {
        // Still active - calculate days since first seen
        const startDate = new Date(firstActive.snapshot_date);
        const now = new Date();
        return Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
      }

      // Calculate days between first active and first resolved
      const startDate = new Date(firstActive.snapshot_date);
      const endDate = new Date(firstResolved.snapshot_date);
      return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));

    } catch (error) {
      console.error('[HistoryService] Error getting duration:', error);
      return null;
    }
  }

  /**
   * Get shortage timeline (history of status changes)
   */
  async getShortageTimeline(ndc) {
    await this.initialize();

    try {
      const timeline = await this.db.all(`
        SELECT snapshot_date, status, generic_name, manufacturer
        FROM snapshots
        WHERE ndc = ?
        ORDER BY snapshot_date ASC
      `, [ndc]);

      const statusChanges = await this.db.all(`
        SELECT * FROM status_changes
        WHERE ndc = ?
        ORDER BY change_date ASC
      `, [ndc]);

      return {
        status: 'success',
        ndc: ndc,
        timeline: timeline,
        status_changes: statusChanges
      };

    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to get timeline: ${error.message}`
      };
    }
  }

  /**
   * Get historical trends (daily statistics)
   */
  async getHistoricalTrends(startDate = null, endDate = null) {
    await this.initialize();

    try {
      let query = 'SELECT * FROM metadata ORDER BY snapshot_date DESC';
      const params = [];

      if (startDate && endDate) {
        query = `
          SELECT * FROM metadata
          WHERE snapshot_date BETWEEN ? AND ?
          ORDER BY snapshot_date ASC
        `;
        params.push(startDate, endDate);
      } else if (startDate) {
        query = `
          SELECT * FROM metadata
          WHERE snapshot_date >= ?
          ORDER BY snapshot_date ASC
        `;
        params.push(startDate);
      }

      const trends = await this.db.all(query, params);

      return {
        status: 'success',
        trends: trends
      };

    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to get trends: ${error.message}`
      };
    }
  }

  /**
   * Get statistics about database
   */
  async getStats() {
    await this.initialize();

    try {
      const snapshotCount = await this.db.get(
        'SELECT COUNT(DISTINCT snapshot_date) as count FROM snapshots'
      );

      const uniqueShortages = await this.db.get(
        'SELECT COUNT(DISTINCT ndc) as count FROM snapshots'
      );

      const statusChanges = await this.db.get(
        'SELECT COUNT(*) as count FROM status_changes'
      );

      const dateRange = await this.db.get(`
        SELECT MIN(snapshot_date) as first_date, MAX(snapshot_date) as last_date
        FROM snapshots
      `);

      return {
        status: 'success',
        total_snapshots: snapshotCount.count,
        unique_shortages: uniqueShortages.count,
        status_changes: statusChanges.count,
        first_snapshot: dateRange.first_date,
        last_snapshot: dateRange.last_date,
        database_path: this.dbPath
      };

    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to get stats: ${error.message}`
      };
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      await new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.db = null;
      this.initialized = false;
    }
  }
}

export default HistoryService;
