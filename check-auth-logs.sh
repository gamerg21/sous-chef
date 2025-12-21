#!/bin/bash
# Helper script to check authentication logs
# Run this in a separate terminal while testing sign-in

echo "=== Checking for Next.js dev server process ==="
ps aux | grep -E "next|node.*dev" | grep -v grep | head -3

echo ""
echo "=== To see authentication logs, check the terminal where you ran 'npm run dev' or 'pnpm dev' ==="
echo "=== Look for lines starting with [AUTH] ==="
echo ""
echo "=== Recent log files (if any) ==="
find .next -name "*.log" -type f 2>/dev/null | head -5 || echo "No log files found in .next directory"
echo ""
echo "=== Tip: Keep the Next.js dev server terminal visible to see [AUTH] logs in real-time ==="

