#!/bin/bash
# Quick HTTPS tunnel for local development
# This creates an HTTPS tunnel to your local dev server

echo "Starting Next.js dev server on port 3000..."
npm run dev &
DEV_PID=$!

# Wait for server to start
sleep 3

echo ""
echo "Starting HTTPS tunnel..."
echo "Install cloudflared if needed: brew install cloudflared (macOS) or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
echo ""

# Check if cloudflared is available
if command -v cloudflared &> /dev/null; then
    cloudflared tunnel --url http://localhost:3000
else
    echo "cloudflared not found. Installing..."
    echo ""
    echo "Alternative: Use ngrok instead:"
    echo "  npx ngrok http 3000"
    echo ""
    echo "Or install cloudflared:"
    echo "  macOS: brew install cloudflared"
    echo "  Linux: Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    echo ""
    echo "Press Ctrl+C to stop the dev server"
    wait $DEV_PID
fi

