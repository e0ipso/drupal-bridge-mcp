# Secret Management & Security Procedures

This document outlines the security procedures, secret management, and rotation policies for the Drupalize.me MCP Server.

## Table of Contents

- [Secret Categories](#secret-categories)
- [Secret Storage](#secret-storage)
- [Rotation Policies](#rotation-policies)
- [Security Procedures](#security-procedures)
- [Incident Response](#incident-response)
- [Compliance](#compliance)

## Secret Categories

### Critical Secrets (High Security)

These secrets have full access to production systems and must be rotated immediately if compromised:

- **OAuth Client Secret** (`OAUTH_CLIENT_SECRET`)
  - Purpose: Authentication with Drupal OAuth provider
  - Storage: Railway environment variables (encrypted)
  - Rotation: Every 90 days or immediately if compromised
  - Backup: Store previous version for 24 hours during rotation

- **Session Secret** (`SESSION_SECRET`)
  - Purpose: Encrypting user sessions and JWT tokens
  - Requirements: Minimum 32 characters, cryptographically random
  - Storage: Railway environment variables (encrypted)
  - Rotation: Every 180 days or immediately if compromised

- **Database Credentials** (`DATABASE_URL` or individual components)
  - Purpose: PostgreSQL database access
  - Storage: Railway managed (automatic rotation available)
  - Rotation: Every 120 days or use Railway auto-rotation
  - Special: SSL/TLS required in production

### Moderate Secrets (Medium Security)

- **OAuth Client ID** (`OAUTH_CLIENT_ID`)
  - Purpose: OAuth client identification
  - Storage: Railway environment variables
  - Rotation: When OAuth client is recreated (with secret rotation)

- **API Keys** (Third-party integrations)
  - Purpose: External service authentication
  - Storage: Railway environment variables (encrypted)
  - Rotation: Per provider recommendations (typically 90-365 days)

### Configuration Secrets (Low Security)

- **CORS Origins** (`CORS_ORIGINS`)
  - Purpose: Cross-origin request configuration
  - Storage: Railway environment variables
  - Rotation: When client applications change

## Secret Storage

### Railway Platform (Primary)

**Environment Variables:**
```bash
# Critical secrets (Railway UI only - never in code)
OAUTH_CLIENT_SECRET=<secret-value>
SESSION_SECRET=<secret-value>

# Database (Railway managed)
DATABASE_URL=postgresql://user:password@host:port/db

# Configuration
CORS_ORIGINS=https://drupalize.me,https://claude.ai
```

**Security Features:**
- Encrypted at rest and in transit
- Access logging and audit trails
- Role-based access control
- Automatic deployment on changes

### GitHub Secrets (CI/CD)

**Repository Secrets:**
```yaml
# Security scanning
SNYK_TOKEN: <snyk-api-token>
CODECOV_TOKEN: <codecov-token>

# Optional deployment keys
RAILWAY_TOKEN: <railway-cli-token>
```

### Local Development

**Never store production secrets locally:**
- Use `.env.example` template with placeholder values
- Generate random secrets for local development
- Use mock authentication when possible

```bash
# .env (local only)
OAUTH_CLIENT_SECRET=mock-secret-for-development
SESSION_SECRET=dev-secret-key-at-least-32-chars-long
MOCK_OAUTH=true
```

## Rotation Policies

### Scheduled Rotation

| Secret Type | Frequency | Process |
|-------------|-----------|---------|
| OAuth Client Secret | 90 days | Manual via Drupal admin |
| Session Secret | 180 days | Generate new random value |
| Database Password | 120 days | Railway auto-rotation |
| API Keys | Provider-specific | Follow provider guidelines |

### Emergency Rotation

**Triggers for immediate rotation:**
- Suspected security breach
- Secret accidentally exposed (logs, code, etc.)
- Employee access revocation
- Security audit findings
- Provider security notifications

**Emergency Response Timeline:**
1. **0-15 minutes:** Disable compromised secret
2. **15-30 minutes:** Generate and deploy new secret
3. **30-60 minutes:** Verify system functionality
4. **1-24 hours:** Complete incident documentation

### Rotation Process

#### 1. OAuth Client Secret Rotation

```bash
# 1. Access Drupal admin panel
# 2. Navigate to OAuth clients configuration
# 3. Generate new client secret
# 4. Update Railway environment variables
railway variables set OAUTH_CLIENT_SECRET="new_secret_value"

# 5. Deploy and verify
railway up
railway logs

# 6. Remove old secret from Drupal after verification
```

#### 2. Session Secret Rotation

```bash
# 1. Generate new cryptographically secure secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 2. Update Railway environment variable
railway variables set SESSION_SECRET="new_session_secret"

# 3. Deploy (will invalidate existing sessions)
railway up

# 4. Monitor for any authentication issues
```

#### 3. Database Credential Rotation

```bash
# Option 1: Railway auto-rotation (recommended)
railway postgres:rotate

# Option 2: Manual rotation
# 1. Create new user in PostgreSQL
# 2. Grant permissions to new user
# 3. Update DATABASE_URL
# 4. Deploy and verify
# 5. Remove old user
```

## Security Procedures

### Access Control

**Railway Platform Access:**
- Only authorized DevOps personnel
- Multi-factor authentication required
- Regular access review (quarterly)
- Session timeout enforcement

**Drupal OAuth Management:**
- Only Drupal administrators
- Separate admin account for OAuth management
- Regular permission audits

### Secret Generation

**Requirements:**
- Use cryptographically secure random generators
- Minimum entropy requirements:
  - Session secrets: 256 bits (64 hex chars)
  - API keys: Per provider requirements
- No dictionary words or patterns

**Tools:**
```bash
# Node.js crypto module
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32

# Python
python -c "import secrets; print(secrets.token_hex(32))"
```

### Monitoring and Alerting

**Secret Usage Monitoring:**
- Failed authentication attempts
- Unusual access patterns
- Geographic anomalies
- Rate limit violations

**Alerting Triggers:**
- Multiple authentication failures
- Secret rotation overdue
- Unauthorized access attempts
- Configuration changes

### Backup and Recovery

**Secret Backup:**
- Previous versions retained for 24 hours during rotation
- Encrypted backup storage (Railway managed)
- No local backups of production secrets

**Recovery Procedures:**
1. Verify secret compromise scope
2. Generate new secrets immediately
3. Update all dependent systems
4. Revoke compromised secrets
5. Document incident and lessons learned

## Incident Response

### Security Incident Classification

**Level 1 - Critical:**
- Production secrets confirmed compromised
- Unauthorized data access
- Service completely unavailable

**Level 2 - High:**
- Suspected secret compromise
- Authentication bypass detected
- Partial service disruption

**Level 3 - Medium:**
- Security policy violations
- Failed rotation procedures
- Non-critical configuration issues

### Response Procedures

#### Immediate Response (0-30 minutes)

1. **Assess and Contain:**
   - Identify compromised secrets
   - Disable compromised authentication
   - Preserve evidence and logs

2. **Communicate:**
   - Notify security team
   - Create incident ticket
   - Establish communication channel

3. **Mitigate:**
   - Rotate compromised secrets
   - Deploy security patches
   - Monitor for further compromise

#### Recovery Phase (30 minutes - 4 hours)

1. **Restore Services:**
   - Deploy new secrets
   - Verify system functionality
   - Monitor authentication flows

2. **Investigate:**
   - Review access logs
   - Identify attack vectors
   - Document timeline

#### Post-Incident (1-7 days)

1. **Analysis:**
   - Root cause analysis
   - Security control effectiveness review
   - Process improvement recommendations

2. **Documentation:**
   - Incident report
   - Lessons learned
   - Security control updates

## Compliance

### Audit Trail

**Required Logging:**
- Secret rotation events
- Access to secret management systems
- Failed authentication attempts
- Configuration changes

**Log Retention:**
- Security events: 1 year
- Access logs: 90 days
- Rotation events: 2 years

### Regular Reviews

**Monthly:**
- Secret usage monitoring
- Failed authentication analysis
- Access control review

**Quarterly:**
- Secret rotation compliance
- Security policy updates
- Access permission audit

**Annually:**
- Complete security assessment
- Incident response plan testing
- Third-party security audit

### Documentation Requirements

**Maintained Documents:**
- This secret management policy
- Incident response procedures
- Security architecture documentation
- Access control matrices

**Review Schedule:**
- Policy review: Quarterly
- Procedure updates: After incidents
- Architecture review: Semi-annually

## Emergency Contacts

**Security Team:**
- Primary: [security-team@organization.com]
- Secondary: [devops-team@organization.com]

**Escalation:**
- Security Manager: [security-manager@organization.com]
- CTO: [cto@organization.com]

**External:**
- Railway Support: support@railway.app
- Drupal Security Team: security@drupal.org

---

**Document Version:** 1.0  
**Last Updated:** 2025-09-04  
**Next Review:** 2025-12-04  
**Owner:** DevOps/Security Team