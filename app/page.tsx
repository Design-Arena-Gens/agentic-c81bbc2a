'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface HalvingEvent {
  date: string;
  blockHeight: number;
  cycle: number;
}

interface PriceData {
  date: string;
  price: number;
  timestamp: number;
}

interface CycleAnalysis {
  cycle: number;
  halvingDate: string;
  preHalvingData: {
    startDate: string;
    startPrice: number;
    halvingPrice: number;
    percentageGain: number;
    daysAnalyzed: number;
  };
  postHalvingData: {
    peakDate: string;
    peakPrice: number;
    percentageGain: number;
    crashDate: string | null;
    crashPrice: number | null;
    percentageFromPeak: number | null;
    daysToPeak: number;
  };
}

const HALVING_EVENTS: HalvingEvent[] = [
  { date: '2012-11-28', blockHeight: 210000, cycle: 1 },
  { date: '2016-07-09', blockHeight: 420000, cycle: 2 },
  { date: '2020-05-11', blockHeight: 630000, cycle: 3 },
  { date: '2024-04-20', blockHeight: 840000, cycle: 4 },
];

export default function Home() {
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [analysis, setAnalysis] = useState<CycleAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<number | 'all'>('all');

  useEffect(() => {
    fetchBitcoinData();
  }, []);

  const fetchBitcoinData = async () => {
    try {
      // Fetch historical Bitcoin price data from CoinGecko API
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily'
      );
      const data = await response.json();

      const formattedData: PriceData[] = data.prices.map(([timestamp, price]: [number, number]) => ({
        date: format(new Date(timestamp), 'yyyy-MM-dd'),
        price: price,
        timestamp: timestamp,
      }));

      setPriceData(formattedData);
      analyzeHalvingCycles(formattedData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const analyzeHalvingCycles = (data: PriceData[]) => {
    const analyses: CycleAnalysis[] = [];

    HALVING_EVENTS.forEach((halving, index) => {
      const halvingDate = new Date(halving.date);
      const halvingTimestamp = halvingDate.getTime();

      // Find price at halving
      const halvingPriceData = data.find(d =>
        Math.abs(d.timestamp - halvingTimestamp) < 24 * 60 * 60 * 1000
      );

      if (!halvingPriceData) return;

      // Pre-halving analysis (365 days before)
      const preHalvingStart = halvingTimestamp - (365 * 24 * 60 * 60 * 1000);
      const preHalvingData = data.filter(d =>
        d.timestamp >= preHalvingStart && d.timestamp <= halvingTimestamp
      );

      const startPrice = preHalvingData[0]?.price || 0;
      const halvingPrice = halvingPriceData.price;
      const preHalvingGain = ((halvingPrice - startPrice) / startPrice) * 100;

      // Post-halving analysis (find peak in next 18 months)
      const postHalvingEnd = halvingTimestamp + (550 * 24 * 60 * 60 * 1000); // ~18 months
      const nextHalvingTimestamp = HALVING_EVENTS[index + 1]?.date
        ? new Date(HALVING_EVENTS[index + 1].date).getTime()
        : Date.now();

      const analysisEnd = Math.min(postHalvingEnd, nextHalvingTimestamp, Date.now());

      const postHalvingData = data.filter(d =>
        d.timestamp > halvingTimestamp && d.timestamp <= analysisEnd
      );

      let peakPrice = halvingPrice;
      let peakDate = halving.date;
      let peakIndex = 0;

      postHalvingData.forEach((d, i) => {
        if (d.price > peakPrice) {
          peakPrice = d.price;
          peakDate = d.date;
          peakIndex = i;
        }
      });

      const postHalvingGain = ((peakPrice - halvingPrice) / halvingPrice) * 100;
      const daysToPeak = Math.floor((new Date(peakDate).getTime() - halvingTimestamp) / (24 * 60 * 60 * 1000));

      // Find crash (30%+ drop from peak)
      let crashDate: string | null = null;
      let crashPrice: number | null = null;
      let maxDrawdown = 0;

      for (let i = peakIndex; i < postHalvingData.length; i++) {
        const drawdown = ((peakPrice - postHalvingData[i].price) / peakPrice) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          if (drawdown >= 30 && !crashDate) {
            crashDate = postHalvingData[i].date;
            crashPrice = postHalvingData[i].price;
          }
        }
      }

      analyses.push({
        cycle: halving.cycle,
        halvingDate: halving.date,
        preHalvingData: {
          startDate: preHalvingData[0]?.date || halving.date,
          startPrice: startPrice,
          halvingPrice: halvingPrice,
          percentageGain: preHalvingGain,
          daysAnalyzed: preHalvingData.length,
        },
        postHalvingData: {
          peakDate: peakDate,
          peakPrice: peakPrice,
          percentageGain: postHalvingGain,
          crashDate: crashDate,
          crashPrice: crashPrice,
          percentageFromPeak: crashPrice ? ((crashPrice - peakPrice) / peakPrice) * 100 : null,
          daysToPeak: daysToPeak,
        },
      });
    });

    setAnalysis(analyses);
  };

  const getFilteredData = () => {
    if (selectedCycle === 'all') return priceData;

    const halving = HALVING_EVENTS.find(h => h.cycle === selectedCycle);
    if (!halving) return priceData;

    const halvingTimestamp = new Date(halving.date).getTime();
    const startTime = halvingTimestamp - (365 * 24 * 60 * 60 * 1000);
    const endTime = halvingTimestamp + (550 * 24 * 60 * 60 * 1000);

    return priceData.filter(d => d.timestamp >= startTime && d.timestamp <= endTime);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontSize: '1.5rem'
      }}>
        Loading Bitcoin halving analysis...
      </div>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{
        fontSize: '2.5rem',
        fontWeight: 'bold',
        marginBottom: '1rem',
        background: 'linear-gradient(to right, #f7931a, #ffd700)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text'
      }}>
        Bitcoin Halving Cycle Analysis
      </h1>

      <p style={{ marginBottom: '2rem', color: '#a0a0a0', fontSize: '1.1rem' }}>
        Historical analysis of Bitcoin price patterns before and after halving events
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ marginRight: '1rem', fontSize: '1.1rem' }}>Select Cycle:</label>
        <select
          value={selectedCycle}
          onChange={(e) => setSelectedCycle(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '1rem',
            borderRadius: '8px',
            background: '#2a2f4a',
            color: '#e0e0e0',
            border: '1px solid #404560',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Cycles</option>
          {HALVING_EVENTS.map(h => (
            <option key={h.cycle} value={h.cycle}>Cycle {h.cycle} ({h.date})</option>
          ))}
        </select>
      </div>

      <div style={{
        background: '#1a1f3a',
        padding: '2rem',
        borderRadius: '12px',
        marginBottom: '2rem',
        border: '1px solid #2a2f4a'
      }}>
        <ResponsiveContainer width="100%" height={500}>
          <LineChart data={getFilteredData()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f4a" />
            <XAxis
              dataKey="date"
              stroke="#a0a0a0"
              tick={{ fill: '#a0a0a0' }}
              tickFormatter={(date) => format(new Date(date), 'MMM yyyy')}
            />
            <YAxis
              stroke="#a0a0a0"
              tick={{ fill: '#a0a0a0' }}
              scale="log"
              domain={['auto', 'auto']}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                background: '#2a2f4a',
                border: '1px solid #404560',
                borderRadius: '8px',
                color: '#e0e0e0'
              }}
              formatter={(value: number) => formatPrice(value)}
              labelFormatter={(date) => format(new Date(date), 'MMM dd, yyyy')}
            />
            <Legend wrapperStyle={{ color: '#e0e0e0' }} />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#f7931a"
              dot={false}
              strokeWidth={2}
              name="BTC Price"
            />
            {HALVING_EVENTS.map(halving => (
              <ReferenceLine
                key={halving.cycle}
                x={halving.date}
                stroke="#00ff88"
                strokeDasharray="5 5"
                label={{
                  value: `Halving ${halving.cycle}`,
                  fill: '#00ff88',
                  position: 'top'
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem'
      }}>
        {analysis.map(cycle => (
          <div
            key={cycle.cycle}
            style={{
              background: '#1a1f3a',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '1px solid #2a2f4a'
            }}
          >
            <h2 style={{
              fontSize: '1.5rem',
              marginBottom: '1rem',
              color: '#f7931a'
            }}>
              Cycle {cycle.cycle}
            </h2>

            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#00ff88', fontSize: '0.9rem' }}>
                Halving Date: {format(new Date(cycle.halvingDate), 'MMM dd, yyyy')}
              </p>
            </div>

            <div style={{
              background: '#0a0e27',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <h3 style={{
                fontSize: '1.1rem',
                marginBottom: '0.5rem',
                color: '#88b3ff'
              }}>
                Pre-Halving (1 Year Before)
              </h3>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                Start: {formatPrice(cycle.preHalvingData.startPrice)}
              </p>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                At Halving: {formatPrice(cycle.preHalvingData.halvingPrice)}
              </p>
              <p style={{
                fontSize: '1.1rem',
                fontWeight: 'bold',
                color: cycle.preHalvingData.percentageGain > 0 ? '#00ff88' : '#ff4444'
              }}>
                Gain: {cycle.preHalvingData.percentageGain.toFixed(2)}%
              </p>
            </div>

            <div style={{
              background: '#0a0e27',
              padding: '1rem',
              borderRadius: '8px'
            }}>
              <h3 style={{
                fontSize: '1.1rem',
                marginBottom: '0.5rem',
                color: '#ffaa00'
              }}>
                Post-Halving
              </h3>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                Peak: {formatPrice(cycle.postHalvingData.peakPrice)}
                <span style={{ color: '#a0a0a0', fontSize: '0.8rem' }}>
                  {' '}({cycle.postHalvingData.daysToPeak} days)
                </span>
              </p>
              <p style={{
                fontSize: '1.1rem',
                fontWeight: 'bold',
                color: '#00ff88',
                marginBottom: '0.5rem'
              }}>
                Gain from Halving: {cycle.postHalvingData.percentageGain.toFixed(2)}%
              </p>

              {cycle.postHalvingData.crashDate && (
                <>
                  <p style={{
                    fontSize: '0.9rem',
                    marginTop: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #2a2f4a'
                  }}>
                    Crash Date: {format(new Date(cycle.postHalvingData.crashDate), 'MMM dd, yyyy')}
                  </p>
                  <p style={{ fontSize: '0.9rem' }}>
                    Crash Price: {formatPrice(cycle.postHalvingData.crashPrice!)}
                  </p>
                  <p style={{
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    color: '#ff4444'
                  }}>
                    Drawdown: {cycle.postHalvingData.percentageFromPeak?.toFixed(2)}%
                  </p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '3rem',
        padding: '2rem',
        background: '#1a1f3a',
        borderRadius: '12px',
        border: '1px solid #2a2f4a'
      }}>
        <h2 style={{
          fontSize: '1.8rem',
          marginBottom: '1rem',
          color: '#f7931a'
        }}>
          Key Findings
        </h2>
        <ul style={{
          listStyle: 'none',
          padding: 0,
          fontSize: '1.1rem',
          lineHeight: '1.8'
        }}>
          {analysis.map(cycle => (
            <li key={cycle.cycle} style={{
              marginBottom: '1rem',
              paddingBottom: '1rem',
              borderBottom: cycle.cycle !== analysis.length ? '1px solid #2a2f4a' : 'none'
            }}>
              <strong style={{ color: '#00ff88' }}>Cycle {cycle.cycle}:</strong>
              <br />
              • Pre-halving: {cycle.preHalvingData.percentageGain > 0 ? '+' : ''}{cycle.preHalvingData.percentageGain.toFixed(2)}% gain in the year before
              <br />
              • Post-halving: {cycle.postHalvingData.percentageGain.toFixed(2)}% gain to peak ({cycle.postHalvingData.daysToPeak} days)
              <br />
              {cycle.postHalvingData.crashDate && (
                <>• Major correction: {cycle.postHalvingData.percentageFromPeak?.toFixed(2)}% from peak on {format(new Date(cycle.postHalvingData.crashDate), 'MMM dd, yyyy')}</>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
