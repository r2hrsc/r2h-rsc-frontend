#!/bin/bash
# ============================================================
# REVERT robinscape.xyz — undoes the 2026-09-12 domain mapping.
# Run ON THE VPS as root:  bash /root/domain-map-robinscape/revert.sh
# Everything it removes is additive; r2hrsc.xyz is never touched.
# ============================================================
set -e
TS() { date '+%F %T'; }
echo "[$(TS)] Revert starting"

DIR=/root/domain-map-robinscape

# 1) nginx: remove robinscape site, restore patched originals
rm -f /etc/nginx/sites-enabled/robinscape.xyz
cp $DIR/game.r2hrsc.xyz.bak /etc/nginx/sites-enabled/game.r2hrsc.xyz
cp $DIR/api.r2hrsc.xyz.bak  /etc/nginx/sites-enabled/api.r2hrsc.xyz
nginx -t && nginx -s reload
echo "[$(TS)] nginx reverted + reloaded"

# 2) rsc-client iframe bridge: restore original origin checks
cp $DIR/rsc-client-index.html.bak /var/www/rsc-client/index.html
echo "[$(TS)] rsc-client index.html restored"

# 3) chat server: back to default origins (no CHAT_ORIGINS env)
pm2 delete r2h-chat 2>/dev/null || true
pm2 resurrect 2>/dev/null || true
sleep 2
if ! pm2 pid r2h-chat >/dev/null 2>&1; then
    cd /opt/openrsc/sidecar && pm2 start /opt/openrsc/chat-server/index.js --name r2h-chat
fi
pm2 save
echo "[$(TS)] chat server reverted to default origins"

# 2b) pm2 resurrect may have restored CHAT_ORIGINS from dump; force-clean
if pm2 env 1 2>/dev/null | grep -q robinscape; then
    echo "NOTE: CHAT_ORIGINS still present — clearing env override"
    pm2 delete r2h-chat 2>/dev/null || true
    cd /opt/openrsc/sidecar && pm2 start /opt/openrsc/chat-server/index.js --name r2h-chat
    pm2 save
fi

# 4) website files (safe to keep; delete to free 6MB)
# rm -rf /var/www/robinscape-frontend

# 5) SSL cert: keep (harmless) or revoke:
# certbot delete --cert-name robinscape.xyz --non-interactive

# 6) DNS: run FROM A MACHINE WITH THE PORKBUN KEY (not the VPS):
#   Delete A records 583862738 (apex) and 583861863 (www) via porkbun API/dashboard,
#   optionally re-add the parked-page records:
#     ALIAS robinscape.xyz -> pixie.porkbun.com
#     CNAME *.robinscape.xyz -> pixie.porkbun.com

echo "[$(TS)] Revert complete (server side). See step 6 for DNS."
