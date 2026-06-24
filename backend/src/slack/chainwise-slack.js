const { App } = require('@slack/bolt');
const { runAgent } = require('../agent/loop');
const logger = require('../../utils/logger');

// ── In-memory thread conversation store ──────────────────────────────────
// Keyed by Slack thread_ts (or message ts for new threads)
// Each entry: [{ role: 'user'|'assistant', content: string }]
const threadHistory = new Map();
const MAX_HISTORY   = 20;   // messages per thread
const TTL_MS        = 30 * 60 * 1000; // 30 min — clear idle threads

function getHistory(threadId) {
  const entry = threadHistory.get(threadId);
  if (!entry) return [];
  // Refresh TTL on access
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
  // Keep only last MAX_HISTORY messages
  if (entry.messages.length > MAX_HISTORY) {
    entry.messages = entry.messages.slice(-MAX_HISTORY);
  }
}

// Clean up old threads every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of threadHistory.entries()) {
    if (now - val.lastAccess > TTL_MS) threadHistory.delete(key);
  }
}, 10 * 60 * 1000);

// ── Format agent markdown response for Slack ─────────────────────────────
function formatForSlack(text) {
  if (!text) return '_No response generated._';

  return text
    // Bold: **text** → *text*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // Tables: convert markdown table rows to monospace lines
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map(c => c.trim());
      return '`' + cells.join('  |  ') + '`';
    })
    // Remove table separator rows like |---|---|
    .replace(/^\|[-| :]+\|$/gm, '')
    // Code blocks: keep as-is (Slack renders ``` fine)
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Build Slack blocks from agent response ────────────────────────────────
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

  // ── Retry button ──────────────────────────────────────────────────────
  if (originalQuery) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '🔄 Retry', emoji: true },
        style: 'primary',
        action_id: 'retry_query',
        value: originalQuery.slice(0, 2000), // Slack value limit
      }],
    });
  }

  return blocks;
}

// ── Bolt App ──────────────────────────────────────────────────────────────
const app = new App({
  token:         process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode:    true,
  appToken:      process.env.SLACK_APP_TOKEN,
});

// ── Handle retry button clicks ────────────────────────────────────────────
app.action('retry_query', async ({ action, ack, say, body }) => {
  await ack(); // must acknowledge within 3 seconds

  const originalQuery = action.value;
  const threadId = body.message?.thread_ts || body.container?.message_ts;
  const messageTs = body.container?.message_ts;

  if (!originalQuery || !threadId) return;

  // Clear this thread's history so retry is fresh
  threadHistory.delete(threadId);

  await say({
    text: '🔄 Retrying...',
    thread_ts: messageTs,
  });

  await handleMessage({
    userText:  originalQuery,
    threadId,
    channelId: body.channel?.id,
    messageTs,
    say,
  });
});

// ── Shared handler for both mentions and DMs ──────────────────────────────
async function handleMessage({ userText, threadId, channelId, messageTs, say }) {
  if (!userText?.trim()) return;

  // Strip bot mention from text e.g. "<@U123ABC> fees on Binance"
  const cleanText = userText.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!cleanText) {
    await say({
      text: "Hey! I'm ChainWise — ask me about withdrawal fees, P2P rates, bridge routes, and more.",
      thread_ts: messageTs,
    });
    return;
  }

  // Load thread history and append user message
  const history = getHistory(threadId);
  appendHistory(threadId, 'user', cleanText);

  // Show thinking indicator
  try {
    await say({
      text: '⏳ Analyzing...',
      thread_ts: messageTs,
    });
  } catch (_) {}

  try {
    // Pass full conversation history to agent
    const allMessages = getHistory(threadId);
    const result = await runAgent(allMessages);

    // Save assistant reply to history
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

app.command('/chainwise', async ({ command, ack, say }) => {
  await ack(); // must acknowledge within 3 seconds

  const threadId = `slash-${command.channel_id}-${command.user_id}`;
  
  await handleMessage({
    userText:  command.text,
    threadId,
    channelId: command.channel_id,
    messageTs: command.channel_id,
    say,
  });
});

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
            text: '🌍 Built for Every crypto users • Live P2P rates • 9 exchanges • Real-time fee data'
          }]
        }
      ]
    }
  });
});


app.command('/chainwise-search', async ({ command, ack, client, say }) => {
  await ack();
  
  try {
    // RTS API — searches workspace messages
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


// ── Event: @ChainWise mention in any channel ──────────────────────────────
app.event('app_mention', async ({ event, say }) => {
  // threadId = thread root so whole thread shares history
  const threadId = event.thread_ts || event.ts;
  logger.info(`[slack] mention in ${event.channel} thread=${threadId}`);

  await handleMessage({
    userText:  event.text,
    threadId,
    channelId: event.channel,
    messageTs: event.ts,
    say,
  });
});

// ── Event: Direct message to the bot ─────────────────────────────────────
// ── Event: Direct message OR thread reply ────────────────────────────────
app.message(async ({ message, say }) => {
  if (message.bot_id || message.subtype) return;

  // Case 1: Direct message to bot
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

  // Case 2: Reply in a thread where bot has history
  // Only respond if this thread already has context (bot was already involved)
  if (message.thread_ts) {
    const threadId = message.thread_ts;
    const history = getHistory(threadId);
    if (history.length > 0) {
      // Bot is already part of this thread — respond to reply
      await handleMessage({
        userText:  message.text,
        threadId,
        channelId: message.channel,
        messageTs: message.thread_ts, // reply in same thread
        say,
      });
    }
  }
});

// ── Start ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    await app.start();
    logger.info('⚡ ChainWise Slack bot running');
  } catch (err) {
    logger.error('❌ Slack bot failed to start:', err.message);
  }
})();