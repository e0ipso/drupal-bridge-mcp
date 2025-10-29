---
name: dev-monitor
description: Start and monitor MCP server, MCP Inspector, and Drupal logs
---
# Development Environment Monitor

This skill orchestrates the complete development environment by starting the MCP server, MCP Inspector, and monitoring logs from all services including the Drupal site.

## Overview

You will start and monitor:
1. **MCP Server** - The main server running on port 3000
2. **MCP Inspector** - Development tool for testing MCP connections
3. **Drupal Site Logs** - Monitor Drupal error logs and watchdog

## Execution Steps

Use your internal Todo tool to track execution:

- [ ] Check environment prerequisites
- [ ] Start MCP server in background
- [ ] Start MCP Inspector in background
- [ ] Set up log monitoring
- [ ] Display monitoring dashboard
- [ ] Provide instructions for stopping services

### 1. Environment Prerequisites

Check that required environment variables are configured:

```bash
# Check for required environment variables
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Using .env.example as reference."
fi

# Display current configuration
echo "=== Environment Configuration ==="
grep -E "^(DRUPAL_BASE_URL|OAUTH_CLIENT_ID|AUTH_ENABLED|LOG_LEVEL)" .env 2>/dev/null || echo "Using defaults"
echo ""
```

### 2. Start MCP Server

Start the MCP server with debug logging enabled:

```bash
# Kill any existing MCP server processes
pkill -f "node.*dist/index.js" 2>/dev/null || true
pkill -f "tsx.*src/index.ts" 2>/dev/null || true

echo "🚀 Starting MCP Server..."

# Start in development mode with debug logging
DEBUG=mcp:* npm run dev > /tmp/mcp-server.log 2>&1 &
MCP_PID=$!

echo "   PID: $MCP_PID"
echo "   Logs: /tmp/mcp-server.log"
echo "   Port: 3000"

# Wait for server to start
sleep 3

# Check if server started successfully
if ps -p $MCP_PID > /dev/null; then
    echo "✅ MCP Server started successfully"
else
    echo "❌ MCP Server failed to start. Check logs:"
    tail -n 20 /tmp/mcp-server.log
    exit 1
fi

echo ""
```

### 3. Start MCP Inspector

Start the MCP Inspector for interactive testing:

```bash
echo "🔍 Starting MCP Inspector..."

# Kill any existing inspector processes
pkill -f "@modelcontextprotocol/inspector" 2>/dev/null || true

# Start MCP Inspector
npx @modelcontextprotocol/inspector npm run start:http > /tmp/mcp-inspector.log 2>&1 &
INSPECTOR_PID=$!

echo "   PID: $INSPECTOR_PID"
echo "   Logs: /tmp/mcp-inspector.log"
echo "   URL: Check logs for inspector URL"

# Wait for inspector to start
sleep 5

# Check if inspector started successfully
if ps -p $INSPECTOR_PID > /dev/null; then
    echo "✅ MCP Inspector started successfully"
    # Extract and display the inspector URL
    grep -o "http://.*" /tmp/mcp-inspector.log | head -n 1 || echo "   Check /tmp/mcp-inspector.log for URL"
else
    echo "❌ MCP Inspector failed to start. Check logs:"
    tail -n 20 /tmp/mcp-inspector.log
fi

echo ""
```

### 4. Set Up Drupal Log Monitoring

Set up monitoring for Drupal watchdog logs:

```bash
echo "📊 Setting up Drupal log monitoring..."

# Drupal directory and log file
DRUPAL_DIR="/home/e0ipso/workspace/www/drupal-contrib/drupal"
DRUPAL_LOG="/tmp/drupal-watchdog.log"

# Start monitoring Drupal watchdog logs via drush
echo "   Starting watchdog tail in background..."
echo "=== Drupal Watchdog Logs ===" > $DRUPAL_LOG

(
    cd "$DRUPAL_DIR" && ddev drush watchdog:tail --extended >> $DRUPAL_LOG 2>&1 &
    WATCHDOG_PID=$!
    echo $WATCHDOG_PID > /tmp/drupal-watchdog.pid
    echo "   Watchdog PID: $WATCHDOG_PID"
) || echo "   ⚠️  Unable to start Drupal watchdog monitoring"

echo "   Logs: $DRUPAL_LOG"
echo ""
```

### 5. Display Monitoring Dashboard

Create a real-time monitoring display:

