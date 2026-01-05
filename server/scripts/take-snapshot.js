#!/usr/bin/env node

/**
 * Daily Snapshot Script
 *
 * Takes a snapshot of current FDA shortage data and stores it in the history database.
 * Run this script daily via cron to build historical data.
 *
 * Example crontab entry (runs daily at 2 AM):
 * 0 2 * * * cd /path/to/healthcare-mcp-public && node server/scripts/take-snapshot.js
 *
 * Or run manually:
 * node server/scripts/take-snapshot.js
 */

import { CacheService } from '../cache-service.js';
import { FDAShortageTool } from '../fda-shortage-tool.js';
import { HistoryService } from '../services/history-service.js';

async function main() {
  console.log('='.repeat(60));
  console.log('FDA Drug Shortage Daily Snapshot');
  console.log(new Date().toISOString());
  console.log('='.repeat(60));

  const cacheService = new CacheService(3600); // 1 hour cache
  const fdaShortageTool = new FDAShortageTool(cacheService);
  const historyService = new HistoryService();

  try {
    // Initialize history service
    await historyService.initialize();

    // Take snapshot
    const result = await historyService.takeSnapshot(fdaShortageTool);

    if (result.status === 'success') {
      console.log('\n✓ Snapshot completed successfully:');
      console.log(`  Date: ${result.snapshot_date}`);
      console.log(`  Total shortages: ${result.total}`);
      console.log(`  Active: ${result.active}`);
      console.log(`  Resolved: ${result.resolved}`);
      console.log(`  New today: ${result.new}`);
      console.log(`  Newly resolved: ${result.newly_resolved}`);
      console.log(`  Duration: ${result.duration_ms}ms`);

      // Get database stats
      const stats = await historyService.getStats();
      if (stats.status === 'success') {
        console.log('\nDatabase Statistics:');
        console.log(`  Total snapshots: ${stats.total_snapshots}`);
        console.log(`  Unique shortages tracked: ${stats.unique_shortages}`);
        console.log(`  Status changes recorded: ${stats.status_changes}`);
        console.log(`  First snapshot: ${stats.first_snapshot}`);
        console.log(`  Last snapshot: ${stats.last_snapshot}`);
        console.log(`  Database: ${stats.database_path}`);
      }

      // Clean exit
      await historyService.close();
      process.exit(0);

    } else {
      console.error('\n✗ Snapshot failed:');
      console.error(`  Error: ${result.error_message}`);
      await historyService.close();
      process.exit(1);
    }

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();
