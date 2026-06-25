# ChainWise Slack Integration — Complete Documentation

## Overview

ChainWise is a crypto fee intelligence agent originally built as a web application. This document covers the complete process of integrating ChainWise into Slack as part of the **Slack Agent Builder Challenge** hackathon on Devpost. The integration allows users to query withdrawal fees, P2P rates, bridge routes, zero-gas recovery plans, giveaways, and cross-exchange transfers directly inside a Slack workspace.

---

## Why Slack (Hackathon Context)

The Slack Agent Builder Challenge required participants to build an agent using at least one of three technologies:

- Slack AI capabilities & Agent Builder
- MCP (Model Context Protocol) server integration
- Real-Time Search (RTS) API

ChainWise was chosen for the **MCP server integration** track. The existing `executor.js` tool-dispatch system was a natural fit for an MCP server — it already defined 27+ tools in OpenAI function-call format, making the wrapper minimal.

Slack was chosen over Telegram for this project because:
- The prize is specifically for Slack agents — Telegram is not eligible
- Slack has enterprise distribution — companies pay per user, giving a B2B crypto tool real monetization potential
- The Marketplace track (highest prizes) requires Slack specifically
- Crypto treasury teams, fintech companies, and trading desks already use Slack

---

## Architecture

### How ChainWise Maps to Slack

```
Original Flow:
User → Web UI → runAgentStream() → Tools → Response

Slack Flow:
User → Slack message → Bolt event → runAgent() → Tools → Slack API → Response
```

The core agent logic — `runAgent()`, all 27+ tools in `executor.js`, the full `SYSTEM_PROMPT`, MongoDB, Redis, and all background jobs — remained completely unchanged. Slack is a new input/output layer only.

### Files Added

```
backend/
└── src/
    ├── slack/
    │   ├── chainwise-slack.js       ← Bolt app, event listeners, conversation memory
    │   └── formatResponse.js        ← Block Kit formatter (initial version)
    └── mcp/
        └── chainwise-mcp-server.js  ← MCP wrapper around executor.js
```

### Server.js Integration

One block was added inside the `start()` function in `server.js`, placed after `startTelegramGiveawayScanCron()` and before the Telegram bot initialization:

```javascript
if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
  try {
    require('./slack/chainwise-slack');
    require('./mcp/chainwise-mcp-server');
    logger.info('✅ Slack bot + MCP server started');
  } catch (err) {
    logger.error('❌ Failed to initialize Slack bot:', err?.message || String(err));
    logger.error('   Stack:', err?.stack || 'no stack');
    logger.error('   Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
  }
}
```

The `if` guard means the Slack bot only starts when tokens are present — the rest of the application is completely unaffected if Slack tokens are not configured.

---

## Slack Developer Setup

### Step 1 — Slack Developer Program

Visited `api.slack.com/developer-program` and clicked **Join the Program** to unlock the free developer sandbox.

### Step 2 — Provision Sandbox

At `api.slack.com/developer-program/sandboxes`, provisioned a sandbox with:
- **Sandbox name:** ChainWise Dev
- **Sandbox domain:** chainwise-dev (resolves to `chainwise-dev.enterprise.slack.com`)
- **Password:** set during provisioning
- **Event code:** left blank
- **Data templating:** Empty sandbox

Sandbox provisioning takes 30–60 seconds. After creation, signed in at `chainwise-dev.enterprise.slack.com` using the developer program email and the password set during provisioning.

### Step 3 — Create the Slack App

At `api.slack.com/apps`:
- Clicked **Create New App** → **From scratch**
- Named the app `ChainWise`
- Selected **ChainWise Dev** as the workspace

### Step 4 — Enable Socket Mode

Left sidebar → **Socket Mode** → toggled **ON**. Socket Mode means no public URL is needed — the bot connects outward to Slack via WebSocket, making it work seamlessly on Render without any webhook configuration.

### Step 5 — Generate App Token

During Socket Mode activation, generated an App-Level Token:
- Token name: `chainwise-token`
- Scope added: `connections:write`
- Token starts with `xapp-`

### Step 6 — Add Bot Token Scopes

Left sidebar → **OAuth & Permissions** → **Bot Token Scopes** → added:
- `app_mentions:read` — receive @ChainWise mentions
- `chat:write` — send messages as @ChainWise
- `im:history` — read DM history
- `im:read` — read DM metadata
- `im:write` — start DMs
- `assistant:write` — act as an App Agent
- `commands` — slash commands
- `links:write` — URL previews
- `message.channels` — receive channel messages (for thread replies)

