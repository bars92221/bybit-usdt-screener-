import crypto from 'crypto';
import fetch from 'node-fetch';

export class BybitAPI {
  constructor() {
    this.apiKey = process.env.BYBIT_API_KEY;
    this.secret = process.env.BYBIT_SECRET;
    this.testnet = process.env.BYBIT_TESTNET === 'true';
    this.baseUrl = this.testnet 
      ? 'https://api-testnet.bybit.com' 
      : 'https://api.bybit.com';
  }

  generateSignature(params) {
    const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHmac('sha256', this.secret).update(sortedParams).digest('hex');
  }

  async makeRequest(endpoint, params = {}) {
    const timestamp = Date.now();
    const requestParams = {
      ...params,
      api_key: this.apiKey,
      timestamp,
    };

    requestParams.sign = this.generateSignature(requestParams);
    
    const queryString = Object.keys(requestParams)
      .map(key => `${key}=${requestParams[key]}`)
      .join('&');

    const url = `${this.baseUrl}${endpoint}?${queryString}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.ret_code !== 0) {
        throw new Error(`Bybit API error: ${data.ret_msg}`);
      }
      
      return data.result;
    } catch (error) {
      console.error('Bybit API request failed:', error);
      throw error;
    }
  }

  async getInstruments() {
    try {
      const response = await fetch(`${this.baseUrl}/v5/market/instruments-info?category=linear`);
      const data = await response.json();
      
      if (data.retCode !== 0) {
        throw new Error(`Bybit API error: ${data.retMsg}`);
      }
      
      return data.result.list.filter(instrument => 
        instrument.quoteCoin === 'USDT' && 
        instrument.status === 'Trading'
      );
    } catch (error) {
      console.error('Failed to get instruments:', error);
      return [];
    }
  }

  async getKlines(symbol, interval, limit = 200) {
    try {
      const endTime = Date.now();
      const response = await fetch(
        `${this.baseUrl}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}&end=${endTime}`
      );
      
      const data = await response.json();
      
      if (data.retCode !== 0) {
        throw new Error(`Bybit API error: ${data.retMsg}`);
      }

      return data.result.list.map(kline => ({
        timestamp: parseInt(kline[0]),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      })).reverse(); // Bybit returns newest first, we want oldest first
    } catch (error) {
      console.error(`Failed to get klines for ${symbol}:`, error);
      return [];
    }
  }

  async getTicker(symbol) {
    try {
      const response = await fetch(
        `${this.baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`
      );
      
      const data = await response.json();
      
      if (data.retCode !== 0) {
        throw new Error(`Bybit API error: ${data.retMsg}`);
      }

      const ticker = data.result.list[0];
      return {
        symbol: ticker.symbol,
        lastPrice: parseFloat(ticker.lastPrice),
        priceChange24h: parseFloat(ticker.price24hPcnt),
        volume24h: parseFloat(ticker.volume24h)
      };
    } catch (error) {
      console.error(`Failed to get ticker for ${symbol}:`, error);
      return null;
    }
  }
}