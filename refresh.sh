#!/bin/bash
# SLEEPR Data Refresh - Run this to update your dashboard with latest data
# Usage: ./refresh.sh [--quick]

cd "$(dirname "$0")"

echo "🏀 SLEEPR Data Refresh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$1" = "--quick" ]; then
    echo "Mode: Quick (rosters only, ~5 seconds)"
    python3 scripts/refresh_data.py --quick
else
    echo "Mode: Full refresh with free agents (~3 minutes)"
    echo ""
    echo "This will fetch:"
    echo "  • Latest rosters from Sleeper"
    echo "  • Game logs for all 128 rostered players"
    echo "  • Game logs for top 100 free agents"
    echo "  • NBA schedule (games remaining this week)"
    echo ""
    python3 scripts/refresh_data.py --free-agents --free-agent-limit 100
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done! Refresh your browser to see updates."
