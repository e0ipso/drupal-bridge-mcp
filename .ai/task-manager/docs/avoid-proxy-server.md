● Answer: SDK Architectural Expectations

Short Answer

The SDK evolved:
- Originally (pre-June 2025): Expected Proxy Pattern (Authorization Server role)
- Currently (post-June 2025): Expects Resource Server Pattern
- Your codebase: Uses the old Proxy Pattern (still supported for backwards compatibility)

Critical Timeline Discovery

June 2025: Major MCP Specification Change

The MCP specification underwent a fundamental architectural shift on June 18, 2025:

Before:
MCP Servers acted as OAuth authorization servers, issuing and managing their own tokens

After:
MCP Servers act as OAuth resource servers only, validating tokens issued by external authorization servers

SDK Support for Both Patterns

Your installed SDK (v1.17.5-1.19.1) supports BOTH patterns:

Pattern 1: Authorization Server / Proxy (Legacy)

Interfaces:
- OAuthServerProvider - Full OAuth server interface
- ProxyOAuthServerProvider - Proxy implementation

Methods:
- authorize() - Initiates OAuth flow
- exchangeAuthorizationCode() - Trades code for tokens
- exchangeRefreshToken() - Uses refresh_token for new access_token
- verifyAccessToken() - Validates tokens

Your Code Uses This:
// src/oauth/provider.ts:44
export class DrupalOAuthProvider extends ProxyOAuthServerProvider

Pattern 2: Resource Server (Current Spec)

Interfaces:
- OAuthTokenVerifier - Token validation only
- requireBearerAuth() - Express middleware

Methods:
- verifyAccessToken() - Only method (no token exchange)

SDK File:
// node_modules/@modelcontextprotocol/sdk/.../bearerAuth.d.ts:2
import { OAuthTokenVerifier } from '../provider.js';

export type BearerAuthMiddlewareOptions = {
verifier: OAuthTokenVerifier;  // ← Only needs verification
requiredScopes?: string[];
resourceMetadataUrl?: string;
};

Why Your Code Uses Proxy Pattern

Looking at your implementation inheritance chain:

DrupalOAuthProvider extends ProxyOAuthServerProvider

This means your MCP server is designed to:
1. Receive OAuth requests from clients
2. Proxy those requests to Drupal OAuth server
3. Receive full token responses (including refresh_token)
4. Store and manage tokens
5. Handle refresh flows

But in your actual deployment, you're using it as a resource server:
- Claude Code performs OAuth with Drupal directly
- Only sends access_token to MCP server via Authorization header
- Refresh logic never receives refresh_token

The Answer to "What Does SDK Expect?"

Original Design Intent (Your Codebase)

The SDK's ProxyOAuthServerProvider expects servers to act as OAuth proxies:

// SDK's proxyProvider.js:124-152
async exchangeRefreshToken(client, refreshToken, scopes, resource) {
const params = new URLSearchParams({
grant_type: 'refresh_token',
client_id: client.client_id,
refresh_token: refreshToken  // ← Expects to HAVE refresh_token
});

    const response = await fetch(this._endpoints.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    return OAuthTokensSchema.parse(data);  // Returns {access_token, refresh_token, ...}
}

In this pattern:
- ✅ Server receives full token responses
- ✅ Server stores refresh_token
- ✅ Server calls exchangeRefreshToken() when tokens expire
- ✅ Reactive refresh code works

Current Spec Recommendation (June 2025+)

The MCP spec now recommends resource server pattern:

// Use OAuthTokenVerifier instead
interface OAuthTokenVerifier {
verifyAccessToken(token: string): Promise<AuthInfo>;  // ← Only validates
}

In this pattern:
- ✅ Client manages all OAuth flows
- ✅ Client manages refresh_token
- ✅ Server only validates access_token
- ❌ Server never sees refresh_token
- ❌ Server never calls exchangeRefreshToken()

Why the Architectural Mismatch Occurred

Your codebase was written using the pre-June 2025 proxy pattern, where:

1. MCP server acts as OAuth proxy
2. Server calls exchangeAuthorizationCode() to get tokens
3. Drupal returns: {access_token, refresh_token, expires_in}
4. Server stores both tokens
5. Server uses exchangeRefreshToken() when needed

But it's being deployed as a resource server, where:

1. Claude Code performs OAuth with Drupal directly
2. Claude Code only sends access_token via Authorization header
3. Server extracts token with captureSessionToken(sessionId, accessToken)
4. Server never receives refresh_token
5. Reactive refresh code is dormant

Recommendation

You have two paths forward:

Path A: Stay with Proxy Pattern (Requires Client Changes)

To make the reactive refresh code work, you'd need to:

1. Reconfigure Claude Code to perform OAuth through MCP server
2. MCP server performs OAuth with Drupal
3. Server receives full token response including refresh_token
4. Reactive refresh becomes active

Problem: This may not be supported by Claude Code's architecture.

Path B: Migrate to Resource Server Pattern (Aligned with Spec)

To align with June 2025 spec:

1. Replace DrupalOAuthProvider extends ProxyOAuthServerProvider
2. Implement OAuthTokenVerifier interface only:
   class DrupalTokenVerifier implements OAuthTokenVerifier {
   async verifyAccessToken(token: string): Promise<AuthInfo> {
   // Validate with Drupal introspection or JWT verification
   }
   }
3. Use requireBearerAuth() middleware
4. Remove reactive refresh code (lines 286-612) - not needed
5. Enable refresh_token grant in Drupal (your original DCR plan)
6. Let Claude Code manage refresh client-side

Benefits:
- Aligns with current MCP spec (June 2025)
- Simpler server implementation
- Client handles token lifecycle
- Standard OAuth 2.1 resource server pattern

Final Answer

Does the SDK expect proxy or resource server pattern?

Both, with evolution:
- SDK originally expected proxy pattern (ProxyOAuthServerProvider)
- SDK currently recommends resource server pattern (OAuthTokenVerifier)
- SDK still supports both for backwards compatibility
- Your code uses legacy proxy pattern but deploys as resource server
- This mismatch explains why refresh_token code exists but doesn't work

Your original plan (enable refresh_token in Drupal DCR) is correct - it will enable client-side refresh in the resource server pattern, which is the
recommended approach per June 2025 spec.