### Step 7 — Enable Event Subscriptions

Left sidebar → **Event Subscriptions** → toggled **ON** → added bot events:
- `app_mention` — triggers when @ChainWise is mentioned
- `message.im` — triggers on DMs to the bot
- `message.channels` — triggers on channel messages (needed for thread reply persistence)
- `app_home_opened` — triggers when user opens the bot's Home tab

### Step 8 — Enable Interactivity

Left sidebar → **Interactivity & Shortcuts** → toggled **ON**. Since Socket Mode is enabled, no Request URL is required — Slack's confirmation message reads: *"Socket Mode is enabled. You won't need to specify a Request URL."*

Note: `interactivity:write` and `actions:read` are **not valid Slack scopes** — interactivity is a feature toggle, not a scope. The existing `chat:write` scope is sufficient for buttons to work.

### Step 9 — Enable Messages Tab (DMs)

Left sidebar → **App Home** → **Show Tabs** section → enabled **Messages Tab** → checked **"Allow users to send Slash commands and messages from the messages tab"**.

### Step 10 — Install App to Workspace

Left sidebar → **OAuth & Permissions** → **Install to Workspace** → **Allow**. This generates the Bot User OAuth Token starting with `xoxb-`.

### Step 11 — Environment Variables

Three tokens added to `.env`:
```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
```

The Signing Secret is found under **Basic Information** → **App Credentials**.

---

## Token Conflict: Local vs Render

A key discovery: Slack Socket Mode only allows **one active connection per App Token**. When both the local development server and the Render production deployment have the same tokens, the local instance fails silently with an empty error object.

**Resolution:** Comment out the Slack tokens in local `.env` when Render is running the bot:
```env
# SLACK_BOT_TOKEN=xoxb-...
# SLACK_APP_TOKEN=xapp-...
# SLACK_SIGNING_SECRET=...
```

The Render instance holds the active Socket Mode connection and serves the Slack workspace. Local development uses the backend for everything else.

---

## chainwise-slack.js — Full Implementation

### Conversation Memory System

The original implementation sent each message as a single-item array with no history, causing the bot to forget context after one response. A thread-based in-memory conversation store was implemented:

```javascript
const threadHistory = new Map();
const MAX_HISTORY   = 20;
const TTL_MS        = 30 * 60 * 1000; // 30 minutes

function getHistory(threadId) {
  const entry = threadHistory.get(threadId);
  if (!entry) return [];
  entry.lastAccess = Date.now();
  return entry.messages;
}

function appendHistory(threadId, role, content) {
  if (!threadHistory.has(threadId)) {
    threadHistory.set(threadId, { messages: [], lastAccess: Date.now() });
  }
  const entry = threadHistory.get(threadId);
  entry.messages.push({ role, content });
  entry.lastAccess = Date.now();
  if (entry.messages.length > MAX_HISTORY) {
    entry.messages = entry.messages.slice(-MAX_HISTORY);
  }
}

// Clean up idle threads every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of threadHistory.entries()) {
    if (now - val.lastAccess > TTL_MS) threadHistory.delete(key);
  }
}, 10 * 60 * 1000);
```

**Thread ID logic:**
- Channel mentions: `thread_ts` (root of the thread) so the whole thread shares one history
- DMs: `message.channel` (the DM channel itself acts as the thread)

### Markdown to Slack Formatting

Slack uses mrkdwn, not standard Markdown. A formatter converts the agent's output:

```javascript
function formatForSlack(text) {
  if (!text) return '_No response generated._';

  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')           // **bold** → *bold*
    .replace(/^\|(.+)\|$/gm, (_, row) => {        // table rows → monospace
      const cells = row.split('|').map(c => c.trim());
      return '`' + cells.join('  |  ') + '`';
    })
    .replace(/^\|[-| :]+\|$/gm, '')               // remove separator rows
    .replace(/\n{3,}/g, '\n\n')                   // clean excessive blank lines
    .trim();
}
```

### Block Kit Response Builder

