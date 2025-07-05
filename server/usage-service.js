/**
 * Simple usage tracking service
 */
export class UsageService {
  constructor() {
    this.usageStats = {
      session_start: new Date().toISOString(),
      total_calls: 0,
      tool_usage: {}
    };
  }

  /**
   * Record usage of a tool
   */
  recordUsage(sessionId, toolName) {
    this.usageStats.total_calls++;
    
    if (!this.usageStats.tool_usage[toolName]) {
      this.usageStats.tool_usage[toolName] = 0;
    }
    this.usageStats.tool_usage[toolName]++;
    
    console.error(`Usage recorded: ${toolName} (session: ${sessionId})`);
  }

  /**
   * Get usage statistics for the current session
   */
  getSessionUsage(sessionId) {
    return {
      status: 'success',
      session_id: sessionId,
      session_start: this.usageStats.session_start,
      total_calls: this.usageStats.total_calls,
      tool_usage: { ...this.usageStats.tool_usage }
    };
  }

  /**
   * Get overall usage statistics
   */
  getAllUsageStats() {
    return {
      status: 'success',
      overall_stats: {
        session_start: this.usageStats.session_start,
        total_calls: this.usageStats.total_calls,
        tool_usage: { ...this.usageStats.tool_usage }
      }
    };
  }
}

export default UsageService;
