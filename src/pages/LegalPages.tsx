import { useState } from 'react';

export function PrivacyPolicy() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={h1Style}>Privacy Policy</h1>
        <p style={dateStyle}>Last updated: July 1, 2026</p>

        <p style={pStyle}>
          R2H RSC ("we", "us", or "our") operates the website r2hrsc.xyz (the "Site").
          This Privacy Policy explains how we collect, use, and protect your information.
        </p>

        <h2 style={h2Style}>Information We Collect</h2>
        <p style={pStyle}>
          When you sign in using Google OAuth, we receive your Google account ID and email address
          for authentication purposes. When you connect a cryptocurrency wallet, we receive your
          wallet address. We do not store passwords or private keys.
        </p>
        <p style={pStyle}>
          We use Google AdSense to display advertisements. Google and its partners may use cookies
          and similar technologies to serve ads based on your prior visits to our website or other
          websites.
        </p>

        <h2 style={h2Style}>How We Use Your Information</h2>
        <ul style={listStyle}>
          <li>To authenticate your account and create your in-game username</li>
          <li>To display relevant advertisements via Google AdSense</li>
          <li>To prevent fraud and abuse of the platform</li>
          <li>To improve the user experience and site functionality</li>
        </ul>

        <h2 style={h2Style}>Google AdSense and Cookies</h2>
        <p style={pStyle}>
          Third-party vendors, including Google, use cookies to serve ads based on a user's prior
          visits to this website. Google's use of advertising cookies enables it and its partners
          to serve ads to you based on your visit to this site and/or other sites on the Internet.
        </p>
        <p style={pStyle}>
          You may opt out of personalized advertising by visiting
          <a href="https://www.google.com/settings/ads" style={linkStyle}> Google Ads Settings</a>.
          For more information about how Google uses data when you use our site, please read the
          <a href="https://policies.google.com/technologies/partner-sites" style={linkStyle}> Google Privacy Policy</a>.
        </p>

        <h2 style={h2Style}>Data Retention</h2>
        <p style={pStyle}>
          We retain authentication data only as long as necessary to provide our services.
          You may request deletion of your account data at any time by contacting us.
        </p>

        <h2 style={h2Style}>Contact Us</h2>
        <p style={pStyle}>
          If you have questions about this Privacy Policy, please reach out via our
          <a href="https://discord.gg/r2hrsc" style={linkStyle}> Discord community</a>.
        </p>

        <div style={{ marginTop: 40 }}>
          <a href="/" style={backLinkStyle}>← Back to R2H RSC</a>
        </div>
      </div>
    </div>
  );
}

export function TermsOfService() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={h1Style}>Terms of Service</h1>
        <p style={dateStyle}>Last updated: July 1, 2026</p>

        <p style={pStyle}>
          Welcome to R2H RSC. By accessing and using this website, you accept and agree to be
          bound by these Terms of Service. If you do not agree, please do not use our service.
        </p>

        <h2 style={h2Style}>Eligibility</h2>
        <p style={pStyle}>
          You must be at least 13 years old to use this service. By signing in, you confirm that
          you meet this age requirement.
        </p>

        <h2 style={h2Style}>Account Conduct</h2>
        <ul style={listStyle}>
          <li>You are responsible for all activity under your account</li>
          <li>You may not share, sell, or transfer your account</li>
          <li>You may not use cheats, bots, macros, or third-party automation tools</li>
          <li>You may not exploit bugs or glitches for personal gain</li>
          <li>Harassment, hate speech, and toxic behavior are prohibited</li>
        </ul>

        <h2 style={h2Style}>Intellectual Property</h2>
        <p style={pStyle}>
          R2H RSC is a private server for a classic game client. All game content belongs to its
          respective owners. This site does not claim ownership of any trademarked or copyrighted
          material.
        </p>

        <h2 style={h2Style}>Advertisements</h2>
        <p style={pStyle}>
          This website displays advertisements served by Google AdSense and other ad networks.
          We are not responsible for the content of third-party advertisements. Sponsored content
          does not constitute an endorsement.
        </p>

        <h2 style={h2Style}>Limitation of Liability</h2>
        <p style={pStyle}>
          R2H RSC is provided "as is" without warranties of any kind. We are not liable for any
          damages arising from your use of the service.
        </p>

        <h2 style={h2Style}>Changes to Terms</h2>
        <p style={pStyle}>
          We reserve the right to update these terms at any time. Continued use of the service
          after changes constitutes acceptance of the new terms.
        </p>

        <div style={{ marginTop: 40 }}>
          <a href="/" style={backLinkStyle}>← Back to R2H RSC</a>
        </div>
      </div>
    </div>
  );
}

export function About() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={h1Style}>About R2H RSC</h1>

        <p style={pStyle}>
          R2H RSC is a community-driven classic gaming server dedicated to preserving the authentic
          experience of early-era MMORPGs. We provide a browser-based client that requires no
          downloads — just sign in and play directly in your web browser.
        </p>

        <h2 style={h2Style}>What We Offer</h2>
        <ul style={listStyle}>
          <li>Browser-based gameplay — no downloads required</li>
          <li>Authentic classic game client running at native resolution</li>
          <li>Google account authentication for secure access</li>
          <li>Active community on Discord</li>
          <li>Regular updates and community events</li>
        </ul>

        <h2 style={h2Style}>How to Play</h2>
        <ol style={listStyle}>
          <li>Visit <a href="/" style={linkStyle}>r2hrsc.xyz</a></li>
          <li>Sign in with your Google account or crypto wallet</li>
          <li>Pick your in-game username</li>
          <li>Start playing immediately in your browser</li>
        </ol>

        <h2 style={h2Style}>Community</h2>
        <p style={pStyle}>
          Join our growing community on
          <a href="https://discord.gg/r2hrsc" style={linkStyle}> Discord</a> to connect with other
          players, get help, and stay updated on events and changes.
        </p>

        <h2 style={h2Style}>Support the Project</h2>
        <p style={pStyle}>
          You can help R2H RSC grow by voting for us on top server lists and spreading the word.
          The project is sustained through advertising and community support.
        </p>

        <div style={{ marginTop: 40, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a href="/" style={backLinkStyle}>← Back to R2H RSC</a>
          <a href="https://discord.gg/r2hrsc" style={backLinkStyle}>Join Discord →</a>
          <a href="https://r2hrsc.xyz/vote" style={backLinkStyle}>Vote for Us →</a>
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0a0a0a',
  padding: '40px 20px',
};

const containerStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  color: '#ccc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  lineHeight: 1.7,
};

const h1Style: React.CSSProperties = {
  color: '#fff',
  fontSize: 32,
  fontWeight: 700,
  marginBottom: 8,
};

const h2Style: React.CSSProperties = {
  color: '#e0e0e0',
  fontSize: 20,
  fontWeight: 600,
  marginTop: 32,
  marginBottom: 12,
};

const pStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.8,
  marginBottom: 16,
};

const listStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 2,
  marginBottom: 16,
  paddingLeft: 24,
};

const dateStyle: React.CSSProperties = {
  color: '#666',
  fontSize: 13,
  marginBottom: 24,
};

const linkStyle: React.CSSProperties = {
  color: '#14F195',
  textDecoration: 'none',
};

const backLinkStyle: React.CSSProperties = {
  color: '#14F195',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
};
