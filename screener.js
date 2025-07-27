import { BybitAPI } from './bybitAPI.js';
import { TechnicalIndicators } from './indicators.js';
import { TelegramNotifier } from './telegram.js';

export class CryptoScreener {
  constructor() {
    this.api = new BybitAPI();
    this.telegram = new TelegramNotifier();
    this.signals = [];
    this.processedSignals = new Set(); // For deduplication
    this.isScanning = false;
    this.scanInterval = null;
    this.instruments = [];
  }

  async initialize() {
    console.log('Initializing crypto screener...');
    try {
      this.instruments = await this.api.getInstruments();
      console.log(`Loaded ${this.instruments.length} USDT futures pairs`);
    } catch (error) {
      console.error('Failed to initialize screener:', error);
      await this.telegram.sendErrorAlert(error);
    }
  }

  async scanMarket() {
    if (this.isScanning) {
      console.log('Scan already in progress, skipping...');
      return;
    }

    this.isScanning = true;
    console.log('Starting market scan...');

    try {
      if (this.instruments.length === 0) {
        await this.initialize();
      }

      const newSignals = [];
      const batchSize = 5; // Process 5 pairs at a time to avoid rate limits

      for (let i = 0; i < this.instruments.length; i += batchSize) {
        const batch = this.instruments.slice(i, i + batchSize);
        const batchPromises = batch.map(instrument => this.analyzePair(instrument.symbol));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            newSignals.push(result.value);
          } else if (result.status === 'rejected') {
            console.error(`Failed to analyze ${batch[index].symbol}:`, result.reason);
          }
        });

        // Small delay between batches to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Filter out duplicates and update signals
      const uniqueNewSignals = newSignals.filter(signal => {
        const signalKey = `${signal.symbol}_${signal.timestamp}_${signal.strength}`;
        if (this.processedSignals.has(signalKey)) {
          return false;
        }
        this.processedSignals.add(signalKey);
        return true;
      });

      // Clean old processed signals (keep last 1000)
      if (this.processedSignals.size > 1000) {
        const oldSignals = Array.from(this.processedSignals).slice(0, -500);
        oldSignals.forEach(signal => this.processedSignals.delete(signal));
      }

      // Update signals list
      this.signals = [...uniqueNewSignals, ...this.signals.slice(0, 100)]; // Keep last 100 signals

      console.log(`Scan completed. Found ${uniqueNewSignals.length} new signals.`);

