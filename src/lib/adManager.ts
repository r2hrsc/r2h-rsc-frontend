// ── Ad Manager — direct ad sales system (localStorage for now) ──

export type AdSlotType = 'LEFT_SIDEBAR' | 'RIGHT_SIDEBAR' | 'VOTE_GATEWAY';

export interface Ad {
  id: string;
  slot: AdSlotType;
  imageUrl: string;
  linkUrl: string;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  advertiser: string;
  impressions: number;
  clicks: number;
}

const STORAGE_KEY = 'r2h_ads';

// ── Slot pricing (used by analytics + media kit) ──
export const SLOT_PRICING: Record<AdSlotType, { price: number; label: string; dimensions: string }> = {
  LEFT_SIDEBAR:  { price: 75,  label: 'Left Sidebar',  dimensions: '160×600' },
  RIGHT_SIDEBAR: { price: 75,  label: 'Right Sidebar', dimensions: '160×600' },
  VOTE_GATEWAY:  { price: 100, label: 'Vote Gateway',  dimensions: '728×90' },
};

// ── Filler ads shown when no paid ad is active ──
export interface FillerAd {
  slot: AdSlotType;
  title: string;
  subtitle: string;
  linkUrl: string;
  color: string;
  bgGradient: string;
}

export const FILLER_ADS: FillerAd[] = [
  {
    slot: 'LEFT_SIDEBAR',
    title: 'Join Our',
    subtitle: 'Discord Community',
    linkUrl: 'https://discord.gg/r2hrsc',
    color: '#5865F2',
    bgGradient: 'linear-gradient(180deg, #1a1b2e 0%, #0d0d0d 100%)',
  },
  {
    slot: 'RIGHT_SIDEBAR',
    title: 'Play',
    subtitle: 'RSC Now',
    linkUrl: '/',
    color: '#14F195',
    bgGradient: 'linear-gradient(180deg, #0d1f14 0%, #0d0d0d 100%)',
  },
  {
    slot: 'VOTE_GATEWAY',
    title: 'Vote for R2H RSC',
    subtitle: 'Help us grow the community',
    linkUrl: 'https://r2hrsc.xyz/vote',
    color: '#14F195',
    bgGradient: 'linear-gradient(90deg, #0d1f14 0%, #0d0d0d 100%)',
  },
];

// ── Storage helpers ──

function readAds(): Ad[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Ad[];
  } catch {
    return [];
  }
}

function writeAds(ads: Ad[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ads));
}

function genId(): string {
  return `ad_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ── Public API ──

export function getActiveAds(): Ad[] {
  const now = new Date();
  return readAds().filter(ad => {
    const start = new Date(ad.startDate);
    const end = new Date(ad.endDate);
    return now >= start && now <= end;
  });
}

export function getAllAds(): Ad[] {
  return readAds();
}

export function getAdForSlot(slot: AdSlotType): Ad | null {
  const active = getActiveAds().filter(ad => ad.slot === slot);
  if (active.length === 0) return null;
  // Return the most recently added active ad for this slot
  return active[active.length - 1];
}

export function getFillerForSlot(slot: AdSlotType): FillerAd | null {
  return FILLER_ADS.find(f => f.slot === slot) || FILLER_ADS[0] || null;
}

export function recordImpression(adId: string): void {
  const ads = readAds();
  const ad = ads.find(a => a.id === adId);
  if (ad) {
    ad.impressions += 1;
    writeAds(ads);
  }
}

export function recordClick(adId: string): void {
  const ads = readAds();
  const ad = ads.find(a => a.id === adId);
  if (ad) {
    ad.clicks += 1;
    writeAds(ads);
  }
}

export function addAd(data: Omit<Ad, 'id' | 'impressions' | 'clicks'>): Ad {
  const ads = readAds();
  const newAd: Ad = {
    ...data,
    id: genId(),
    impressions: 0,
    clicks: 0,
  };
  ads.push(newAd);
  writeAds(ads);
  return newAd;
}

export function updateAd(id: string, updates: Partial<Ad>): void {
  const ads = readAds();
  const idx = ads.findIndex(a => a.id === id);
  if (idx !== -1) {
    ads[idx] = { ...ads[idx], ...updates };
    writeAds(ads);
  }
}

export function deleteAd(id: string): void {
  const ads = readAds().filter(a => a.id !== id);
  writeAds(ads);
}

export function getAdStats(adId: string): { impressions: number; clicks: number; ctr: number } {
  const ad = readAds().find(a => a.id === adId);
  if (!ad) return { impressions: 0, clicks: 0, ctr: 0 };
  const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
  return { impressions: ad.impressions, clicks: ad.clicks, ctr };
}

export function getTotalRevenue(): number {
  const active = getActiveAds();
  return active.reduce((sum, ad) => sum + (SLOT_PRICING[ad.slot]?.price || 0), 0);
}