```bash
echo "════════════════════════════════════════════════════════════"
echo "         🎯 DEVELOPMENT ENVIRONMENT MONITOR ACTIVE"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📡 Service Status:"
echo "   • MCP Server:    Running (PID: $MCP_PID)"
echo "   • MCP Inspector: Running (PID: $INSPECTOR_PID)"
echo "   • Drupal Site:   http://drupal-contrib.ddev.site"
echo ""
echo "📁 Log Files:"
echo "   • MCP Server:    /tmp/mcp-server.log"
echo "   • MCP Inspector: /tmp/mcp-inspector.log"
echo "   • Drupal:        /tmp/drupal-watchdog.log"
echo ""
echo "🔧 Quick Commands:"
echo "   • View MCP logs:       tail -f /tmp/mcp-server.log"
echo "   • View Inspector logs: tail -f /tmp/mcp-inspector.log"
echo "   • View Drupal logs:    tail -f /tmp/drupal-watchdog.log"
echo "   • Live watchdog:       cd /home/e0ipso/workspace/www/drupal-contrib/drupal && ddev drush watchdog:tail --extended"
echo "   • Stop all services:   pkill -f 'node.*dist/index.js|tsx.*src/index|@modelcontextprotocol/inspector'"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
```

### 6. Initial Log Display

Show the most recent logs from each service:

```bash
echo "📋 Recent MCP Server Logs:"
echo "────────────────────────────────────────────────────────────"
tail -n 15 /tmp/mcp-server.log
echo ""

echo "📋 Recent MCP Inspector Logs:"
echo "────────────────────────────────────────────────────────────"
tail -n 15 /tmp/mcp-inspector.log
echo ""

if [ -f "/tmp/drupal-watchdog.log" ]; then
    echo "📋 Recent Drupal Watchdog Logs:"
    echo "────────────────────────────────────────────────────────────"
    tail -n 10 /tmp/drupal-watchdog.log
    echo ""
fi
```

### 7. Monitoring Instructions

Provide instructions for ongoing monitoring:

```bash
echo "💡 Monitoring Tips:"
echo ""
echo "1. Watch all logs in real-time:"
echo "   tail -f /tmp/mcp-server.log /tmp/mcp-inspector.log /tmp/drupal-watchdog.log"
echo ""
echo "2. Filter for errors only:"
echo "   tail -f /tmp/mcp-server.log | grep -i error"
echo ""
echo "3. Monitor OAuth authentication:"
echo "   tail -f /tmp/mcp-server.log | grep -i oauth"
echo ""
echo "4. Check tool invocations:"
echo "   tail -f /tmp/mcp-server.log | grep -i 'tool\\|jsonrpc'"
echo ""
echo "5. Live Drupal watchdog (direct):"
echo "   cd /home/e0ipso/workspace/www/drupal-contrib/drupal && ddev drush watchdog:tail --extended"
echo ""
echo "6. Stop all services:"
echo "   pkill -f 'node.*dist/index.js'; pkill -f 'tsx.*src/index'; pkill -f '@modelcontextprotocol/inspector'; kill \$(cat /tmp/drupal-watchdog.pid 2>/dev/null)"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "   ✨ Development environment is ready!"
echo "════════════════════════════════════════════════════════════"
```

## Process Management

### Background Process Tracking

The following background processes are started:
- **MCP Server**: Development server with hot reload
- **MCP Inspector**: Interactive testing tool
- **Drupal Log Monitor**: Continuous log streaming (if DDEV detected)

### Stopping Services

To stop all services manually:

```bash
# Stop MCP Server
pkill -f "node.*dist/index.js"
pkill -f "tsx.*src/index.ts"

# Stop MCP Inspector
pkill -f "@modelcontextprotocol/inspector"

# Stop Drupal watchdog monitoring
if [ -f /tmp/drupal-watchdog.pid ]; then
    kill $(cat /tmp/drupal-watchdog.pid) 2>/dev/null
    rm /tmp/drupal-watchdog.pid
fi
pkill -f "ddev drush watchdog:tail"

echo "✅ All services stopped"
```

### Health Checks

Monitor service health:

```bash
# Check if MCP server is responding
curl -s http://localhost:3000/health > /dev/null && echo "✅ MCP Server healthy" || echo "❌ MCP Server not responding"

# Check process status
ps aux | grep -E "(tsx.*src/index|@modelcontextprotocol/inspector)" | grep -v grep
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:

```bash
# Find process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run dev
```

### Services Won't Start

Check logs for errors:

```bash
cat /tmp/mcp-server.log
cat /tmp/mcp-inspector.log
```

Common issues:
- Missing environment variables in .env
- Port conflicts
- Missing dependencies (run `npm install`)

### Drupal Logs Not Available

If watchdog monitoring fails, check manually:

```bash
# Direct watchdog tail (requires DDEV)
cd /home/e0ipso/workspace/www/drupal-contrib/drupal
ddev drush watchdog:tail --extended

# Alternative: Check recent watchdog entries
ddev drush watchdog:show --count=50

# For standard Drupal (non-DDEV)
drush watchdog:tail --extended
```

## Notes

- All services run in the background, allowing you to continue working
- Log files persist in /tmp and can be monitored at any time
- Use the MCP Inspector URL to test tool invocations interactively
- Services remain running until explicitly stopped or system reboot
