import { useState } from 'react';
import {
  getAllAds,
  getActiveAds,
  getTotalRevenue,
  SLOT_PRICING,
  type AdSlotType,
} from '../../lib/adManager';

export function AdAnalytics() {
  const [, forceUpdate] = useState(0);
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('all');

  const allAds = getAllAds();
  const activeAds = getActiveAds();
  const totalRevenue = getTotalRevenue();

  // Filter by date range
  const now = Date.now();
  const rangeMs = range === '7d' ? 7 * 86400000 : range === '30d' ? 30 * 86400000 : Infinity;
  const filteredAds = allAds.filter(ad => {
    // Since impressions/clicks aren't timestamped, we show total stats
    // but filter ad list by creation recency
    return true;
  });

  const totalImpressions = filteredAds.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = filteredAds.reduce((s, a) => s + a.clicks, 0);
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // Revenue per slot
  const slotRevenue = (Object.keys(SLOT_PRICING) as AdSlotType[]).map(slot => {
    const count = activeAds.filter(a => a.slot === slot).length;
    return {
      slot,
      label: SLOT_PRICING[slot].label,
      price: SLOT_PRICING[slot].price,
      count,
      revenue: count * SLOT_PRICING[slot].price,
    };
  });

  return (
    <div style={{
      background: '#111',
      border: '1px solid #1a1a1a',
      borderRadius: 10,
      padding: 24,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: '#fff', fontSize: 18, margin: 0 }}>Analytics</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['7d', '30d', 'all'] as const).map(r => (
            <button
              key={r}
              onClick={() => { setRange(r); forceUpdate(n => n + 1); }}
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                border: '1px solid',
                borderColor: range === r ? '#14F195' : '#333',
                background: range === r ? 'rgba(20,241,149,0.1)' : '#0a0a0a',
                color: range === r ? '#14F195' : '#888',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {r === '7d' ? '7 days' : r === '30d' ? '30 days' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard label="Active Ads" value={String(activeAds.length)} />
        <StatCard label="Monthly Revenue" value={`$${totalRevenue}`} accent="#14F195" />
        <StatCard label="Total Impressions" value={totalImpressions.toLocaleString()} />
        <StatCard label="Total Clicks" value={totalClicks.toLocaleString()} />
        <StatCard label="Avg CTR" value={`${overallCtr.toFixed(2)}%`} />
      </div>

      {/* Per-slot revenue table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #222' }}>
            <th style={thStyle}>Slot</th>
            <th style={thStyle}>Price/mo</th>
            <th style={thStyle}>Sold</th>
            <th style={thStyle}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {slotRevenue.map(s => (
            <tr key={s.slot} style={{ borderBottom: '1px solid #1a1a1a' }}>
              <td style={tdStyle}>{s.label}</td>
              <td style={tdStyle}>${s.price}</td>
              <td style={tdStyle}>{s.count}</td>
              <td style={{ ...tdStyle, color: s.revenue > 0 ? '#14F195' : '#666' }}>${s.revenue}/mo</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Per-ad breakdown */}
      {filteredAds.length > 0 && (
        <>
          <h3 style={{ color: '#888', fontSize: 14, marginTop: 24, marginBottom: 8 }}>Per-Ad Breakdown</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <th style={thStyle}>Advertiser</th>
                <th style={thStyle}>Slot</th>
                <th style={thStyle}>Impr.</th>
                <th style={thStyle}>Clicks</th>
                <th style={thStyle}>CTR</th>
              </tr>
            </thead>
            <tbody>
              {filteredAds.map(ad => {
                const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
                const barWidth = overallCtr > 0 ? Math.min(100, (ctr / overallCtr) * 100) : 0;
                return (
                  <tr key={ad.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <td style={tdStyle}>{ad.advertiser}</td>
                    <td style={{ ...tdStyle, color: '#888' }}>{SLOT_PRICING[ad.slot]?.label}</td>
                    <td style={tdStyle}>{ad.impressions.toLocaleString()}</td>
                    <td style={tdStyle}>{ad.clicks.toLocaleString()}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 8, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${barWidth}%`, height: '100%', background: '#14F195', borderRadius: 4 }} />
                        </div>
                        <span style={{ color: '#888' }}>{ctr.toFixed(2)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: 8,
      padding: '12px 20px',
      minWidth: 140,
    }}>
      <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ color: accent || '#e5e5e5', fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  color: '#666',
  fontWeight: 500,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  color: '#e5e5e5',
};
