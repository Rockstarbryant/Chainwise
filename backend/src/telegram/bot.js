// backend/src/telegram/bot.js
const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const axios = require('axios');
const logger = require('../../utils/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://chainwise-seven.vercel.app';

class TelegramBot {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    this.apiUrl = process.env.API_URL || 'http://localhost:5000';
    this.userMessageCount = new Map();
    this.conversations = new Map();
    this.bot = null;

    if (!this.token) {
      logger.warn('⚠️ TELEGRAM_BOT_TOKEN missing');
      return;
    }

    this.bot = new Telegraf(this.token);
    logger.info('✅ Telegraf instance created successfully');
  }

  async sendToAgent(messages) {
    try {
      const res = await axios.post(`${this.apiUrl}/api/agent`, { messages }, { timeout: 40000 });
      return res.data?.data || { message: "No response" };
    } catch (error) {
      logger.error('Agent API error:', error.message);
      return { message: "Connection issue. Try again." };
    }
  }

  async getFeeComparison(coin) {
    try {
      const res = await axios.get(`${this.apiUrl}/api/fees/compare?coin=${coin.toUpperCase()}`);
      return res.data.data;
    } catch (error) {
      logger.error(`Fee comparison failed for ${coin}:`, error.message);
      return null;
    }
  }

  escapeMarkdownV2(text) {
    if (!text) return '';
    return String(text).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  formatFeeTable(data) {
    if (!data || !data.comparison || data.comparison.length === 0) {
      return "No fee data found for this token.";
    }

    let text = `*${data.coin} Withdrawal Fees — Ranked Cheapest First*\n\n`;

    data.comparison.slice(0, 8).forEach((row, i) => {
      const fee = row.withdrawFee === 0 ? "FREE" : `${row.withdrawFee} ${data.coin}`;
      const usd = row.withdrawFeeUSD ? ` (~$${row.withdrawFeeUSD.toFixed(2)})` : '';
      text += `${i+1}. *${row.exchange}* — ${row.cheapestChain}\n`;
      text += `   ${fee}${usd} | Min: ${row.minWithdraw}\n\n`;
    });

    text += `🔗 [View Full Table on Website](${FRONTEND_URL}/fees?coin=${data.coin})`;
    return text;
  }

  start() {
    if (!this.bot) return;

    this.bot.command('start', (ctx) => {
      this.conversations.set(ctx.from.id, []);
      ctx.replyWithMarkdownV2(
        '👋 *Welcome to ChainWise\\!*\n\n' +
        'Just type a token like *USDT*, *ETH*, *BTC* and I\'ll show you the cheapest withdrawal fees instantly\\.\n\n' +
        'Or ask anything else\\.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "💰 USDT Fees", callback_data: "quick_usdt" }],
              [{ text: "🌉 Bridge Routes", callback_data: "quick_bridge" }],
              [{ text: "🇰🇪 P2P Kenya", callback_data: "quick_p2p_kenya" }],
              [{ text: "📊 All Fees", url: `${FRONTEND_URL}/fees` }]
            ]
          }
        }
      );
    });

    // Button handler
    this.bot.on('callback_query', async (ctx) => {
      const data = ctx.callbackQuery.data;
      await ctx.answerCbQuery();

      let prompt = '';
      if (data === 'quick_usdt') prompt = 'USDT';
      else if (data === 'quick_bridge') prompt = 'Best bridge from Ethereum to Base';
      else if (data === 'quick_p2p_kenya') prompt = 'P2P USDT KES Kenya';

      if (prompt) {
        await ctx.editMessageText('🔍 Fetching data...');
        const result = data === 'quick_usdt' 
          ? await this.getFeeComparison('USDT')
          : await this.sendToAgent([{ role: "user", content: prompt }]);

        const text = result.comparison ? this.formatFeeTable(result) : result.message;
        await ctx.editMessageText(this.escapeMarkdownV2(text), { 
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true 
        });
      }
    });

    // Main message handler — Smart Fee Detection
    this.bot.on(message('text'), async (ctx) => {
      const text = ctx.message.text.trim().toUpperCase();
      const userId = ctx.from.id;

      if (text.startsWith('/')) return;

      // Rate limiting
      const now = Date.now();
      if (!this.userMessageCount.has(userId)) this.userMessageCount.set(userId, []);
      let hist = this.userMessageCount.get(userId).filter(t => now - t < 900000);
      hist.push(now);
      this.userMessageCount.set(userId, hist);
      if (hist.length > 12) return ctx.reply("⏳ Too fast. Wait 30s.");

      await ctx.sendChatAction('typing');

      // === SMART DETECTION: If user types a common token, show fee table ===
      const commonTokens = ['USDT', 'USDC', 'ETH', 'BTC', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'];
      
      if (commonTokens.includes(text) || text.length <= 6) {
        const feeData = await this.getFeeComparison(text);
        if (feeData && feeData.comparison && feeData.comparison.length > 0) {
          const formatted = this.formatFeeTable(feeData);
          return ctx.reply(this.escapeMarkdownV2(formatted), { 
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true 
          });
        }
      }

      // Fallback to AI Agent with memory
      if (!this.conversations.has(userId)) this.conversations.set(userId, []);
      const conv = this.conversations.get(userId);
      conv.push({ role: "user", content: text });
      if (conv.length > 20) conv.splice(0, 10);

      try {
        const result = await this.sendToAgent(conv);
        conv.push({ role: "assistant", content: result.message });

        let reply = result.message;
        if (reply.length > 4000) reply = reply.slice(0, 3990) + "\n\n...";

        await ctx.reply(this.escapeMarkdownV2(reply), { parse_mode: 'MarkdownV2' });
      } catch (err) {
        await ctx.reply("❌ Something went wrong. Try again.");
      }
    });

    this.bot.launch()
      .then(() => logger.info('🚀 Telegram Bot with Smart Fee Detection is LIVE!'))
      .catch(err => logger.warn('Bot launch warning:', err.message));
  }
}

module.exports = new TelegramBot();