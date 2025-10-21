---
id: 1
group: 'oauth-error-handling'
dependencies: []
status: 'completed'
created: '2025-10-21'
skills:
  - typescript
  - authentication
---

# Implement OAuth Error Classification

## Objective

Add error classification logic to distinguish permanent OAuth failures (expired tokens) from
temporary failures (network errors) in the token refresh process.

## Skills Required

- **TypeScript**: Implement error classification method and enhance error handling
- **Authentication**: Understand OAuth 2.1 error codes and token refresh failures

## Acceptance Criteria

- [ ] `isPermanentAuthFailure()` method correctly identifies permanent OAuth errors
- [ ] `performTokenRefresh()` returns structured errors with OAuth error codes
- [ ] Error messages include both error code and description from Drupal
- [ ] TypeScript compilation succeeds with no errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File to modify**: `src/oauth/provider.ts`

**Permanent OAuth error codes to detect**:

- `invalid_grant` - Refresh token expired or revoked
- `invalid_token` - Token malformed or invalid
- `unauthorized_client` - Client not authorized

**Error structure from Drupal OAuth server**:

```json
{
  "error": "invalid_grant",
  "error_description": "The refresh token is invalid."
}
```

## Input Dependencies

- Existing `performTokenRefresh()` method (src/oauth/provider.ts:472-532)
- OAuth error response format from Drupal Simple OAuth

## Output Artifacts

- `isPermanentAuthFailure(error: Error): boolean` method in DrupalOAuthProvider class
- Enhanced `performTokenRefresh()` that throws structured errors with format:
  `"error_code: error_description"`

## Implementation Notes

<details>
<summary>Implementation Guide</summary>

### Step 1: Add isPermanentAuthFailure Method

Add this private method to the `DrupalOAuthProvider` class (around line 470):

```typescript
/**
 * Determines if an error represents a permanent authentication failure
 * that requires user re-authentication (vs temporary network/server issues)
 *
 * @param error - Error from token refresh attempt
 * @returns true if error is permanent (clear tokens), false if temporary (retry later)
 */
private isPermanentAuthFailure(error: Error): boolean {
  const permanentErrors = [
    'invalid_grant',      // Refresh token expired/revoked
    'invalid_token',      // Token malformed
    'unauthorized_client' // Client not authorized
  ];

  return permanentErrors.some(code => error.message.includes(code));
}
```

### Step 2: Enhance performTokenRefresh Error Handling

Locate `performTokenRefresh()` method (line 472-532). Find the error handling block (around line
504-519):

**Current code**:

```typescript
if (!response.ok) {
  let errorMessage = `Token refresh failed: ${response.status} ${response.statusText}`;
  try {
    const errorJson = JSON.parse(responseText);
    if (errorJson.error) {
      errorMessage = `Token refresh failed: ${errorJson.error}`;
      if (errorJson.error_description) {
        errorMessage += ` - ${errorJson.error_description}`;
      }
    }
  } catch {
    if (responseText) {
      errorMessage += ` - ${responseText}`;
    }
  }
  throw new Error(errorMessage);
}
```

**Replace with**:

```typescript
if (!response.ok) {
  try {
    const errorJson = JSON.parse(responseText);
    const errorCode = errorJson.error || 'unknown';
    const errorDesc = errorJson.error_description || response.statusText;

    // Structured error format enables error classification
    throw new Error(`${errorCode}: ${errorDesc}`);
  } catch (parseError) {
    // Fallback for non-JSON responses
    throw new Error(`unknown: Token refresh failed - ${response.status} ${response.statusText}`);
  }
}
```

### Step 3: Verify TypeScript Compilation

Run type checking to ensure no compilation errors:

```bash
npm run type-check
```

### Testing Approach

The error classification will be tested in subsequent tasks when integrated with the
proactive/reactive refresh logic. For now, verify:

1. Method compiles without errors
2. Error format matches pattern: `"error_code: error_description"`
3. `isPermanentAuthFailure()` correctly identifies all three permanent error types

</details>