Responses are split into 2900-character chunks (Slack's block limit is 3000) and wrapped in Block Kit blocks. A footer shows which tools were used, a divider separates content from metadata, and a Retry button allows re-running the same query:

```javascript
function buildBlocks(text, toolsUsed = [], originalQuery = '') {
  const formatted = formatForSlack(text);
  const chunks = [];
  let remaining = formatted;
  
  while (remaining.length > 2900) {
    const split = remaining.lastIndexOf('\n', 2900);
    chunks.push(remaining.slice(0, split > 0 ? split : 2900));
    remaining = remaining.slice(split > 0 ? split + 1 : 2900);
  }
  if (remaining.trim()) chunks.push(remaining.trim());

  const blocks = chunks.map(chunk => ({
    type: 'section',
    text: { type: 'mrkdwn', text: chunk },
  }));

  blocks.push({ type: 'divider' });

  const toolNames = toolsUsed?.length
    ? toolsUsed.map(t => `\`${t.tool}\``).join('  ')
    : null;

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: [
        toolNames ? `🔧 ${toolNames}` : null,
        '_Verify all fees on the exchange before transacting._',
      ].filter(Boolean).join('   •   '),
    }],
  });

  if (originalQuery) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '🔄 Retry', emoji: true },
        style: 'primary',
        action_id: 'retry_query',
        value: originalQuery.slice(0, 2000),
      }],
    });
  }

  return blocks;
}
```

### Shared Message Handler

Both mentions and DMs route through a single `handleMessage` function to avoid duplicating logic:

```javascript
async function handleMessage({ userText, threadId, channelId, messageTs, say }) {
  if (!userText?.trim()) return;

  const cleanText = userText.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!cleanText) {
    await say({
      text: "Hey! I'm ChainWise — ask me about withdrawal fees, P2P rates, bridge routes, and more.",
      thread_ts: messageTs,
    });
    return;
  }

  appendHistory(threadId, 'user', cleanText);

  try {
    await say({ text: '⏳ Analyzing...', thread_ts: messageTs });
  } catch (_) {}

  try {
    const allMessages = getHistory(threadId);
    const result = await runAgent(allMessages);

    if (result?.message) {
      appendHistory(threadId, 'assistant', result.message);
    }

    const blocks = buildBlocks(result?.message, result?.toolsUsed, cleanText);

    await say({
      text: result?.message?.slice(0, 200) || 'Here are the results:',
      blocks,
      thread_ts: messageTs,
    });
  } catch (err) {
    logger.error('[slack] handler error:', err.message);
    await say({
      text: '⚠️ Something went wrong. Please try again in a moment.',
      thread_ts: messageTs,
    });
  }
}
```

### Event Listeners

**@ChainWise mentions in channels:**
```javascript
app.event('app_mention', async ({ event, say }) => {
  const threadId = event.thread_ts || event.ts;
  await handleMessage({
    userText:  event.text,
    threadId,
    channelId: event.channel,
    messageTs: event.ts,
    say,
  });
});
```

**Direct messages and thread replies:**
```javascript
app.message(async ({ message, say }) => {
  if (message.bot_id || message.subtype) return;

  if (message.channel_type === 'im') {
    const threadId = message.channel;
    await handleMessage({
      userText:  message.text,
      threadId,
      channelId: message.channel,
      messageTs: message.ts,
      say,
    });
    return;
  }

  if (message.thread_ts) {
    const threadId = message.thread_ts;
    const history = getHistory(threadId);
    if (history.length > 0) {
      await handleMessage({
        userText:  message.text,
        threadId,
        channelId: message.channel,
        messageTs: message.thread_ts,
        say,
      });
    }
  }
});
```

**Retry button handler:**
```javascript
app.action('retry_query', async ({ action, ack, say, body }) => {
  await ack();

  const originalQuery = action.value;
  const threadId  = body.message?.thread_ts || body.container?.message_ts;
  const messageTs = body.container?.message_ts;

  if (!originalQuery || !threadId) return;

  threadHistory.delete(threadId); // clear history for fresh retry

  await say({ text: '🔄 Retrying...', thread_ts: messageTs });

  await handleMessage({
    userText:  originalQuery,
    threadId,
    channelId: body.channel?.id,
    messageTs,
    say,
  });
});
```

**App Home tab:**
```javascript
app.event('app_home_opened', async ({ event, client }) => {
  await client.views.publish({
    user_id: event.user,
    view: {
      type: 'home',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⚡ ChainWise — Crypto Fee Intelligence' }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*What can I help you with?*\nI compare withdrawal fees, find P2P rates, plan cross-exchange transfers, and recover stuck tokens — all in real time.'
          }
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Try these examples:*\n• `@ChainWise USDT fees on Binance`\n• `@ChainWise P2P rates in Kenya`\n• `@ChainWise move 500 USDT from Binance to Bybit`\n• `@ChainWise I have ETH stuck on Arbitrum, I\'m in Kenya`\n• `/chainwise compare USDT across all exchanges`'
          }
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: '🌍 Built for African crypto users • Live P2P rates • 9 exchanges • Real-time fee data'
          }]
        }
      ]
    }
  });
});
```

### Correct Code Order in chainwise-slack.js

The order matters — `app.action`, `app.event`, and `app.message` must all come **after** `const app = new App({...})`. Placing them before caused a `ReferenceError: Cannot access 'app' before initialization` that produced a completely empty error object in Winston logs.

Correct order:
1. `require` statements and imports
2. `threadHistory` Map and helper functions (`getHistory`, `appendHistory`, cleanup interval)
3. `formatForSlack()` function
4. `buildBlocks()` function
5. `handleMessage()` function
6. `const app = new App({...})` — Bolt app instantiation
7. `app.action('retry_query', ...)` — button handler
8. `app.event('app_home_opened', ...)` — home tab handler
9. `app.event('app_mention', ...)` — mention handler
10. `app.message(...)` — DM and thread reply handler
11. `app.start()` — starts the bot

---

## chainwise-mcp-server.js — MCP Server

Wraps `executor.js` as an MCP-compliant Express server on port 3001. The Slack Agent Builder can auto-discover ChainWise's tools via the discovery endpoint.

```javascript
const express         = require('express');
const { executeTool } = require('../agent/executor');
const { tools }       = require('../agent/tools');
const logger          = require('../../utils/logger');

