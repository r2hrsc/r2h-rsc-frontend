import { useState } from 'react';
import { AdAnalytics } from './AdAnalytics';
import {
  getAllAds,
  addAd,
  updateAd,
  deleteAd,
  SLOT_PRICING,
  type AdSlotType,
  type Ad,
} from '../../lib/adManager';

const ADMIN_PASSWORD = 'r2h-admin-2026';

export function AdManagerPage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true);
      setError('');
    } else {
      setError('Wrong password');
    }
  };

  if (!authed) {
    return (
      <div style={pageStyle}>
        <form onSubmit={handleLogin} style={cardStyle}>
          <h1 style={headingStyle}>R2H RSC — Ad Admin</h1>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Admin password"
            style={inputStyle}
            autoFocus
          />
          {error && <p style={{ color: '#f44', fontSize: 13 }}>{error}</p>}
          <button type="submit" style={buttonStyle}>Login</button>
          <p style={{ ...backLinkStyle, marginTop: 16 }}>
            <a href="/" style={{ color: '#888', textDecoration: 'none' }}>← Back to site</a>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1000, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={headingStyle}>Ad Management</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <a href="/" style={navLinkStyle}>← Site</a>
            <a href="/media-kit" style={navLinkStyle}>Media Kit</a>
          </div>
        </div>

        <AdAnalytics />

        <AdForm key="new" />

        <AdList />
      </div>
    </div>
  );
}

// ── Create New Ad Form ──
function AdForm({ existing }: { existing?: Ad }) {
  const [slot, setSlot] = useState<AdSlotType>(existing?.slot || 'LEFT_SIDEBAR');
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl || '');
  const [linkUrl, setLinkUrl] = useState(existing?.linkUrl || '');
  const [advertiser, setAdvertiser] = useState(existing?.advertiser || '');
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(existing?.startDate?.split('T')[0] || today);
  const [endDate, setEndDate] = useState(
    existing?.endDate?.split('T')[0] ||
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [msg, setMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl || !linkUrl || !advertiser) {
      setMsg('All fields required');
      return;
    }

    if (existing) {
      updateAd(existing.id, {
        slot, imageUrl, linkUrl, advertiser,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });
      setMsg('Ad updated!');
    } else {
      addAd({
        slot, imageUrl, linkUrl, advertiser,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });
      setMsg('Ad created!');
      // Reset fields
      setImageUrl('');
      setLinkUrl('');
      setAdvertiser('');
    }
    window.dispatchEvent(new Event('r2h-ads-updated'));
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <form onSubmit={handleSubmit} style={{ ...cardStyle, marginTop: 24 }}>
      <h2 style={{ ...headingStyle, fontSize: 18, marginBottom: 16 }}>
        {existing ? 'Edit Ad' : 'Upload New Ad'}
      </h2>

      <label style={labelStyle}>Slot</label>
      <select value={slot} onChange={(e) => setSlot(e.target.value as AdSlotType)} style={inputStyle}>
        {Object.entries(SLOT_PRICING).map(([key, val]) => (
          <option key={key} value={key}>
            {val.label} ({val.dimensions}) — ${val.price}/mo
          </option>
        ))}
      </select>

      <label style={labelStyle}>Advertiser Name</label>
      <input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} placeholder="e.g. RSC Gold Shop" style={inputStyle} />

      <label style={labelStyle}>Image URL</label>
      <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/ad.png" style={inputStyle} />

      <label style={labelStyle}>Link URL</label>
      <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://advertiser-site.com" style={inputStyle} />

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {msg && <p style={{ color: '#14F195', fontSize: 13, marginTop: 8 }}>{msg}</p>}

      <button type="submit" style={{ ...buttonStyle, marginTop: 16 }}>
        {existing ? 'Save Changes' : 'Create Ad'}
      </button>
    </form>
  );
}

// ── Ad List ──
function AdList() {
  const [ads, setAds] = useState<Ad[]>(getAllAds());
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => {
    setAds(getAllAds());
    window.dispatchEvent(new Event('r2h-ads-updated'));
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this ad?')) {
      deleteAd(id);
      refresh();
    }
  };

  return (
    <div style={{ ...cardStyle, marginTop: 24 }}>
      <h2 style={{ ...headingStyle, fontSize: 18, marginBottom: 16 }}>All Ads ({ads.length})</h2>

      {ads.length === 0 && (
        <p style={{ color: '#666', fontSize: 14 }}>No ads yet. Filler ads are showing on the site.</p>
      )}

      {ads.map(ad => (
        <div key={ad.id} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 0',
          borderBottom: '1px solid #1a1a1a',
        }}>
          <img
            src={ad.imageUrl}
            alt={ad.advertiser}
            style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, background: '#111' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 14 }}>{ad.advertiser}</div>
            <div style={{ color: '#888', fontSize: 12 }}>
              {SLOT_PRICING[ad.slot]?.label} · {ad.impressions.toLocaleString()} impressions · {ad.clicks.toLocaleString()} clicks
            </div>
            <div style={{ color: '#555', fontSize: 11 }}>
              {new Date(ad.startDate).toLocaleDateString()} → {new Date(ad.endDate).toLocaleDateString()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditingId(editingId === ad.id ? null : ad.id)} style={smallBtnStyle}>
              {editingId === ad.id ? 'Cancel' : 'Edit'}
            </button>
            <button onClick={() => handleDelete(ad.id)} style={{ ...smallBtnStyle, color: '#f44' }}>Delete</button>
          </div>
        </div>
      ))}

      {editingId && (
        <div style={{ marginTop: 16 }}>
          <AdForm key={editingId} existing={ads.find(a => a.id === editingId)} />
        </div>
      )}
    </div>
  );
}

// ── Styles ──
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0a0a0a',
  color: '#e5e5e5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: '40px 20px',
  display: 'flex',
  justifyContent: 'center',
};

const cardStyle: React.CSSProperties = {
  background: '#111',
  border: '1px solid #1a1a1a',
  borderRadius: 10,
  padding: 24,
  maxWidth: 500,
  width: '100%',
};

const headingStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: 24,
  margin: '0 0 20px 0',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#888',
  fontSize: 12,
  marginBottom: 4,
  marginTop: 12,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: '#0a0a0a',
  border: '1px solid #222',
  borderRadius: 6,
  color: '#e5e5e5',
  fontSize: 14,
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#14F195',
  color: '#0a0a0a',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const navLinkStyle: React.CSSProperties = {
  color: '#888',
  textDecoration: 'none',
  fontSize: 14,
  padding: '8px 12px',
  border: '1px solid #222',
  borderRadius: 6,
};

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#e5e5e5',
  fontSize: 12,
  cursor: 'pointer',
};

const backLinkStyle: React.CSSProperties = {
  fontSize: 13,
  textAlign: 'center',
};
