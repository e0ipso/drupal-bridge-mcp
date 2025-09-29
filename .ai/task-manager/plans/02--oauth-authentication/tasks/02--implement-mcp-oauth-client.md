---
id: 2
group: 'mcp-integration'
dependencies: []
status: 'completed'
created: '2025-09-29'
completed: '2025-09-29'
skills: ['typescript', 'oauth']
---

# Implement MCP Server with OAuth Client Integration

## Objective

Build the core MCP server that leverages @modelcontextprotocol/sdk OAuth capabilities for
authentication against the Drupal OAuth server, with automatic discovery and token management.

**Note:** This assumes the Drupal OAuth server (Simple OAuth 2.1) is already configured separately.

## Skills Required

- **typescript**: MCP server implementation, type definitions, and async/await patterns
- **oauth**: OAuth flow implementation, token management, and security best practices

## Acceptance Criteria

- [ ] MCP server initialized with OAuth-enabled transport
- [ ] Automatic OAuth metadata discovery from Drupal endpoint
- [ ] OAuth client configured with proper endpoints and scopes
- [ ] StreamableHTTP transport with automatic Bearer token injection
- [ ] Session isolation per MCP client connection
- [ ] Token storage and refresh handled by MCP SDK
- [ ] Error handling for OAuth failures and token expiration

## Technical Requirements

- MCP SDK package: `@modelcontextprotocol/sdk`
- OAuth client from: `@modelcontextprotocol/sdk/client/auth`
- Transport: `StreamableHTTPServerTransport`
- Environment variables: `DRUPAL_URL`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`
- Support for both Authorization Code and Device flows

## Input Dependencies

- OAuth client credentials (from Drupal Simple OAuth 2.1 setup)
- OAuth discovery endpoint from Drupal server (`/.well-known/oauth-authorization-server`)
- Valid Drupal OAuth server configuration (assumed to be handled in Drupal)

## Output Artifacts

- MCP server with OAuth authentication
- OAuth client configuration module
- Environment configuration template
- Server initialization and transport setup

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Core MCP Server with OAuth Setup

Create the main MCP server class that integrates OAuth authentication:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { OAuthClient } from '@modelcontextprotocol/sdk/client/auth.js';
import { z } from 'zod';

class DrupalMCPServer {
  private mcpServer: McpServer;
  private oauthClient: OAuthClient;
  private transport: StreamableHTTPServerTransport;
  private oauthMetadata: any;

  constructor() {
    this.mcpServer = new McpServer({
      name: 'drupal-mcp-server',
      version: '1.0.0',
    });
  }

  async initialize() {
    await this.fetchOAuthMetadata();
    await this.initializeOAuth();
    this.setupTransport();
    this.registerBasicTools();
  }
}
```

### Step 2: OAuth Metadata Discovery

Implement automatic discovery of OAuth endpoints:

```typescript
private async fetchOAuthMetadata() {
  const discoveryUrl = `${process.env.DRUPAL_URL}/.well-known/oauth-authorization-server`;

  try {
    const response = await fetch(discoveryUrl);
    if (!response.ok) {
      throw new Error(`OAuth discovery failed: ${response.status}`);
    }

    this.oauthMetadata = await response.json();

    // Validate required endpoints exist
    const requiredEndpoints = [
      'authorization_endpoint',
      'token_endpoint',
      'device_authorization_endpoint'
    ];

    for (const endpoint of requiredEndpoints) {
      if (!this.oauthMetadata[endpoint]) {
        throw new Error(`Missing required OAuth endpoint: ${endpoint}`);
      }
    }

    console.log('OAuth metadata discovered successfully');
  } catch (error) {
    throw new Error(`Failed to discover OAuth metadata: ${error.message}`);
  }
}
```

### Step 3: OAuth Client Configuration

Configure the OAuth client with discovered endpoints:

```typescript
private async initializeOAuth() {
  this.oauthClient = new OAuthClient({
    clientId: process.env.OAUTH_CLIENT_ID!,
    clientSecret: process.env.OAUTH_CLIENT_SECRET!,
    authorizationEndpoint: this.oauthMetadata.authorization_endpoint,
    tokenEndpoint: this.oauthMetadata.token_endpoint,
    deviceAuthorizationEndpoint: this.oauthMetadata.device_authorization_endpoint,
    scopes: ["read:tutorials", "write:tutorials", "profile"],

    // SDK automatically handles:
    // - PKCE generation for authorization code flow
    // - Device flow polling
    // - Token refresh
    // - Secure token storage
  });

  console.log('OAuth client initialized with Drupal endpoints');
}
```

### Step 4: Transport Setup with Authentication

Configure StreamableHTTP transport with automatic Bearer token injection:

```typescript
private setupTransport() {
  this.transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableDnsRebindingProtection: true,

    // SDK automatically adds Authorization header to all requests
    authProvider: async (sessionId: string) => {
      try {
        const token = await this.oauthClient.getAccessToken(sessionId);
        return token ? `Bearer ${token}` : undefined;
      } catch (error) {
        console.error(`Failed to get access token for session ${sessionId}:`, error);
        return undefined;
      }
    }
  });

  console.log('Transport configured with OAuth authentication');
}
```

### Step 5: Environment Configuration

Create environment variable validation and configuration:

```typescript
private validateEnvironment() {
  const requiredEnvVars = [
    'DRUPAL_URL',
    'OAUTH_CLIENT_ID',
    'OAUTH_CLIENT_SECRET'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Validate DRUPAL_URL format
  try {
    new URL(process.env.DRUPAL_URL!);
  } catch {
    throw new Error('DRUPAL_URL must be a valid URL');
  }
}
```

### Step 6: Basic Tool Registration

Register a simple authentication status tool for testing:

```typescript
private registerBasicTools() {
  this.mcpServer.setRequestHandler(
    "tools/list",
    async () => ({
      tools: [
        {
          name: "auth_status",
          description: "Check OAuth authentication status",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ]
    })
  );

  this.mcpServer.setRequestHandler(
    "tools/call",
    async (request, extra) => {
      if (request.params.name === "auth_status") {
        const sessionId = extra.sessionId;
        const token = await this.oauthClient.getAccessToken(sessionId);

        return {
          content: [
            {
              type: "text",
              text: token ? "Authenticated" : "Not authenticated"
            }
          ]
        };
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    }
  );
}
```

### Step 7: Server Startup and Error Handling

Implement proper startup sequence with error handling:

```typescript
async start() {
  try {
    this.validateEnvironment();
    await this.initialize();

    const server = await this.transport.createServer(this.mcpServer);
    const port = process.env.MCP_SERVER_PORT || 3000;

    server.listen(port, () => {
      console.log(`MCP Server with OAuth running on port ${port}`);
      console.log(`Drupal OAuth server: ${process.env.DRUPAL_URL}`);
    });

  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}
```

### Environment Variables Template

Create `.env.example`:

```bash
# Drupal OAuth Server Configuration
DRUPAL_URL=https://your-drupal-site.com
OAUTH_CLIENT_ID=mcp-server-client
OAUTH_CLIENT_SECRET=your-client-secret-from-drupal

# MCP Server Settings
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=0.0.0.0
NODE_ENV=development

# Optional: Advanced Configuration
OAUTH_TOKEN_CACHE_TTL=300
OAUTH_DISCOVERY_CACHE_TTL=3600
```

</details>
