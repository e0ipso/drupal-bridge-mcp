---
id: 2
group: 'authentication-tools'
dependencies: []
status: 'pending'
created: '2025-09-30'
skills:
  - typescript
  - oauth
---

# Implement Authentication Management Tools

## Objective

Create three MCP tools (`auth_login`, `auth_logout`, `auth_status`) that provide user-facing OAuth
session management by integrating with the existing `OAuthProvider` from Plan 02.

## Skills Required

- **TypeScript**: MCP tool registration, async handlers, type-safe interfaces
- **OAuth**: Session-based token management, device flow integration, token lifecycle

## Acceptance Criteria

- [ ] Three tool files created: `src/tools/auth/login.ts`, `logout.ts`, `status.ts`
- [ ] `auth_login` triggers device flow and displays verification URL/code
- [ ] `auth_logout` clears session and optionally revokes token with Drupal
- [ ] `auth_status` returns authentication state with token expiration
- [ ] All tools access `OAuthProvider` singleton for session management
- [ ] Session ID extracted from MCP request context
- [ ] Tools return structured JSON responses with clear status messages
- [ ] Zod schemas define input parameters for each tool
- [ ] Zero TypeScript compilation errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Dependencies:**

- `@modelcontextprotocol/sdk` - Tool registration, McpError types
- `zod` - Input schema validation
- Existing `src/oauth/provider.ts` - OAuthProvider class

**Tool Specifications:**

1. **auth_login**
   - Input: None (triggers device flow)
   - Output: `{ status: "authenticated", sessionId: string, message: string }`
   - Integrates with device flow UI from Plan 02

2. **auth_logout**
   - Input: None (uses session from context)
   - Output: `{ status: "logged_out", message: string }`
   - Clears session storage

3. **auth_status**
   - Input: None (uses session from context)
   - Output: `{ authenticated: boolean, expiresAt?: string, scopes?: string[] }`
   - Checks token validity

## Input Dependencies

- Existing `OAuthProvider` class with methods:
  - `authenticateDeviceFlow(): Promise<TokenSet>`
  - `getToken(sessionId): Promise<string | null>`
  - `clearSession(sessionId): Promise<void>`
  - `getTokenExpiration(sessionId): Promise<string | null>`

## Output Artifacts

- `src/tools/auth/login.ts` - auth_login tool
- `src/tools/auth/logout.ts` - auth_logout tool
- `src/tools/auth/status.ts` - auth_status tool
- `src/tools/auth/index.ts` - Barrel export for all auth tools

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Extend OAuthProvider Interface (if needed)

Review `src/oauth/provider.ts` to ensure these methods exist:

- `getToken(sessionId: string): Promise<string | null>`
- `clearSession(sessionId: string): Promise<void>`
- `getTokenExpiration(sessionId: string): Promise<string | null>`

If not present, add them to the `OAuthProvider` class.

### Step 2: Implement auth_login (`src/tools/auth/login.ts`)

```typescript
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OAuthProvider } from '../../oauth/provider.js';

// Input schema (no parameters needed)
export const authLoginSchema = z.object({});

export interface AuthLoginContext {
  sessionId: string;
  oauthProvider: OAuthProvider;
}

export async function authLogin(
  params: z.infer<typeof authLoginSchema>,
  context: AuthLoginContext
) {
  const { sessionId, oauthProvider } = context;

  try {
    // Trigger device flow authentication
    // This will display verification URL/code to user via device flow UI
    await oauthProvider.authenticateDeviceFlow(sessionId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'authenticated',
            sessionId,
            message: 'Successfully authenticated. Session established.',
          }),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
```

### Step 3: Implement auth_logout (`src/tools/auth/logout.ts`)

```typescript
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OAuthProvider } from '../../oauth/provider.js';

export const authLogoutSchema = z.object({});

export interface AuthLogoutContext {
  sessionId: string;
  oauthProvider: OAuthProvider;
}

export async function authLogout(
  params: z.infer<typeof authLogoutSchema>,
  context: AuthLogoutContext
) {
  const { sessionId, oauthProvider } = context;

  try {
    // Clear session from storage
    await oauthProvider.clearSession(sessionId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'logged_out',
            message: 'Successfully logged out. Session cleared.',
          }),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
```

### Step 4: Implement auth_status (`src/tools/auth/status.ts`)

```typescript
import { z } from 'zod';
import { OAuthProvider } from '../../oauth/provider.js';

export const authStatusSchema = z.object({});

export interface AuthStatusContext {
  sessionId: string;
  oauthProvider: OAuthProvider;
}

export async function authStatus(
  params: z.infer<typeof authStatusSchema>,
  context: AuthStatusContext
) {
  const { sessionId, oauthProvider } = context;

  const token = await oauthProvider.getToken(sessionId);
  const authenticated = token !== null;

  let expiresAt: string | undefined;
  let scopes: string[] | undefined;

  if (authenticated) {
    const expiration = await oauthProvider.getTokenExpiration(sessionId);
    expiresAt = expiration || undefined;

    // Optionally decode token to get scopes (if JWT)
    // For now, return undefined or hardcoded expected scopes
    scopes = ['tutorial_read', 'tutorial_search', 'user_read'];
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          authenticated,
          expiresAt,
          scopes,
        }),
      },
    ],
  };
}
```

### Step 5: Create Barrel Export (`src/tools/auth/index.ts`)

```typescript
export * from './login.js';
export * from './logout.js';
export * from './status.js';
```

### Step 6: Validation

- Run `npm run type-check` to verify zero TypeScript errors
- Ensure all tools properly access `OAuthProvider`
- Verify session ID propagation from context
- Check error handling for missing sessions

### Integration Pattern

These tools will be registered in `index.ts` (Task 4):

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const sessionId = extra.sessionId;
  const context = { sessionId, oauthProvider };

  switch (request.params.name) {
    case 'auth_login':
      return authLogin(request.params.arguments, context);
    case 'auth_logout':
      return authLogout(request.params.arguments, context);
    case 'auth_status':
      return authStatus(request.params.arguments, context);
  }
});
```

</details>
