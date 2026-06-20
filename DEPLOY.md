# R2H RSC Frontend — Deployment Guide

## PHASE 1: LOCAL SETUP (3 commands)

Open a terminal on your local machine:

```bash
cd /home/jeetmachine/hermes-workspace/r2h-frontend
npm install
npm run dev
```

Opens at http://localhost:5173. You'll see the auth overlay on a black background.
Ctrl+C to stop when you're done previewing.

## PHASE 2: GITHUB WEB UI (Upload the code)

### 2.1 Create the repository

1. Go to https://github.com/new
2. Repository name: `r2h-rsc-frontend`
3. Leave it **Public** (Cloudflare Pages free tier needs public, or use a Pro account)
4. Do NOT check "Add a README" or any other boxes
5. Click **Create repository**

### 2.2 Upload files via web UI

You'll see a "Quick setup" page. Click **"uploading an existing file"** link
(you may need to scroll down to find it).

In the upload area, drag and drop the ENTIRE `r2h-frontend` folder contents.
**Upload these files and folders:**

```
package.json
tsconfig.json
vite.config.ts
index.html
public/
src/
  main.tsx
  App.tsx
  index.css
  vite-env.d.ts
  components/
    GameCanvas.tsx
    AuthOverlay.tsx
  hooks/
    useAutoLogin.ts
```

**IMPORTANT:** Do NOT upload `node_modules/` — it will be installed during build.

At the bottom, type commit message: `initial commit`
Click **Commit changes**.

## PHASE 3: CLOUDFLARE PAGES (Connect the repo)

1. Go to https://dash.cloudflare.com
2. Click **Workers & Pages** in the left sidebar
3. Click **Create** button (top right)
4. Click the **Pages** tab
5. Click **Connect to Git**
6. Click **Connect GitHub** — authorize Cloudflare in the popup
7. Select the `r2h-rsc-frontend` repository
8. Click **Begin setup**

## PHASE 4: BUILD SETTINGS

On the "Set up builds and deployments" page:

| Field | Value |
|---|---|
| Production branch | `main` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |

Click **Save and Deploy**.

Wait for the build to finish (2-3 minutes). You'll get a URL like
`r2h-rsc-frontend.pages.dev`.

## PHASE 5: ENVIRONMENT VARIABLES

After the first build completes:

1. Go to your project in Cloudflare Pages
2. Click **Settings** tab
3. Click **Environment variables** in the left sidebar
4. Click **Add variable** and add each of these:

| Variable name | Value |
|---|---|
| `VITE_API_URL` | `https://api.r2hrsc.xyz` |
| `VITE_WS_URL` | `wss://game.r2hrsc.xyz` |
| `VITE_CACHE_CDN_URL` | `https://cache.r2hrsc.xyz` |
| `VITE_GOOGLE_CLIENT_ID` | `293122558789-cs1p629kksvtulqsv6rpmh7mtctfuup1.apps.googleusercontent.com` |

For each variable:
- Click **Add variable**
- Type the name (e.g. `VITE_API_URL`)
- Type the value
- Set "Encrypt" to ON (optional but recommended)
- Click **Save**

After adding all 4 variables:
5. Click **Deployments** tab
6. Click the **...** menu on the latest deployment
7. Click **Retry deployment**

## PHASE 6: CUSTOM DOMAIN

1. In your Cloudflare Pages project, click **Custom domains** tab
2. Click **Set up a custom domain**
3. Type: `r2hrsc.xyz`
4. Click **Continue**
5. Cloudflare will say "DNS record will be added" — click **Activate domain**
6. Wait 1-2 minutes for SSL provisioning

Also add `www.r2hrsc.xyz`:
7. Click **Set up a custom domain** again
8. Type: `www.r2hrsc.xyz`
9. Click **Continue** → **Activate domain**

Your site is now live at https://r2hrsc.xyz

---

## CRITICAL: WebSocket Mixed Content Fix

The frontend is served over HTTPS. Browsers BLOCK `ws://` connections from
HTTPS pages. The game server runs plain WebSocket on port 43494.

You need an Nginx WSS proxy on the VPS. SSH into the VPS and run:

```bash
cat > /etc/nginx/sites-available/game.r2hrsc.xyz << 'NGINXEOF'
server {
    listen 443 ssl;
    server_name game.r2hrsc.xyz;

    ssl_certificate /etc/letsencrypt/live/game.fuzzynuts.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.fuzzynuts.xyz/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:43494;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/game.r2hrsc.xyz /etc/nginx/sites-enabled/
nginx -t
```

If nginx -t says OK:

```bash
systemctl reload nginx
```

Then in Cloudflare DNS:
- Add A record: `game` → `67.205.132.6` (proxied orange cloud ON)
- Or if already exists, make sure it's proxied

Then get SSL cert:

```bash
certbot --nginx -d game.r2hrsc.xyz --non-interactive --agree-tos --email admin@r2hrsc.xyz
```

After this, `wss://game.r2hrsc.xyz` will connect through Nginx → localhost:43494 (plain WS).

---

## File Structure

```
r2h-frontend/
├── index.html              ← Entry point
├── package.json            ← Dependencies
├── tsconfig.json           ← TypeScript config
├── vite.config.ts          ← Vite config
├── public/                 ← Static assets
└── src/
    ├── main.tsx            ← React root + Google OAuth provider
    ├── App.tsx             ← Layout: canvas + auth overlay + Solana providers
    ├── index.css           ← Global styles
    ├── vite-env.d.ts       ← Env type definitions
    ├── components/
    │   ├── GameCanvas.tsx  ← Loads mudclient.js from cache CDN
    │   └── AuthOverlay.tsx ← Google + Solana wallet auth
    └── hooks/
        └── useAutoLogin.ts ← Injects RSC creds into mudclient
```

## How It Works

1. User visits r2hrsc.xyz → sees auth overlay on black canvas
2. User clicks "Sign in with Google" or "Connect Phantom"
3. Frontend POSTs to api.r2hrsc.xyz → gets { rscUsername, rscPassword }
4. Auth overlay hides → GameCanvas loads mudclient.js from cache.r2hrsc.xyz
5. useAutoLogin hook injects the 12-char RSC credentials into the client
6. Client connects to wss://game.r2hrsc.xyz → game loads
