---
id: 3
group: 'mcp-integration'
dependencies: [2]
status: 'pending'
created: '2025-09-29'
skills: ['typescript', 'oauth']
---

# Implement Device Authorization Grant Flow Support

## Objective

Add RFC 8628 Device Authorization Grant support to the MCP server for headless environments like
Docker containers and terminal applications, with automatic flow detection and user-friendly
authentication experience.

## Skills Required

- **typescript**: Async flow implementation, error handling, and console output formatting
- **oauth**: Device Authorization Grant flow, polling logic, and security considerations

## Acceptance Criteria

- [ ] Automatic detection of headless environments (no browser available)
- [ ] Device authorization request implementation with proper error handling
- [ ] User-friendly display of verification URL and user code
- [ ] Automatic polling for token with exponential backoff
- [ ] Graceful handling of expired codes and authorization failures
- [ ] Integration with MCP SDK token storage
- [ ] Console output formatted for optimal user experience

## Technical Requirements

- RFC 8628 Device Authorization Grant endpoints from Drupal
- User code display format: 8-character codes (BCDFGHJKLMNPQRSTVWXZ charset)
- Polling interval: 5-15 seconds with configurable backoff
- Code lifetime: 30 minutes maximum
- Error handling for: authorization_pending, slow_down, expired_token, access_denied

## Input Dependencies

- OAuth client configuration from Task 2
- Device authorization endpoint from Drupal OAuth server
- MCP server framework and transport setup

## Output Artifacts

- Device flow handler module
- Environment detection utilities
- User interface for device authentication
- Polling logic with proper error handling

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Environment Detection

Implement logic to detect when device flow should be used:

```typescript
class DeviceFlowDetector {
  static isHeadlessEnvironment(): boolean {
    // Check for Docker environment
    if (
      process.env.CONTAINER === 'true' ||
      process.env.IS_DOCKER === 'true' ||
      process.env.DOCKER_CONTAINER === 'true'
    ) {
      return true;
    }

    // Check if running in CI/CD
    if (process.env.CI === 'true' || process.env.CONTINUOUS_INTEGRATION === 'true') {
      return true;
    }

    // Check if display is available (Linux/Unix)
    if (process.platform !== 'win32' && !process.env.DISPLAY) {
      return true;
    }

    // Check if terminal only (no GUI)
    if (process.env.TERM && !process.env.DESKTOP_SESSION) {
      return true;
    }

    return false;
  }

  static shouldUseDeviceFlow(): boolean {
    // Allow manual override
    if (process.env.OAUTH_FORCE_DEVICE_FLOW === 'true') {
      return true;
    }

    if (process.env.OAUTH_FORCE_BROWSER_FLOW === 'true') {
      return false;
    }

    return this.isHeadlessEnvironment();
  }
}
```

### Step 2: Device Authorization Request

Implement the device authorization initiation:

```typescript
interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

class DeviceFlowHandler {
  constructor(
    private oauthClient: OAuthClient,
    private metadata: any
  ) {}

  async initiateDeviceFlow(): Promise<DeviceAuthResponse> {
    const deviceAuthEndpoint = this.metadata.device_authorization_endpoint;

    const params = new URLSearchParams({
      client_id: process.env.OAUTH_CLIENT_ID!,
      scope: 'read:tutorials write:tutorials profile',
    });

    try {
      const response = await fetch(deviceAuthEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Device authorization failed: ${response.status} - ${error}`);
      }

      const deviceAuth: DeviceAuthResponse = await response.json();

      // Validate required fields
      if (!deviceAuth.device_code || !deviceAuth.user_code || !deviceAuth.verification_uri) {
        throw new Error('Invalid device authorization response - missing required fields');
      }

      return deviceAuth;
    } catch (error) {
      throw new Error(`Failed to initiate device flow: ${error.message}`);
    }
  }
}
```

### Step 3: User-Friendly Authentication Display

Create an attractive console interface for user authentication:

```typescript
class DeviceAuthUI {
  static displayAuthInstructions(deviceAuth: DeviceAuthResponse) {
    const { user_code, verification_uri, verification_uri_complete, expires_in } = deviceAuth;

    console.log('\n╭──────────────────────────────────────────────────────╮');
    console.log('│              🔐 MCP Server Authentication            │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log('│                                                      │');
    console.log('│  Please complete authentication in your browser:    │');
    console.log('│                                                      │');
    console.log(`│  📱 Visit: ${verification_uri.padEnd(34)} │`);
    console.log(`│  🔑 Code:  ${user_code.padEnd(34)} │`);
    console.log('│                                                      │');

    if (verification_uri_complete) {
      console.log('│  Or use this direct link:                           │');
      console.log(`│  🔗 ${verification_uri_complete.padEnd(44)} │`);
      console.log('│                                                      │');
    }

    const expiryMinutes = Math.floor(expires_in / 60);
    console.log(`│  ⏰ Code expires in ${expiryMinutes} minutes                        │`);
    console.log('│                                                      │');
    console.log('│  ⏳ Waiting for authorization...                     │');
    console.log('╰──────────────────────────────────────────────────────╯\n');
  }

  static updatePollingStatus(attempt: number, interval: number) {
    const dots = '.'.repeat((attempt % 3) + 1);
    process.stdout.write(`\r⏳ Checking authorization${dots.padEnd(3)} (attempt ${attempt})`);
  }

  static displaySuccess() {
    console.log('\n\n✅ Authentication successful! MCP server is now ready.\n');
  }

  static displayError(error: string) {
    console.log('\n\n❌ Authentication failed:');
    console.log(`   ${error}\n`);
  }
}
```

### Step 4: Token Polling with Exponential Backoff

Implement proper polling logic with error handling:

```typescript
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

class DeviceTokenPoller {
  constructor(private metadata: any) {}

