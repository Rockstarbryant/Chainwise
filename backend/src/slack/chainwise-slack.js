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
function buildBlocks(text, toolsUsed = []) {
  const formatted = formatForSlack(text);

  // Split into chunks of max 2900 chars (Slack block limit is 3000)
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

  // Divider before footer
  blocks.push({ type: 'divider' });

  // Footer: tools used + tip
  const toolNames = toolsUsed?.length
    ? toolsUsed.map(t => `\`${t.tool}\``).join('  ')
    : null;

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: [
          toolNames ? `🔧 ${toolNames}` : null,
          '_Verify all fees on the exchange before transacting._',
        ].filter(Boolean).join('   •   '),
      },
    ],
  });

  return blocks;
}

// ── Bolt App ──────────────────────────────────────────────────────────────
const app = new App({
  token:         process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode:    true,
  appToken:      process.env.SLACK_APP_TOKEN,
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

    const blocks = buildBlocks(result?.message, result?.toolsUsed);

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