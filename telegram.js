import fetch from 'node-fetch';

export class TelegramNotifier {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(text, options = {}) {
    if (!this.botToken || !this.chatId) {
      console.warn('Telegram credentials not configured');
      return false;
    }

    const payload = {
      chat_id: this.chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    };

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (!data.ok) {
        console.error('Telegram API error:', data.description);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  }

  formatSignalMessage(signal) {
    const strengthEmoji = signal.strength === 'strong' ? '🔥' : '⚡';
    const timeframes = signal.confirmedTimeframes ? signal.confirmedTimeframes.join(', ') : 'N/A';
    
    let message = `${strengthEmoji} <b>${signal.strength.toUpperCase()} SIGNAL</b>\n\n`;
    message += `💰 <b>Pair:</b> ${signal.symbol}\n`;
    message += `📊 <b>Price:</b> $${signal.price}\n`;
    message += `📈 <b>24h Change:</b> ${signal.priceChange24h > 0 ? '+' : ''}${signal.priceChange24h}%\n\n`;
    
    message += `🎯 <b>Signals:</b>\n`;
    if (signal.macdSignal) {
      message += `• 4H MACD: ${signal.macdSignal.type} (${signal.macdSignal.strength} red candles)\n`;
    }
    if (signal.stochRSISignal) {
      message += `• 1D StochRSI: ${signal.stochRSISignal.type}${signal.stochRSISignal.oversold ? ' (oversold)' : ''}\n`;
    }
    message += `• Price above 10 MA: ${signal.priceAboveMA ? '✅' : '❌'}\n\n`;
    
    if (signal.strength === 'strong') {
      message += `🔄 <b>Confirmed Timeframes:</b> ${timeframes}\n\n`;
    }
    
    message += `⏰ <b>Time:</b> ${new Date(signal.timestamp).toLocaleString()}\n`;
    message += `🔗 <b>Chart:</b> https://www.bybit.com/trade/usdt/${signal.symbol.replace('USDT', '')}\n`;

    return message;
  }

  async sendSignalAlert(signal) {
    const message = this.formatSignalMessage(signal);
    return await this.sendMessage(message);
  }

  async sendBatchSignals(signals) {
    if (signals.length === 0) return;

    let message = `📊 <b>CRYPTO SIGNALS UPDATE</b>\n`;
    message += `📅 ${new Date().toLocaleString()}\n\n`;
    
    const strongSignals = signals.filter(s => s.strength === 'strong');
    const weakSignals = signals.filter(s => s.strength === 'weak');

    if (strongSignals.length > 0) {
      message += `🔥 <b>STRONG SIGNALS (${strongSignals.length}):</b>\n`;
      strongSignals.forEach(signal => {
        message += `• ${signal.symbol} - $${signal.price} (${signal.priceChange24h > 0 ? '+' : ''}${signal.priceChange24h}%)\n`;
      });
      message += '\n';
    }

    if (weakSignals.length > 0) {
      message += `⚡ <b>WEAK SIGNALS (${weakSignals.length}):</b>\n`;
      weakSignals.slice(0, 10).forEach(signal => {
        message += `• ${signal.symbol} - $${signal.price} (${signal.priceChange24h > 0 ? '+' : ''}${signal.priceChange24h}%)\n`;
      });
      
      if (weakSignals.length > 10) {
        message += `... and ${weakSignals.length - 10} more\n`;
      }
    }

    return await this.sendMessage(message);
  }

  async sendErrorAlert(error) {
    const message = `🚨 <b>SCREENER ERROR</b>\n\n` +
                   `❌ <b>Error:</b> ${error.message}\n` +
                   `⏰ <b>Time:</b> ${new Date().toLocaleString()}`;
    
    return await this.sendMessage(message);
  }
}