  async pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number
  ): Promise<TokenResponse> {
    const tokenEndpoint = this.metadata.token_endpoint;
    const startTime = Date.now();
    const expiryTime = startTime + expiresIn * 1000;
    let attempt = 0;
    let currentInterval = interval;

    while (Date.now() < expiryTime) {
      attempt++;
      DeviceAuthUI.updatePollingStatus(attempt, currentInterval);

      try {
        const params = new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: process.env.OAUTH_CLIENT_ID!,
        });

        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: params.toString(),
        });

        const result = await response.json();

        if (response.ok) {
          // Success - got the token
          return result as TokenResponse;
        }

        // Handle OAuth errors
        switch (result.error) {
          case 'authorization_pending':
            // Continue polling
            break;

          case 'slow_down':
            // Increase polling interval
            currentInterval = Math.min(currentInterval + 5, 30);
            console.log(`\n⚠️  Slowing down polling to ${currentInterval} seconds`);
            break;

          case 'expired_token':
            throw new Error('Device code expired. Please restart authentication.');

          case 'access_denied':
            throw new Error('Authentication was denied by user.');

          default:
            throw new Error(
              `OAuth error: ${result.error} - ${result.error_description || 'Unknown error'}`
            );
        }
      } catch (error) {
        if (error.message.includes('expired') || error.message.includes('denied')) {
          throw error;
        }
        console.log(`\n⚠️  Polling error (attempt ${attempt}): ${error.message}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, currentInterval * 1000));
    }

    throw new Error('Device code expired - authentication timed out');
  }
}
```

### Step 5: Integration with MCP Server

Add device flow to the main MCP server class:

```typescript
// Add to DrupalMCPServer class
async handleDeviceFlow(sessionId: string): Promise<void> {
  if (!DeviceFlowDetector.shouldUseDeviceFlow()) {
    throw new Error('Device flow not appropriate for this environment');
  }

  try {
    const deviceFlowHandler = new DeviceFlowHandler(this.oauthClient, this.oauthMetadata);
    const deviceAuth = await deviceFlowHandler.initiateDeviceFlow();

    // Display instructions to user
    DeviceAuthUI.displayAuthInstructions(deviceAuth);

    // Poll for token
    const poller = new DeviceTokenPoller(this.oauthMetadata);
    const tokens = await poller.pollForToken(
      deviceAuth.device_code,
      deviceAuth.interval,
      deviceAuth.expires_in
    );

    // Store tokens using MCP SDK
    await this.oauthClient.storeTokens(sessionId, tokens);

    DeviceAuthUI.displaySuccess();

  } catch (error) {
    DeviceAuthUI.displayError(error.message);
    throw error;
  }
}

// Modified server initialization
async initializeAuthentication(sessionId: string): Promise<void> {
  if (DeviceFlowDetector.shouldUseDeviceFlow()) {
    await this.handleDeviceFlow(sessionId);
  } else {
    // Handle browser-based flow
    await this.handleBrowserFlow(sessionId);
  }
}
```

### Step 6: Configuration and Error Recovery

Add configuration options and retry logic:

```typescript
interface DeviceFlowConfig {
  maxRetries: number;
  baseInterval: number;
  maxInterval: number;
  enableAutoRetry: boolean;
}

const DEFAULT_CONFIG: DeviceFlowConfig = {
  maxRetries: 3,
  baseInterval: 5,
  maxInterval: 30,
  enableAutoRetry: true,
};

// Environment variable configuration
function getDeviceFlowConfig(): DeviceFlowConfig {
  return {
    maxRetries: parseInt(process.env.DEVICE_FLOW_MAX_RETRIES || '3'),
    baseInterval: parseInt(process.env.DEVICE_FLOW_BASE_INTERVAL || '5'),
    maxInterval: parseInt(process.env.DEVICE_FLOW_MAX_INTERVAL || '30'),
    enableAutoRetry: process.env.DEVICE_FLOW_AUTO_RETRY !== 'false',
  };
}
```

</details>
