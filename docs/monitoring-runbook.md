# MCP Server Monitoring Runbook

## Overview

This runbook provides operational procedures for monitoring the Drupalize.me MCP Server, including health check procedures, performance monitoring, alerting protocols, and incident response.

## Table of Contents

1. [Monitoring Architecture](#monitoring-architecture)
2. [Health Check Procedures](#health-check-procedures)
3. [Performance Monitoring](#performance-monitoring)
4. [Alert Management](#alert-management)
5. [Incident Response](#incident-response)
6. [Routine Monitoring Tasks](#routine-monitoring-tasks)
7. [Troubleshooting Procedures](#troubleshooting-procedures)
8. [Metrics and KPIs](#metrics-and-kpis)
9. [Escalation Procedures](#escalation-procedures)

## Monitoring Architecture

### Monitoring Stack Components

**Primary Monitoring:**
- **Health Check Server**: Built-in Express server with multiple endpoints
- **Railway Monitoring**: Platform-native monitoring and alerting
- **GitHub Actions**: CI/CD pipeline monitoring
- **Application Metrics**: In-memory metrics collection with time-series data

**External Integrations:**
- **External Health Monitoring**: UptimeRobot, Pingdom, or similar
- **Log Aggregation**: Railway logs with optional external forwarding
- **Security Scanning**: Snyk, CodeQL, Trivy integration

### Monitoring Endpoints

| Endpoint | Purpose | Response Time | Use Case |
|----------|---------|---------------|----------|
| `/health` | Comprehensive health status | 50-100ms | Manual verification, debugging |
| `/ready` | Deployment readiness | 20-50ms | CI/CD pipeline verification |
| `/live` | Process liveness | <10ms | Container orchestration |
| `/metrics` | Performance analytics | 30-80ms | Trend analysis, debugging |
| `/health/summary` | Lightweight status | 30-60ms | Frequent polling |

## Health Check Procedures

### 1. Manual Health Check

**Primary Health Check:**
```bash
# Replace with your actual Railway app URL
export APP_URL="https://mcp-server.railway.app"

# Comprehensive health check
curl -f -s "$APP_URL/health" | jq '.'
```

**Expected Healthy Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-04T10:30:00.000Z",
  "services": {
    "database": { "status": "up", "pool": {...} },
    "oauth": { "status": "up", "configured": true },
    "mcp_server": "up"
  },
  "performance": {
    "responseTime": "25ms",
    "totalRequests": 150,
    "errorRate": "0%"
  }
}
```

### 2. Service-Specific Checks

**Database Health:**
```bash
# Check database connectivity and performance
curl -s "$APP_URL/health" | jq '.services.database'

# Expected output:
{
  "status": "up",
  "pool": {
    "total": 5,
    "idle": 3,
    "active": 2
  },
  "metrics": {
    "totalOperations": 1250,
    "successRate": 0.998,
    "averageResponseTime": "12ms"
  }
}
```

**OAuth Service Health:**
```bash
# Check OAuth service status
curl -s "$APP_URL/health" | jq '.services.oauth'

# Expected output:
{
  "status": "up",
  "configured": true,
  "hasValidCredentials": true,
  "consecutiveFailures": 0,
  "metrics": {
    "totalOperations": 45,
    "successRate": "98%",
    "refreshSuccessRate": "100%"
  }
}
```

### 3. Performance Health Check

**Response Time Monitoring:**
```bash
# Measure response time with curl
curl -w "@curl-format.txt" -o /dev/null -s "$APP_URL/health"

# curl-format.txt contains:
# time_total: %{time_total}s
```

**Performance Thresholds:**
- **Health Endpoint**: <100ms (warning), <200ms (critical)
- **Ready Endpoint**: <50ms (warning), <100ms (critical)
- **Live Endpoint**: <10ms (warning), <25ms (critical)

### 4. MCP Protocol Health

**MCP SSE Endpoint:**
```bash
# Check MCP Server-Sent Events endpoint
curl -I -H "Accept: text/event-stream" "$APP_URL/mcp/sse"

# Expected: 200 OK or 405 Method Not Allowed
```

**OAuth Callback Endpoint:**
```bash
# Check OAuth callback availability
curl -I "$APP_URL/oauth/callback"

# Expected: 405 Method Not Allowed (GET not allowed)
```

## Performance Monitoring

### 1. Real-Time Metrics

**System Performance:**
```bash
# Get current system metrics
curl -s "$APP_URL/health" | jq '.system'

# Monitor key metrics:
# - Memory usage (RSS, Heap)
# - Uptime
# - Active connections
# - CPU usage trends
```

**Application Performance:**
```bash
# Get performance metrics
curl -s "$APP_URL/health" | jq '.performance'

# Key metrics:
# - Average response time
# - Total requests
# - Error rate
# - Active connections
```

### 2. Historical Metrics

**Metrics Endpoint:**
```bash
# Get last hour metrics (default)
curl -s "$APP_URL/metrics" | jq '.metrics'

# Get metrics since specific timestamp
TIMESTAMP=$(date -d "1 hour ago" +%s)000
curl -s "$APP_URL/metrics?since=$TIMESTAMP" | jq '.metrics'
```

**Key Performance Indicators:**
```bash
# Database performance
curl -s "$APP_URL/metrics" | jq '.metrics.database'

# OAuth performance
curl -s "$APP_URL/metrics" | jq '.metrics.oauth'

# HTTP performance
curl -s "$APP_URL/metrics" | jq '.metrics.http'
```

### 3. Railway Platform Monitoring

**Railway Dashboard Monitoring:**
1. Navigate to [Railway Dashboard](https://railway.app/dashboard)
2. Select MCP Server project
3. Review **Metrics** tab:
   - CPU usage
   - Memory usage
   - Network I/O
   - Response times
   - Error rates

**Railway Logs Monitoring:**
```bash
# View real-time logs via CLI
railway logs --follow

# View specific time range
railway logs --since 1h

# Filter by level
railway logs --level error
```

### 4. Performance Alerting Thresholds

**Critical Alerts (Immediate Response Required):**
- Health check failure (5xx responses)
- Database connection failures
- Memory usage >90%
- Error rate >5%
- Response time >500ms sustained

**Warning Alerts (Monitor and Investigate):**
- Health check response time >100ms
- Memory usage >70%
- Error rate >1%
- Database connection pool exhaustion
- OAuth consecutive failures >3

## Alert Management

### 1. Alert Sources

**Railway Native Alerts:**
- Platform-level resource alerts (CPU, memory, disk)
- Application crash and restart notifications
- Deployment success/failure notifications

**External Monitoring Alerts:**
- Health endpoint monitoring (UptimeRobot/Pingdom)
- Response time degradation
- SSL certificate expiration
- Domain resolution issues

**Application-Level Alerts:**
- Health check failures
- Database connection issues
- OAuth authentication failures
- High error rates

### 2. Alert Configuration

**Railway Alert Setup:**
1. Railway Dashboard → Project → Settings → Notifications
2. Configure notification channels (email, Slack, webhook)
3. Set alert thresholds:
   - CPU > 80% for 5 minutes
   - Memory > 90% for 5 minutes
   - Application crashes

**External Monitor Setup:**
```bash
# UptimeRobot configuration example
Monitor URL: https://mcp-server.railway.app/health
Monitor Type: HTTP(s)
Monitor Interval: 1 minute
Alert Contacts: [email/SMS/Slack]
Keyword Monitoring: "healthy"
```

### 3. Alert Response Procedures

**Critical Alert Response (0-15 minutes):**
1. Acknowledge alert immediately
2. Check Railway dashboard for platform issues
3. Verify health endpoints manually
4. Check recent deployments and changes
5. Initiate rollback if deployment-related
6. Escalate if platform issue

**Warning Alert Response (0-60 minutes):**
1. Acknowledge alert
2. Investigate root cause
3. Monitor trends and patterns
4. Document findings
5. Schedule maintenance if needed
6. Update monitoring thresholds if necessary

## Incident Response

### 1. Incident Classification

**P0 - Critical (Complete Service Outage):**
- Health endpoint returning 5xx errors
- Application completely unresponsive
- Database completely unavailable
- Security breach or data compromise

**P1 - High (Significant Performance Degradation):**
- Health endpoint slow (>500ms)
- Database connection issues
- OAuth authentication failures
- High error rates (>5%)

**P2 - Medium (Minor Issues):**
- Intermittent performance issues
- Non-critical feature failures
- Monitoring false positives
- Resource usage warnings

**P3 - Low (Maintenance and Improvements):**
- Performance optimization opportunities
- Monitoring enhancement requests
- Documentation updates
- Dependency updates

### 2. Incident Response Workflow

**Initial Response (0-5 minutes):**
```bash
# 1. Verify incident with health checks
curl -f "$APP_URL/health" || echo "Health check failed"
curl -f "$APP_URL/ready" || echo "Readiness check failed"
curl -f "$APP_URL/live" || echo "Liveness check failed"

# 2. Check Railway status
# Visit: https://status.railway.app/

# 3. Review recent changes
railway logs --since 30m
```

**Assessment Phase (5-15 minutes):**
```bash
# 1. Detailed health analysis
curl -s "$APP_URL/health" | jq '.' > health_status.json

# 2. Check system resources
curl -s "$APP_URL/health" | jq '.system.memoryUsage'

# 3. Review error patterns
railway logs --level error --since 1h

# 4. Check database health
curl -s "$APP_URL/health" | jq '.services.database'
```

**Resolution Phase:**
1. **Immediate Mitigation**
   - Rollback if deployment-related
   - Scale resources if resource issue
   - Restart services if stuck processes

2. **Root Cause Analysis**
   - Review logs and metrics
   - Identify trigger event
   - Document timeline

3. **Verification**
   - Confirm service restoration
   - Monitor for recurrence
   - Update monitoring if needed

### 3. Rollback Procedures

**Automatic Rollback (CI/CD):**
- Deployment pipeline includes automatic rollback on health check failure
- Monitor rollback process via GitHub Actions

**Manual Rollback:**
```bash
# Via Railway CLI
railway rollback

# Via Railway Dashboard
# 1. Go to Deployments
# 2. Select previous successful deployment
# 3. Click "Rollback to this deployment"
```

**Post-Rollback Verification:**
```bash
# Verify service restoration
curl -f "$APP_URL/health"
curl -f "$APP_URL/ready" 
curl -f "$APP_URL/live"

# Check all critical endpoints
curl -I "$APP_URL/mcp/sse"
curl -I "$APP_URL/oauth/callback"
```

## Routine Monitoring Tasks

### Daily Tasks

**Morning Health Check (Business Hours Start):**
```bash
#!/bin/bash
# daily-health-check.sh

APP_URL="https://mcp-server.railway.app"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "=== Daily Health Check - $DATE ===" 

# Basic health checks
echo "Health endpoint:"
curl -f -s "$APP_URL/health" | jq '.status, .services'

echo -e "\nPerformance metrics:"
curl -f -s "$APP_URL/health" | jq '.performance'

echo -e "\nSystem resources:"
curl -f -s "$APP_URL/health" | jq '.system.memoryUsage, .system.uptime'

echo -e "\n=== End Health Check ==="
```

**Performance Review:**
- Review Railway dashboard metrics
- Check response time trends
- Monitor error rate patterns
- Review resource utilization trends

### Weekly Tasks

**Weekly Performance Report:**
```bash
#!/bin/bash
# weekly-performance-report.sh

# Generate performance metrics for the week
WEEK_AGO=$(date -d "1 week ago" +%s)000
curl -s "$APP_URL/metrics?since=$WEEK_AGO" > weekly-metrics.json

# Key metrics to review:
echo "Weekly Performance Summary:"
jq '.metrics.performance' weekly-metrics.json
jq '.metrics.database' weekly-metrics.json
jq '.metrics.oauth' weekly-metrics.json
```

**Security Review:**
- Review security scan results from CI/CD
- Check for dependency vulnerabilities
- Verify SSL certificate expiration dates
- Review access logs for anomalies

### Monthly Tasks

**Infrastructure Review:**
- Review Railway resource usage and costs
- Evaluate performance trends and capacity needs
- Update monitoring thresholds based on trends
- Review and update alert configurations

**Disaster Recovery Testing:**
- Test backup restoration procedures
- Verify rollback procedures
- Review incident response procedures
- Update documentation as needed

## Troubleshooting Procedures

### 1. Health Check Failures

**Symptom:** `/health` endpoint returning 503 or timing out

**Investigation Steps:**
```bash
# 1. Check basic connectivity
curl -I "$APP_URL/"

# 2. Check individual services
curl -s "$APP_URL/health" | jq '.services'

# 3. Check system resources
curl -s "$APP_URL/health" | jq '.system'

# 4. Review recent logs
railway logs --level error --since 10m
```

**Common Causes and Solutions:**
- **Database connection issues**: Check DATABASE_URL and connection pool
- **OAuth misconfiguration**: Verify OAUTH_* environment variables
- **Resource exhaustion**: Check memory and CPU usage, consider scaling
- **Application errors**: Review logs for exceptions and stack traces

### 2. Performance Degradation

**Symptom:** Slow response times (>200ms consistently)

**Investigation Steps:**
```bash
# 1. Measure current performance
curl -w "%{time_total}\n" -o /dev/null -s "$APP_URL/health"

# 2. Check performance metrics
curl -s "$APP_URL/metrics" | jq '.metrics.performance'

# 3. Check database performance
curl -s "$APP_URL/health" | jq '.services.database.metrics'

# 4. Review system resources
curl -s "$APP_URL/health" | jq '.system.memoryUsage'
```

**Optimization Steps:**
1. **Database Optimization**
   - Check connection pool configuration
   - Review slow query patterns
   - Consider connection pooling adjustments

2. **Application Optimization**
   - Review memory usage patterns
   - Check for memory leaks
   - Optimize inefficient code paths

3. **Infrastructure Scaling**
   - Consider Railway plan upgrade
   - Evaluate resource allocation
   - Implement caching strategies

### 3. Database Connection Issues

**Symptom:** Database health checks failing

**Investigation Steps:**
```bash
# 1. Check database service status
curl -s "$APP_URL/health" | jq '.services.database'

# 2. Test direct database connection
railway run node -e "
const pg = require('pg');
const client = new pg.Client(process.env.DATABASE_URL);
client.connect().then(() => {
  console.log('Database connected');
  client.end();
}).catch(err => console.error('Database error:', err.message));
"

# 3. Check connection pool status
curl -s "$APP_URL/health" | jq '.services.database.pool'
```

**Resolution Steps:**
1. **Connection Pool Issues**
   - Review pool configuration (min/max connections)
   - Check for connection leaks
   - Restart application if pool exhausted

2. **Database Service Issues**
   - Check Railway PostgreSQL service status
   - Review database logs in Railway dashboard
   - Contact Railway support if service issue

3. **SSL/TLS Issues**
   - Verify SSL configuration
   - Check certificate validity
   - Review SSL mode settings

## Metrics and KPIs

### 1. Performance KPIs

**Response Time Targets:**
- Health endpoint: <50ms (excellent), <100ms (good), <200ms (acceptable)
- Ready endpoint: <25ms (excellent), <50ms (good), <100ms (acceptable)
- Live endpoint: <5ms (excellent), <10ms (good), <25ms (acceptable)

**Availability Targets:**
- Overall uptime: 99.9% (8.76 hours downtime/year)
- Health check success rate: >99.5%
- Database connectivity: >99.8%
- OAuth service availability: >99.5%

**Performance Metrics:**
- Error rate: <0.1% (excellent), <1% (good), <5% (acceptable)
- Database query time: <20ms average
- Memory usage: <70% (good), <80% (warning), >90% (critical)
- CPU usage: <60% (good), <80% (warning), >90% (critical)

### 2. Business KPIs

**User Experience:**
- MCP connection success rate: >99%
- OAuth authentication success rate: >98%
- Content retrieval success rate: >99%
- Average session duration: Monitor trends

**Operational Efficiency:**
- Deployment frequency: Track releases
- Mean time to recovery (MTTR): <30 minutes
- Change failure rate: <5%
- Lead time for changes: Track and optimize

### 3. Security KPIs

**Security Metrics:**
- Security scan failures: 0 critical vulnerabilities
- SSL certificate validity: >30 days remaining
- Failed authentication attempts: Monitor patterns
- Dependency vulnerability count: <5 medium or higher

## Escalation Procedures

### 1. Escalation Matrix

**Level 1 - Application Team:**
- Application performance issues
- Configuration problems
- Minor service degradations
- Routine maintenance

**Level 2 - Platform Team:**
- Railway platform issues
- Database service problems
- Network connectivity issues
- Infrastructure scaling

**Level 3 - External Support:**
- Railway platform outages
- Critical security incidents
- Data corruption issues
- Major infrastructure failures

### 2. Contact Information

**Railway Support:**
- Dashboard: https://railway.app/help
- Email: help@railway.app
- Response SLA: <4 hours business, <8 hours critical

**GitHub Support:**
- Dashboard: https://support.github.com
- Actions issues: GitHub Community
- Security issues: security@github.com

**Project Maintainers:**
- Primary: [See CONTRIBUTING.md]
- Secondary: [See CONTRIBUTING.md]
- Emergency: [Project documentation]

### 3. Escalation Triggers

**Immediate Escalation (P0):**
- Complete service outage >5 minutes
- Data loss or corruption
- Security breach indicators
- Platform-wide issues affecting multiple services

**Scheduled Escalation (P1/P2):**
- Performance degradation >30 minutes
- Partial feature outages
- Resource exhaustion warnings
- Repeated intermittent issues

**Communication Protocol:**
1. **Initial Notification**: Acknowledge incident within 5 minutes
2. **Status Updates**: Every 15 minutes during active incident
3. **Resolution Notification**: Immediate notification when resolved
4. **Post-Incident Report**: Within 24 hours of resolution

## Emergency Procedures

### 1. Emergency Contacts

**Immediate Response Team:**
- On-call engineer: [Contact information]
- Backup engineer: [Contact information]
- Project owner: [Contact information]

**Emergency Escalation:**
- Railway critical support
- GitHub security team (if security-related)
- Legal/compliance team (if data breach)

### 2. Emergency Response Checklist

**Critical Incident Response:**
- [ ] Acknowledge alert immediately
- [ ] Assess impact and classify severity
- [ ] Implement immediate containment
- [ ] Notify stakeholders and users
- [ ] Document timeline and actions
- [ ] Coordinate with external teams
- [ ] Monitor resolution progress
- [ ] Verify full service restoration
- [ ] Conduct post-incident review

### 3. Communication Templates

**Status Page Update:**
```
INCIDENT: MCP Server Performance Issues
Status: Investigating
Started: [Timestamp]
Update: We are investigating reports of slow response times and intermittent connectivity issues with the MCP server. We are actively working to resolve this issue and will provide updates every 15 minutes.
```

**Resolution Notification:**
```
RESOLVED: MCP Server Performance Issues
Status: Resolved
Duration: [Duration]
Resolution: The performance issues have been resolved through [brief explanation]. All services are now operating normally. A full post-incident report will be available within 24 hours.
```