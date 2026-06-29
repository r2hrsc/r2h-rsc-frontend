import { SLOT_PRICING, type AdSlotType } from '../lib/adManager';

export function MediaKit() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#e5e5e5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '60px 20px',
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 8px', color: '#fff' }}>
            Advertise on R2H RSC
          </h1>
          <p style={{ fontSize: 18, color: '#888' }}>
            Reach the most nostalgic audience in RuneScape Classic
          </p>
          <div style={{ marginTop: 16 }}>
            <a href="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>← Back to R2H RSC</a>
          </div>
        </div>

        {/* Audience */}
        <Section title="Our Audience">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <AudienceCard title="Primary" desc="RuneScape Classic veterans (35+ y/o) who played in 2001-2003 and miss the original game." />
            <AudienceCard title="Secondary" desc="Newer players discovering classic RSC for the first time through nostalgia content." />
            <AudienceCard title="Engagement" desc="Players return daily for tick-based gameplay, community events, and hiscores." />
          </div>
        </Section>

        {/* Traffic */}
        <Section title="Traffic Stats">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <TrafficStat label="Monthly Visitors" value="Under 10,000" />
            <TrafficStat label="Growing" value="Rapidly" accent="#14F195" />
            <TrafficStat label="Ad Network" value="None — Direct Sales Only" />
          </div>
          <p style={{ color: '#555', fontSize: 13, marginTop: 12 }}>
            Traffic stats are updated manually as the server grows. Contact us for live numbers.
          </p>
        </Section>

        {/* Ad Slots */}
        <Section title="Available Ad Slots & Pricing">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(Object.keys(SLOT_PRICING) as AdSlotType[]).map(slot => {
              const p = SLOT_PRICING[slot];
              return (
                <div key={slot} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#111',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 20px',
                }}>
                  <div>
                    <div style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 16 }}>{p.label}</div>
                    <div style={{ color: '#888', fontSize: 13 }}>{p.dimensions} pixels</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#14F195', fontSize: 22, fontWeight: 700 }}>${p.price}</div>
                    <div style={{ color: '#666', fontSize: 12 }}>per month</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Specs */}
        <Section title="Creative Specifications">
          <ul style={{ color: '#aaa', fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
            <li><strong style={{ color: '#e5e5e5' }}>Format:</strong> PNG or JPG only</li>
            <li><strong style={{ color: '#e5e5e5' }}>Dimensions:</strong> Exact size per slot (see above)</li>
            <li><strong style={{ color: '#e5e5e5' }}>File size:</strong> Under 150KB</li>
            <li><strong style={{ color: '#e5e5e5' }}>No animated GIFs</strong></li>
            <li><strong style={{ color: '#e5e5e5' }}>Content:</strong> Gaming-relevant only. No adult, gambling, or malware. We reserve the right to reject ads.</li>
          </ul>
        </Section>

        {/* Contact */}
        <Section title="Get In Touch">
          <div style={{
            background: '#111',
            border: '1px solid #1a1a1a',
            borderRadius: 10,
            padding: 24,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 16, color: '#e5e5e5', margin: '0 0 12px' }}>
              Ready to advertise? We respond within 24 hours.
            </p>
            <a href="mailto:ads@r2hrsc.xyz" style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: '#14F195',
              color: '#0a0a0a',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
            }}>
              ads@r2hrsc.xyz
            </a>
            <p style={{ color: '#666', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
              Payment via PayPal or crypto (SOL/USDC)
            </p>
          </div>
        </Section>

        <div style={{ textAlign: 'center', padding: '32px 0', color: '#333', fontSize: 12 }}>
          R2H RSC — Pure nostalgic classic private server experience
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 16, borderBottom: '1px solid #1a1a1a', paddingBottom: 8 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function AudienceCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{
      flex: '1 1 200px',
      background: '#111',
      border: '1px solid #1a1a1a',
      borderRadius: 8,
      padding: 20,
    }}>
      <div style={{ color: '#14F195', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ color: '#aaa', fontSize: 14, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function TrafficStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #1a1a1a',
      borderRadius: 8,
      padding: '16px 24px',
      textAlign: 'center',
    }}>
      <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ color: accent || '#e5e5e5', fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
