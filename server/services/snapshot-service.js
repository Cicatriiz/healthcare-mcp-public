import Database from 'better-sqlite3';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SnapshotService {
  constructor() {
    this.dbPath = path.join(__dirname, '../../data/shortage-snapshots.db');
    this.db = null;
    this.cronJob = null;
    this.shortageService = null;
  }

  /**
   * Initialize the database and create tables if needed
   */
  initialize() {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Open database connection
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');

    // Create tables
    this.createTables();

    console.log('📸 Snapshot service initialized');
    console.log(`   Database: ${this.dbPath}`);
  }

  /**
   * Create database schema
   */
  createTables() {
    // Snapshots metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        total_shortages INTEGER NOT NULL,
        active_shortages INTEGER NOT NULL,
        resolved_shortages INTEGER NOT NULL,
        discontinuations INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Individual shortage records
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shortage_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        ndc TEXT,
        generic_name TEXT,
        product_name TEXT,
        status TEXT,
        reason TEXT,
        manufacturer TEXT,
        discontinuation_date TEXT,
        estimated_resolution TEXT,
        therapeutic_category TEXT,
        dosage_form TEXT,
        route TEXT,
        FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
      );
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(snapshot_date);
      CREATE INDEX IF NOT EXISTS idx_shortage_records_snapshot ON shortage_records(snapshot_id);
      CREATE INDEX IF NOT EXISTS idx_shortage_records_ndc ON shortage_records(ndc);
      CREATE INDEX IF NOT EXISTS idx_shortage_records_status ON shortage_records(status);
      CREATE INDEX IF NOT EXISTS idx_shortage_records_generic ON shortage_records(generic_name);
    `);
  }

  /**
   * Set the shortage service reference (for fetching live data)
   */
  setShortageService(shortageService) {
    this.shortageService = shortageService;
  }

  /**
   * Take a snapshot of current shortage data
   */
  async takeSnapshot() {
    if (!this.shortageService) {
      console.error('❌ Shortage service not set - cannot take snapshot');
      return null;
    }

    try {
      console.log('📸 Taking shortage snapshot...');

      // Fetch current shortage data (get all shortages with high limit)
      const result = await this.shortageService.fetchShortages({ limit: 10000, skip: 0 });

      if (result.status === 'error' || !result.data || result.data.length === 0) {
        console.warn('⚠️  No shortage data available for snapshot');
        return null;
      }

      const shortages = result.data;

      // Calculate statistics
      const stats = {
        total: shortages.length,
        active: shortages.filter(s => s.status === 'Currently in Shortage').length,
        resolved: shortages.filter(s => s.status === 'Resolved').length,
        discontinued: shortages.filter(s => s.discontinuation_date).length
      };

      const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const timestamp = Date.now();

      // Begin transaction
      const insertSnapshot = this.db.prepare(`
        INSERT INTO snapshots (snapshot_date, timestamp, total_shortages, active_shortages, resolved_shortages, discontinuations)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertRecord = this.db.prepare(`
        INSERT INTO shortage_records (
          snapshot_id, ndc, generic_name, product_name, status, reason,
          manufacturer, discontinuation_date, estimated_resolution,
          therapeutic_category, dosage_form, route
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction(() => {
        // Insert snapshot metadata
        const result = insertSnapshot.run(
          snapshotDate,
          timestamp,
          stats.total,
          stats.active,
          stats.resolved,
          stats.discontinued
        );

        const snapshotId = result.lastInsertRowid;

        // Insert individual shortage records
        for (const shortage of shortages) {
          insertRecord.run(
            snapshotId,
            shortage.ndc || null,
            shortage.generic_name || null,
            shortage.product_name || null,
            shortage.status || null,
            shortage.reason || null,
            shortage.manufacturer || null,
            shortage.discontinuation_date || null,
            shortage.estimated_resolution || null,
            shortage.therapeutic_category || null,
            shortage.dosage_form || null,
            shortage.route || null
          );
        }

        return snapshotId;
      });

      const snapshotId = transaction();

      console.log(`✅ Snapshot complete! ID: ${snapshotId}`);
      console.log(`   Date: ${snapshotDate}`);
      console.log(`   Total: ${stats.total} | Active: ${stats.active} | Resolved: ${stats.resolved} | Discontinued: ${stats.discontinued}`);

      return snapshotId;
    } catch (error) {
      console.error('❌ Error taking snapshot:', error);
      return null;
    }
  }

  /**
   * Start the daily snapshot scheduler
   * Default: Every day at midnight (00:00)
   */
  startScheduler(cronExpression = '0 0 * * *') {
    if (this.cronJob) {
      console.log('⚠️  Snapshot scheduler already running');
      return;
    }

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`❌ Invalid cron expression: ${cronExpression}`);
      return;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log('⏰ Scheduled snapshot triggered');
      await this.takeSnapshot();
    });

    console.log('⏰ Snapshot scheduler started');
    console.log(`   Schedule: ${cronExpression} (daily at midnight)`);
  }

  /**
   * Stop the scheduler
   */
  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Snapshot scheduler stopped');
    }
  }

  /**
   * Get all snapshots metadata
   */
  getAllSnapshots() {
    const stmt = this.db.prepare(`
      SELECT * FROM snapshots
      ORDER BY snapshot_date DESC
    `);
    return stmt.all();
  }

  /**
   * Get snapshot by ID with all records
   */
  getSnapshotById(snapshotId) {
    const snapshotStmt = this.db.prepare('SELECT * FROM snapshots WHERE id = ?');
    const recordsStmt = this.db.prepare('SELECT * FROM shortage_records WHERE snapshot_id = ?');

    const snapshot = snapshotStmt.get(snapshotId);
    if (!snapshot) return null;

    const records = recordsStmt.all(snapshotId);

    return {
      ...snapshot,
      records
    };
  }

  /**
   * Get snapshots within a date range
   */
  getSnapshotsByDateRange(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT * FROM snapshots
      WHERE snapshot_date BETWEEN ? AND ?
      ORDER BY snapshot_date ASC
    `);
    return stmt.all(startDate, endDate);
  }

  /**
   * Get trend data for a specific drug (by NDC or generic name)
   */
  getDrugTrend(ndc = null, genericName = null) {
    if (!ndc && !genericName) {
      throw new Error('Must provide either NDC or generic name');
    }

    let query;
    let params;

    if (ndc) {
      query = `
        SELECT
          s.snapshot_date,
          s.timestamp,
          sr.status,
          sr.reason,
          sr.manufacturer,
          sr.estimated_resolution
        FROM shortage_records sr
        JOIN snapshots s ON sr.snapshot_id = s.id
        WHERE sr.ndc = ?
        ORDER BY s.snapshot_date ASC
      `;
      params = [ndc];
    } else {
      query = `
        SELECT
          s.snapshot_date,
          s.timestamp,
          sr.ndc,
          sr.status,
          sr.reason,
          sr.manufacturer,
          sr.estimated_resolution
        FROM shortage_records sr
        JOIN snapshots s ON sr.snapshot_id = s.id
        WHERE sr.generic_name = ?
        ORDER BY s.snapshot_date ASC
      `;
      params = [genericName];
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get overall trend statistics
   */
  getTrendStatistics() {
    const stmt = this.db.prepare(`
      SELECT
        snapshot_date,
        total_shortages,
        active_shortages,
        resolved_shortages,
        discontinuations
      FROM snapshots
      ORDER BY snapshot_date ASC
    `);
    return stmt.all();
  }

  /**
   * Get statistics for the most recent snapshot
   */
  getLatestSnapshot() {
    const stmt = this.db.prepare(`
      SELECT * FROM snapshots
      ORDER BY snapshot_date DESC, timestamp DESC
      LIMIT 1
    `);
    return stmt.get();
  }

  /**
   * Clean up old snapshots (keep last N days)
   */
  cleanupOldSnapshots(keepDays = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      DELETE FROM snapshots
      WHERE snapshot_date < ?
    `);

    const result = stmt.run(cutoffDateStr);
    console.log(`🧹 Cleaned up ${result.changes} old snapshots (keeping last ${keepDays} days)`);
    return result.changes;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('📪 Snapshot database closed');
    }
  }
}

// Export singleton instance
const snapshotService = new SnapshotService();
export default snapshotService;
