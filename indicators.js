export class TechnicalIndicators {
  static calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod) return null;

    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);
    
    if (!fastEMA || !slowEMA) return null;

    const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
    const signalLine = this.calculateEMA(macdLine, signalPeriod);
    
    if (!signalLine) return null;

    const histogram = macdLine.map((macd, i) => macd - signalLine[i]);

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: histogram
    };
  }

  static calculateEMA(prices, period) {
    if (prices.length < period) return null;

    const k = 2 / (period + 1);
    const ema = [prices[0]];

    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }

    return ema;
  }

  static calculateSMA(prices, period) {
    if (prices.length < period) return null;

    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }

    return sma;
  }

  static calculateStochRSI(prices, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
    const rsi = this.calculateRSI(prices, rsiPeriod);
    if (!rsi || rsi.length < stochPeriod) return null;

    const stochRSI = [];
    
    for (let i = stochPeriod - 1; i < rsi.length; i++) {
      const rsiSlice = rsi.slice(i - stochPeriod + 1, i + 1);
      const minRSI = Math.min(...rsiSlice);
      const maxRSI = Math.max(...rsiSlice);
      
      const stochValue = maxRSI === minRSI ? 0 : (rsi[i] - minRSI) / (maxRSI - minRSI);
      stochRSI.push(stochValue * 100);
    }

    const k = this.calculateSMA(stochRSI, kPeriod);
    const d = this.calculateSMA(k, dPeriod);

    return {
      stochRSI: stochRSI,
      k: k,
      d: d
    };
  }

  static calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;

    const gains = [];
    const losses = [];

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rsi = [];
    
    for (let i = period; i < gains.length; i++) {
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }

      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    return rsi;
  }

  static detectMACDSignal(histogram) {
    if (!histogram || histogram.length < 3) return null;

    const current = histogram[histogram.length - 1];
    const previous = histogram[histogram.length - 2];
    const beforePrevious = histogram[histogram.length - 3];

    // Check for first green histogram after red(s)
    if (current > 0 && previous <= 0) {
      // Count consecutive red histograms before this green one
      let redCount = 0;
      for (let i = histogram.length - 2; i >= 0 && histogram[i] <= 0; i--) {
        redCount++;
      }
      
      return {
        type: 'bullish_cross',
        strength: redCount,
        current: current,
        previous: previous
      };
    }

    return null;
  }

  static detectStochRSICrossing(stochRSI) {
    if (!stochRSI.k || !stochRSI.d || stochRSI.k.length < 2) return null;

    const currentK = stochRSI.k[stochRSI.k.length - 1];
    const previousK = stochRSI.k[stochRSI.k.length - 2];
    const currentD = stochRSI.d[stochRSI.d.length - 1];
    const previousD = stochRSI.d[stochRSI.d.length - 2];

    // Bullish crossing: K line crosses above D line
    if (previousK <= previousD && currentK > currentD && currentK < 80) {
      return {
        type: 'bullish_cross',
        k: currentK,
        d: currentD,
        oversold: currentK < 20
      };
    }

    return null;
  }

  static checkPriceAboveMA(prices, maPeriod = 10) {
    if (prices.length < maPeriod) return false;

    const ma = this.calculateSMA(prices, maPeriod);
    if (!ma) return false;

    const currentPrice = prices[prices.length - 1];
    const currentMA = ma[ma.length - 1];

    return currentPrice > currentMA;
  }
}