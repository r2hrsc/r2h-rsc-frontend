# R2H RSC — E2E Testing Guide (Next Session)

## STEP 1: VERIFY CLOUDFLARE ENV VARS

Go to: https://dash.cloudflare.com → r2hrsc → Workers & Pages → r2h-rsc-frontend → Settings → Environment variables

Verify these 4 variables exist (case-sensitive):
```
VITE_API_URL          = https://api.r2hrsc.xyz
VITE_WS_URL           = wss://game.r2hrsc.xyz
VITE_CACHE_CDN_URL    = https://game.r2hrsc.xyz/rsc-client
VITE_GOOGLE_CLIENT_ID = 293122558789-cs1p629kksvtulqsv6rpmh7mtctfuup1.apps.googleusercontent.com
```

If any are missing, add them, then go to Deployments → latest → Retry deployment.

## STEP 2: VERIFY GOOGLE CLOUD CONSOLE

Go to: https://console.cloud.google.com/apis/credentials

Click your OAuth client → verify Authorized JavaScript origins includes:
```
https://r2hrsc.xyz
https://www.r2hrsc.xyz
http://localhost:5173
```

## STEP 3: TEST GOOGLE LOGIN

1. Open https://r2hrsc.xyz in Chrome
2. Press F12 → click Console tab (to see errors)
3. Press F12 → click Network tab (to see requests)
4. Click "Sign in with Google"
5. Complete the Google sign-in popup
6. In the Network tab, look for a request to `auth/google`
   - Status should be 200
   - Click it → Preview tab → should show: `{"ok":true,"rscUsername":"...","rscPassword":"..."}`
7. If you see a 400 error, the Google Client ID is wrong or missing

## STEP 4: TEST WALLET LOGIN

1. Open https://r2hrsc.xyz in Chrome
2. Open Phantom wallet extension → make sure you're connected
3. Click "Connect Phantom / Solflare"
4. The wallet modal should appear → select Phantom
5. Click "Sign in with Wallet"
6. Phantom popup → click Approve
7. In Network tab, look for:
   - Request to `auth/wallet/nonce` → 200
   - Request to `auth/wallet` → 200

## STEP 5: VERIFY DATABASE

Open a terminal and SSH into the VPS:
```
ssh root@game.fuzzynuts.xyz
```

Query the database:
```
sqlite3 /opt/openrsc/server/inc/sqlite/preservation.db "SELECT id, username, auth_provider, external_id FROM players;"
```

You should see:
- Original players (Shafic, test, Fuzzynuts) with auth_provider='native'
- New test player with auth_provider='google' or 'wallet'

## STEP 6: VERIFY WEBSOCKET

1. Open https://r2hrsc.xyz in Chrome
2. Press F12 → Network tab → filter by "WS"
3. After login, look for a WebSocket connection to `game.r2hrsc.xyz`
4. Click it → Messages tab → you should see binary game data flowing
5. If no WS connection appears, check Console tab for errors

## STEP 7: WATCH SERVER LOGS

Open two terminals and SSH in:

Terminal 1 (sidecar):
```
ssh root@game.fuzzynuts.xyz "pm2 logs r2h-sidecar --lines 0"
```

Terminal 2 (java server):
```
ssh root@game.fuzzynuts.xyz "tail -f /opt/openrsc/server/server.log"
```

Watch for:
- Sidecar: "Google auth success" or "Wallet auth success"
- Java: "Bridge created account: ..." or "Bridge login for existing account: ..."

## KNOWN ISSUES TO WATCH FOR

1. If Google shows "Missing client_id" → VITE_GOOGLE_CLIENT_ID env var is missing
2. If wallet button does nothing → check Console for "Buffer is not defined" (polyfill issue)
3. If game canvas is black → check Network for failed requests to cache.r2hrsc.xyz or game.r2hrsc.xyz
4. If WebSocket fails → check Cloudflare SSL mode is "Full" for game.r2hrsc.xyz
