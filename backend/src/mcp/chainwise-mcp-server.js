const express    = require('express');
const { executeTool } = require('../agent/executor');
const { tools }       = require('../agent/tools');
const logger          = require('../../utils/logger');

const mcpApp = express();
mcpApp.use(express.json());

// ── MCP tool discovery ────────────────────────────────────────────────────
mcpApp.get('/mcp/tools', (req, res) => {
  res.json({
    tools: tools.map(t => ({
      name:        t.function.name,
      description: t.function.description,
      parameters:  t.function.parameters,
    })),
  });
});

// ── MCP tool execution ────────────────────────────────────────────────────
mcpApp.post('/mcp/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const input = req.body || {};

  logger.info(`[mcp] tool=${toolName}`);

  try {
    const result = await executeTool(toolName, input);
    res.json({ result });
  } catch (err) {
    logger.error(`[mcp] tool=${toolName} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────
mcpApp.get('/mcp/health', (_, res) => res.json({ status: 'ok' }));

const MCP_PORT = parseInt(process.env.MCP_PORT || '3001', 10);
mcpApp.listen(MCP_PORT, () => {
  logger.info(`ChainWise MCP server running on port ${MCP_PORT}`);
});