const mcpApp = express();
mcpApp.use(express.json());

// Tool discovery
mcpApp.get('/mcp/tools', (req, res) => {
  res.json({
    tools: tools.map(t => ({
      name:        t.function.name,
      description: t.function.description,
      parameters:  t.function.parameters,
    })),
  });
});

// Tool execution
mcpApp.post('/mcp/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const input = req.body || {};
  try {
    const result = await executeTool(toolName, input);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
mcpApp.get('/mcp/health', (_, res) => res.json({ status: 'ok' }));

const MCP_PORT = parseInt(process.env.MCP_PORT || '3001', 10);
mcpApp.listen(MCP_PORT, () => {
  logger.info(`ChainWise MCP server running on port ${MCP_PORT}`);
});
```

---

## Bug Fixed: generateExampleSteps is not defined

When users asked about giveaways, the agent called `getGiveawayDetails` which internally called `analyzeParticipation()`, which in turn referenced `generateExampleSteps` — a function that was never defined. This caused the error:

```
Could not retrieve giveaways: generateExampleSteps is not defined
```

The fix replaced the broken function with a self-contained implementation:

```javascript
async function getGiveawayDetails({ giveawayId, exchange }) {
  try {
    const Giveaway = require('../models/Giveaway');
    let doc = await Giveaway.findOne({ tweetId: giveawayId });
    if (!doc && exchange) {
      doc = await Giveaway.findOne({ exchange, isActive: true }).sort({ confidence: -1 });
    }
    if (!doc) return { error: 'Giveaway not found' };

    const requirements = doc.requirements || [];
    const steps = [];
    if (requirements.includes('follow'))   steps.push(`1. Follow @${doc.exchange} on X/Twitter`);
    if (requirements.includes('repost') || requirements.includes('retweet')) steps.push(`2. Repost/Retweet the post`);
    if (requirements.includes('reply')  || requirements.includes('comment'))  steps.push(`3. Reply with the required text`);
    if (requirements.includes('tag'))      steps.push(`4. Tag 2-3 friends in the comments`);
    if (steps.length === 0) steps.push('Check the original post for participation requirements');

    return {
      tweetId:            doc.tweetId,
      exchange:           doc.exchange,
      prizePool:          doc.prizePool,
      currency:           doc.currency,
      confidence:         doc.confidence,
      postUrl:            doc.postUrl || `https://x.com/i/web/status/${doc.tweetId}`,
      requirements,
      participationGuide: steps,
      riskLevel:          doc.confidence >= 80 ? 'low' : doc.confidence >= 60 ? 'medium' : 'high',
      warning:            doc.confidence < 60
        ? '⚠️ Low confidence — verify this is an official post before participating.'
        : null,
    };
  } catch (err) {
    return { error: err.message };
  }
}
```

---

## Slash Command Added

A `/chainwise` slash command was registered in the Slack app settings (left sidebar → **Slash Commands** → **Create New Command**):

- **Command:** `/chainwise`
- **Description:** Query crypto fees, P2P rates, and bridge routes
- **Usage hint:** `[your question]`

Handler in `chainwise-slack.js`:

```javascript
app.command('/chainwise', async ({ command, ack, say }) => {
  await ack();
  const threadId = `slash-${command.channel_id}-${command.user_id}`;
  await handleMessage({
    userText:  command.text,
    threadId,
    channelId: command.channel_id,
    messageTs: command.channel_id,
    say,
  });
});
```

---

## Real-Time Search (RTS) API — Hackathon Requirement

To satisfy the RTS API requirement from the hackathon, a `/chainwise-search` slash command was added that searches the Slack workspace for past fee discussions:

```javascript
app.command('/chainwise-search', async ({ command, ack, client, say }) => {
  await ack();
  try {
    const results = await client.search.messages({
      query: command.text,
      count: 3,
    });

    const hits = results?.messages?.matches || [];
    if (hits.length === 0) {
      await say({ text: `No past discussions found for: _${command.text}_` });
      return;
    }

    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Past discussions about "${command.text}":*` }
      },
      ...hits.map(hit => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${hit.permalink}|View message> — ${hit.text?.slice(0, 150)}...`
        }
      }))
    ];

    await say({ blocks, text: 'Search results' });
  } catch (err) {
    await say({ text: `Search unavailable: ${err.message}` });
  }
});
```

The `search:read` scope was added to Bot Token Scopes to enable this.

---

## Deployment on Render

Slack works on Render with zero additional configuration beyond environment variables. Socket Mode connects outward from the server — Render's public URL is irrelevant for Slack functionality.

Add to Render environment variables:
```
SLACK_BOT_TOKEN      = xoxb-...
SLACK_SIGNING_SECRET = ...
SLACK_APP_TOKEN      = xapp-...
```

Redeploy after adding variables. No webhook URLs, no port forwarding, no ngrok needed.

---

## Known Limitations

**Conversation persistence:** Thread history lives in-memory. If the server restarts, all conversation context is lost. Users must start a new thread to re-establish context. A Redis-backed solution could persist conversations across restarts but was not implemented.

**Retry button:** Clears thread history completely before retrying. This is intentional — retries are meant to be fresh queries, not continuations.

**Thread reply detection:** The bot only responds to thread replies in channels where it has already participated (i.e., where `getHistory(threadId).length > 0`). Cold thread replies without a prior bot message are ignored.

**Socket Mode single connection:** Only one instance can connect per App Token simultaneously. Running locally and on Render at the same time causes the local instance to fail silently.

**DM formatting:** The `thread_ts` parameter is not used in DM `say()` calls since DMs don't use threading in the same way as channels.

---

## Hackathon Submission Checklist

| Requirement | Status |
|---|---|
| Slack Developer Program joined | ✅ |
| Free sandbox provisioned | ✅ |
| At least one of three technologies used | ✅ MCP server on port 3001 |
| Agent responds to @mentions | ✅ |
| Agent responds to DMs | ✅ |
| Agent responds to thread replies | ✅ |
| Conversation context persists across thread | ✅ |
| Retry button on every response | ✅ |
| App Home tab configured | ✅ |
| Slash command registered | ✅ |
| RTS API used | ✅ `/chainwise-search` |
| Deployed on Render | ✅ |
| Demo video recorded | ⬜ |
| Devpost submission complete | ⬜ |

---

## Demo Script (for recording)

The recommended demo flow for the hackathon video — judges spend 5–7 minutes per project, first 60 seconds are critical:

1. Open ChainWise Dev workspace in Slack
2. In #general: `@ChainWise I have 97 USDC stuck on Arbitrum with no gas, I'm in Kenya` — shows the zero-gas recovery flow (most impressive, most unique)
3. Reply in the same thread: `bybit` — shows conversation persistence
4. New message: `@ChainWise compare USDT fees across all exchanges` — shows the fee comparison table
5. New message: `@ChainWise P2P rates in Kenya` — shows live P2P data
6. Open the ChainWise app directly → show the Home tab
7. Type `/chainwise move 500 USDT from Binance to Bybit` — shows slash command

Total runtime: approximately 3–4 minutes.