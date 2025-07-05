#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from 'crypto';

// Import our tools and services
import { CacheService } from './cache-service.js';
import { FDATool } from './fda-tool.js';
import { PubMedTool } from './pubmed-tool.js';
import { HealthTopicsTool } from './health-topics-tool.js';
import { ClinicalTrialsTool } from './clinical-trials-tool.js';
import { MedicalTerminologyTool } from './medical-terminology-tool.js';
import { UsageService } from './usage-service.js';

// Initialize services
const cacheService = new CacheService(parseInt(process.env.CACHE_TTL) || 86400);
const usageService = new UsageService();

// Initialize tools
const fdaTool = new FDATool(cacheService);
const pubmedTool = new PubMedTool(cacheService);
const healthTopicsTool = new HealthTopicsTool(cacheService);
const clinicalTrialsTool = new ClinicalTrialsTool(cacheService);
const medicalTerminologyTool = new MedicalTerminologyTool(cacheService);

// Generate a unique session ID for this connection
const sessionId = randomUUID();

// Create MCP server
const server = new Server(
  {
    name: "healthcare-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  return {
    tools: [
      {
        name: "fda_drug_lookup",
        description: "Look up drug information from the FDA database",
        inputSchema: {
          type: "object",
          properties: {
            drug_name: {
              type: "string",
              description: "Name of the drug to search for",
            },
            search_type: {
              type: "string",
              description: "Type of information to retrieve: 'label', 'adverse_events', or 'general'",
              enum: ["general", "label", "adverse_events"],
              default: "general",
            },
          },
          required: ["drug_name"],
        },
      },
      {
        name: "pubmed_search",
        description: "Search for medical literature in PubMed database",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for medical literature",
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return",
              default: 5,
              minimum: 1,
              maximum: 100,
            },
            date_range: {
              type: "string",
              description: "Limit to articles published within years (e.g. '5' for last 5 years)",
              default: "",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "health_topics",
        description: "Get evidence-based health information on various topics",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "Health topic to search for information",
            },
            language: {
              type: "string",
              description: "Language for content (en or es)",
              enum: ["en", "es"],
              default: "en",
            },
          },
          required: ["topic"],
        },
      },
      {
        name: "clinical_trials_search",
        description: "Search for clinical trials by condition, status, and other parameters",
        inputSchema: {
          type: "object",
          properties: {
            condition: {
              type: "string",
              description: "Medical condition or disease to search for",
            },
            status: {
              type: "string",
              description: "Trial status",
              enum: ["recruiting", "completed", "active", "not_recruiting", "all"],
              default: "recruiting",
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return",
              default: 10,
              minimum: 1,
              maximum: 100,
            },
          },
          required: ["condition"],
        },
      },
      {
        name: "lookup_icd_code",
        description: "Look up ICD-10 codes by code or description",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "ICD-10 code to look up (optional if description is provided)",
            },
            description: {
              type: "string",
              description: "Medical condition description to search for (optional if code is provided)",
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return",
              default: 10,
              minimum: 1,
              maximum: 50,
            },
          },
        },
      },
      {
        name: "get_usage_stats",
        description: "Get usage statistics for the current session",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_all_usage_stats",
        description: "Get overall usage statistics for all sessions",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Record usage
    usageService.recordUsage(sessionId, name);

    let result;

    switch (name) {
      case "fda_drug_lookup":
        result = await fdaTool.lookupDrug(args.drug_name, args.search_type);
        break;

      case "pubmed_search":
        result = await pubmedTool.searchLiterature(args.query, args.max_results, args.date_range);
        break;

      case "health_topics":
        result = await healthTopicsTool.getHealthTopics(args.topic, args.language);
        break;

      case "clinical_trials_search":
        result = await clinicalTrialsTool.searchTrials(args.condition, args.status, args.max_results);
        break;

      case "lookup_icd_code":
        result = await medicalTerminologyTool.lookupICDCode(args.code, args.description, args.max_results);
        break;

      case "get_usage_stats":
        result = usageService.getSessionUsage(sessionId);
        break;

      case "get_all_usage_stats":
        result = usageService.getAllUsageStats();
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "error",
            error_message: error.message,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);

console.error("Healthcare MCP Node.js server running...");
console.error(`Session ID: ${sessionId}`);
console.error(`Cache TTL: ${cacheService.cache.options.stdTTL} seconds`);