      // Send Telegram notifications for new signals
      if (uniqueNewSignals.length > 0) {
        await this.telegram.sendBatchSignals(uniqueNewSignals);
      }

    } catch (error) {
      console.error('Market scan failed:', error);
      await this.telegram.sendErrorAlert(error);
    } finally {
      this.isScanning = false;
    }
  }

  async analyzePair(symbol) {
    try {
      // Get 4H MACD data
      const klines4h = await this.api.getKlines(symbol, '240', 100);
      if (klines4h.length < 50) return null;

      const closes4h = klines4h.map(k => k.close);
      const macd4h = TechnicalIndicators.calculateMACD(closes4h);
      
      if (!macd4h) return null;

      // Check for MACD signal on 4H
      const macdSignal = TechnicalIndicators.detectMACDSignal(macd4h.histogram);
      if (!macdSignal) return null;

      // Get 1D data for StochRSI and MA check
      const klines1d = await this.api.getKlines(symbol, 'D', 50);
      if (klines1d.length < 30) return null;

      const closes1d = klines1d.map(k => k.close);
      const stochRSI1d = TechnicalIndicators.calculateStochRSI(closes1d);
      
      if (!stochRSI1d) return null;

      // Check for StochRSI bullish crossing
      const stochRSISignal = TechnicalIndicators.detectStochRSICrossing(stochRSI1d);
      if (!stochRSISignal) return null;

      // Check if price is above 10-period MA
      const priceAboveMA = TechnicalIndicators.checkPriceAboveMA(closes1d, 10);
      if (!priceAboveMA) return null;

      // Get current ticker info
      const ticker = await this.api.getTicker(symbol);
      if (!ticker) return null;

      // Check for strong signal confirmation across multiple timeframes
      const strength = await this.checkMultiTimeframeConfirmation(symbol, klines4h[klines4h.length - 1].timestamp);

      const signal = {
        symbol,
        timestamp: Date.now(),
        price: ticker.lastPrice,
        priceChange24h: ticker.priceChange24h,
        volume24h: ticker.volume24h,
        strength: strength.isStrong ? 'strong' : 'weak',
        confirmedTimeframes: strength.confirmedTimeframes,
        macdSignal,
        stochRSISignal,
        priceAboveMA,
        candle4hTime: klines4h[klines4h.length - 1].timestamp
      };

      return signal;

    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
      return null;
    }
  }

  async checkMultiTimeframeConfirmation(symbol, target4hTime) {
    const timeframes = ['5', '15', '60', 'D'];
    const confirmedTimeframes = [];

    try {
      for (const tf of timeframes) {
        const klines = await this.api.getKlines(symbol, tf, 100);
        if (klines.length < 50) continue;

        const closes = klines.map(k => k.close);
        const macd = TechnicalIndicators.calculateMACD(closes);
        
        if (!macd) continue;

        // Find the candle that corresponds to the 4H signal time
        const targetCandle = this.findCandleAtTime(klines, target4hTime, tf);
        if (!targetCandle) continue;

        const targetIndex = klines.findIndex(k => k.timestamp === targetCandle.timestamp);
        if (targetIndex < 2 || targetIndex >= macd.histogram.length) continue;

        // Check if there's a MACD histogram signal at this time
        const histogramSlice = macd.histogram.slice(0, targetIndex + 1);
        const signal = TechnicalIndicators.detectMACDSignal(histogramSlice);
        
        if (signal && signal.type === 'bullish_cross') {
          confirmedTimeframes.push(tf === 'D' ? '1D' : tf + 'm');
        }
      }

      return {
        isStrong: confirmedTimeframes.length >= 2,
        confirmedTimeframes
      };

    } catch (error) {
      console.error(`Error checking multi-timeframe confirmation for ${symbol}:`, error);
      return { isStrong: false, confirmedTimeframes: [] };
    }
  }

  findCandleAtTime(klines, targetTime, timeframe) {
    // Convert timeframe to minutes
    const tfMinutes = {
      '5': 5,
      '15': 15,
      '60': 60,
      'D': 1440
    };

    const minutes = tfMinutes[timeframe];
    if (!minutes) return null;

    // Find the candle that would be open at the target time
    for (const kline of klines) {
      const candleStart = kline.timestamp;
      const candleEnd = candleStart + (minutes * 60 * 1000);
      
      if (targetTime >= candleStart && targetTime < candleEnd) {
        return kline;
      }
    }

    return null;
  }

  async getSignals() {
    return this.signals.sort((a, b) => {
      // Sort by strength first (strong signals first), then by timestamp
      if (a.strength !== b.strength) {
        return a.strength === 'strong' ? -1 : 1;
      }
      return b.timestamp - a.timestamp;
    });
  }

  start(onSignalsUpdate) {
    console.log('Starting crypto screener...');
    
    // Initial scan
    this.initialize().then(() => {
      this.scanMarket().then(() => {
        if (onSignalsUpdate) {
          onSignalsUpdate(this.signals);
        }
      });
    });

    // Set up periodic scanning every 5 minutes
    this.scanInterval = setInterval(async () => {
      await this.scanMarket();
      if (onSignalsUpdate) {
        onSignalsUpdate(this.signals);
      }
    }, 5 * 60 * 1000); // 5 minutes

    console.log('Screener started with 5-minute intervals');
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      console.log('Screener stopped');
    }
  }
}