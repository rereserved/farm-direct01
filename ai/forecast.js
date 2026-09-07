const { db } = require('../db');

/**
 * Weighted moving average + seasonal index forecasting.
 * For prototype: uses historical sales to predict next-month demand per crop.
 */
function forecastDemand(crop) {
  const rows = db.prepare(
    'SELECT month, qty_sold FROM sales_history WHERE crop = ? ORDER BY month'
  ).all(crop);

  if (rows.length < 3) return { crop, forecast: null, trend: 'insufficient_data' };

  // Weighted moving average (recent months weighted higher)
  const weights = rows.map((_, i) => i + 1);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const forecast = rows.reduce((acc, r, i) => acc + r.qty_sold * weights[i], 0) / wSum;

  // Trend detection
  const firstHalf = rows.slice(0, Math.floor(rows.length / 2));
  const secondHalf = rows.slice(Math.floor(rows.length / 2));
  const avg = a => a.reduce((x, r) => x + r.qty_sold, 0) / a.length;
  const trend = avg(secondHalf) > avg(firstHalf) ? 'rising' : 'falling';

  // Simple seasonal index (peak month detection)
  const peak = rows.reduce((a, b) => (b.qty_sold > a.qty_sold ? b : a));

  return {
    crop,
    forecast: Math.round(forecast * 10) / 10,
    trend,
    peak_month: peak.month,
    confidence: Math.min(0.95, 0.5 + rows.length * 0.05)
  };
}

function forecastAll() {
  const crops = db.prepare('SELECT DISTINCT crop FROM sales_history').all();
  return crops.map(c => forecastDemand(c.crop));
}

module.exports = { forecastDemand, forecastAll };
