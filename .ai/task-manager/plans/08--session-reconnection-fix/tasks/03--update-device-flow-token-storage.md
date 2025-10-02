---
id: 3
group: 'token-management'
dependencies: [2]
status: 'pending'
created: '2025-10-02'
skills:
  - typescript
  - oauth
---

# Update Device Flow to Use User-Level Token Storage

## Objective

Modify `handleDeviceFlow` method to extract user IDs from OAuth tokens and store them in user-level
storage with session-to-user mapping.

## Skills Required

- **TypeScript**: Method refactoring, async/await patterns
- **OAuth**: Token handling, user ID extraction from JWT claims

## Acceptance Criteria

- [ ] `handleDeviceFlow` extracts user ID from access token
- [ ] Tokens stored in `userTokens` Map by user ID (not session ID)
- [ ] Session-to-user mapping created in `sessionToUser` Map
- [ ] Reconnection scenario handled: reuse existing tokens if user ID already exists
- [ ] Comprehensive logging for authentication and token storage events

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary><strong>Implementation Details</strong></summary>

### File Location

`src/index.ts` - `handleDeviceFlow` method (lines 319-353)

### Current Implementation

```typescript
async handleDeviceFlow(sessionId: string): Promise<TokenResponse> {
  // ... existing device flow logic ...
  const tokens = await deviceFlow.authenticate();

  // Store tokens for this session
  this.sessionTokens.set(sessionId, tokens);

  return tokens;
}
```

### New Implementation

```typescript
import { extractUserId } from './oauth/jwt-decoder.js';

async handleDeviceFlow(sessionId: string): Promise<TokenResponse> {
  if (!DeviceFlow.shouldUseDeviceFlow()) {
    throw new Error(
      'Device flow not appropriate for this environment. ' +
        'Set OAUTH_FORCE_DEVICE_FLOW=true to force device flow usage.'
    );
  }

  if (!this.oauthConfigManager) {
    throw new Error(
      'OAuth is not configured. Set AUTH_ENABLED=true to enable OAuth.'
    );
  }

  try {
    const config = this.oauthConfigManager.getConfig();
    const metadata = await this.oauthConfigManager.fetchMetadata();

    // Create device flow handler
    const deviceFlow = new DeviceFlow(config, metadata);

    // Execute authentication flow
    const tokens = await deviceFlow.authenticate();

    // Extract user ID from access token
    let userId: string;
    try {
      userId = extractUserId(tokens.access_token);
      console.log(`Extracted user ID from token: ${userId}`);
    } catch (error) {
      // Fallback: use session ID as user ID if JWT extraction fails
      console.warn(`Failed to extract user ID from token, using session ID as fallback:`, error);
      userId = sessionId;
    }

    // Check if user already has tokens (reconnection scenario)
    const existingTokens = this.userTokens.get(userId);
    if (existingTokens) {
      console.log(`User ${userId} reconnecting - reusing existing tokens`);
      // Update session-to-user mapping for new session
      this.sessionToUser.set(sessionId, userId);
      console.log(`Session ${sessionId} mapped to existing user ${userId}`);
      console.log(`Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`);
      return existingTokens; // Reuse existing tokens
    }

    // New user authentication: store tokens by user ID
    this.userTokens.set(userId, tokens);
    console.log(`Stored tokens for new user ${userId}`);

    // Map session to user (ephemeral)
    this.sessionToUser.set(sessionId, userId);
    console.log(`Session ${sessionId} authenticated as user ${userId}`);
    console.log(`Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`);

    return tokens;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Device flow authentication failed: ${error.message}`);
    }
    throw new Error('Device flow authentication failed: Unknown error');
  }
}
```

### Logging Strategy

Add structured logging for:

- User ID extraction success/failure
- Reconnection detection (existing user tokens found)
- New user authentication (first-time token storage)
- Session-to-user mapping creation
- Active counts (users and sessions)

### Reconnection Handling

Key logic:

```typescript
const existingTokens = this.userTokens.get(userId);
if (existingTokens) {
  // User reconnecting with new session
  this.sessionToUser.set(sessionId, userId); // Map new session to existing user
  return existingTokens; // Reuse tokens, don't create duplicates
}
```

</details>

## Input Dependencies

- JWT decoder utility from Task 1 (`extractUserId` function)
- Refactored data structures from Task 2 (`userTokens`, `sessionToUser` Maps)

## Output Artifacts

- Updated `handleDeviceFlow` method with user-level token storage
- Session-to-user mapping established on authentication
- Logging output showing user authentication flow

## Implementation Notes

The reconnection scenario is critical: when a user disconnects and reconnects, they authenticate
again with a NEW session ID but get the SAME user ID from their OAuth token. By checking if
`userTokens` already has that user ID, we can reuse existing tokens instead of creating duplicates.
This enables seamless reconnection without 403 errors.
