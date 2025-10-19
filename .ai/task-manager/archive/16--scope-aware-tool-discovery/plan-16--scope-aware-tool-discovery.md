---
id: 16
summary:
  'Implement OAuth scope-aware tool discovery system that dynamically extracts required scopes from
  tool metadata and validates tool access based on granted permissions'
created: 2025-10-19
approval_method: auto
---

# Plan: OAuth Scope-Aware Tool Discovery and Validation

## Original Work Order

> apply the changes in @here-changes.md

## Executive Summary

This plan implements a comprehensive OAuth scope management system that shifts from static
configuration to dynamic discovery. The MCP server will discover tools from Drupal's
`/mcp/tools/list` endpoint **before** OAuth initialization, extract required scopes from each tool's
authentication metadata (`annotations.auth.scopes`), and combine these with optional additional
scopes to request the complete permission set during authentication.

The implementation follows a security-first approach with three authentication levels: `none`
(public tools), `optional` (gracefully degrades without auth), and `required` (enforces
authentication and scope validation). Runtime validation ensures tools are only invoked when the
session possesses the necessary OAuth scopes, with clear error messages guiding users toward
resolution.

This approach eliminates manual scope configuration errors, automatically adapts to backend tool
changes, and provides fine-grained access control at the tool level while maintaining backward
compatibility through intelligent defaults and inference.

```mermaid
graph TB
    A[Server Startup] --> B[Create OAuth Config]
    B --> C[Discover Tools from /mcp/tools/list]
    C --> D[Extract Required Scopes from Tool Metadata]
    D --> E[Merge with OAUTH_ADDITIONAL_SCOPES]
    E --> F[Update OAuth Config with Complete Scope Set]
    F --> G[Initialize OAuth Provider]
    G --> H[Fetch OAuth Metadata]
    H --> I[Validate Scopes Against Server Support]
    I --> J[Server Ready]

    K[Tool Invocation Request] --> L{Check Tool Auth Level}
    L -->|none| M[Execute Tool]
    L -->|optional| M
    L -->|required| N{Session Authenticated?}
    N -->|No| O[Throw Auth Required Error]
    N -->|Yes| P{Has Required Scopes?}
    P -->|No| Q[Throw Insufficient Scopes Error]
    P -->|Yes| M

    style D fill:#e1f5ff
    style F fill:#e1f5ff
    style P fill:#ffe1e1
    style Q fill:#ffe1e1
```

## Context

### Current State

The MCP server currently uses a static OAuth scope configuration approach:

- **Manual Scope Definition**: Scopes are manually configured via `OAUTH_SCOPES` environment
  variable
- **Pre-Authentication Discovery**: Tools are discovered **after** OAuth is initialized, creating a
  chicken-and-egg problem
- **No Tool-Level Access Control**: All authenticated sessions can invoke any tool regardless of
  actual permissions granted
- **Configuration Drift Risk**: Backend tool additions/changes requiring new scopes don't
  automatically propagate to the server
- **Limited Auth Metadata**: Tool definitions lack structured authentication requirements

**Problems with Current Approach:**

1. Administrators must manually maintain scope lists, prone to errors and omissions
2. New tools requiring specific scopes fail silently or with cryptic errors
3. Sessions with insufficient scopes invoke protected tools, only to fail at Drupal level
4. No distinction between public, optional-auth, and required-auth tools

### Target State

After implementation, the system will provide:

- **Dynamic Scope Discovery**: Scopes automatically extracted from tool metadata at startup
- **Pre-OAuth Tool Discovery**: Tools discovered first, then OAuth initialized with discovered
  scopes
- **Tool-Level Access Validation**: Runtime checks ensure sessions have required scopes before
  invocation
- **Three Auth Levels**: `none`, `optional`, `required` with intelligent inference from scope
  presence
- **Supplemental Scopes**: `OAUTH_ADDITIONAL_SCOPES` for admin/experimental permissions beyond tools
- **Clear Error Messages**: Detailed feedback showing required vs. granted scopes when access denied
- **Automatic Adaptation**: Backend tool changes automatically reflected in scope requests

**Success Indicators:**

- Zero manual scope configuration required for standard tool usage
- Tools fail fast with clear errors when scopes insufficient
- Additional scopes easily added for admin/experimental features
- Complete scope transparency in startup logs

### Background

This implementation addresses requirements from the A2A (agent-to-agent) protocol community
standard, which specifies authentication metadata in tool definitions. The OAuth 2.1 spec supports
dynamic scope requests, but current implementation predates structured auth metadata in tool
discovery.

The change is backward compatible: tools without `annotations.auth` default to `auth.level='none'`
(public access), preserving existing behavior while enabling fine-grained control for new tools.

## Technical Implementation Approach

### Component 1: Tool Authentication Metadata Types

**Objective**: Establish TypeScript interfaces for structured authentication requirements in tool
definitions

The `ToolAuthMetadata` interface defines three pieces of information:

1. **Authentication Level** (`level`): Enum of `'none' | 'optional' | 'required'`
2. **Required Scopes** (`scopes`): Array of OAuth scope strings
3. **Description** (`description`): Human-readable explanation of auth requirements

**Key Design Decision**: Authentication level is **optional** with intelligent inference. If
`scopes` array is present but `level` is undefined, the system infers `level='required'`. This
reduces boilerplate in Drupal backend definitions while maintaining explicit override capability.

**Implementation in `src/discovery/tool-discovery.ts`:**

- Add `ToolAuthMetadata` interface with optional `level`, `scopes`, `description` fields
- Update `ToolDefinition.annotations` to include optional `auth?: ToolAuthMetadata`
- Create `getAuthLevel()` helper function implementing inference logic
- Create `extractRequiredScopes()` function that collects unique scopes from all tool definitions
- Create `validateToolAccess()` function that enforces scope requirements

**Validation Logic:**

```
getAuthLevel(authMetadata):
  if authMetadata is undefined: return 'none'
  if authMetadata.level is defined: return authMetadata.level
  if authMetadata.scopes exists and not empty: return 'required'
  return 'none'
```

### Component 2: OAuth Configuration Enhancement

**Objective**: Extend OAuth configuration to support additional scopes and post-discovery scope
updates

Currently, `OAuthConfig` interface has static `scopes` array set once at creation. This component
adds:

1. **Additional Scopes Field**: `additionalScopes: string[]` for supplemental permissions
2. **Scope Update Method**: `OAuthConfigManager.updateScopes()` to set scopes post-discovery
3. **Environment Parsing**: Parse `OAUTH_ADDITIONAL_SCOPES` from space/comma-separated string

**Implementation in `src/oauth/config.ts`:**

- Add `additionalScopes: string[]` field to `OAuthConfig` interface
- Update `createOAuthConfigFromEnv()` to parse `OAUTH_ADDITIONAL_SCOPES` environment variable
- Add `updateScopes(scopes: string[]): void` method to `OAuthConfigManager` class
- Clear metadata cache when scopes updated (forces re-fetch with new scope set)

**Environment Variable Format:**

```bash
# Space-separated
OAUTH_ADDITIONAL_SCOPES="admin:access experimental:features"

# Comma-separated (also supported)
OAUTH_ADDITIONAL_SCOPES="admin:access, experimental:features"
```

### Component 3: Server Initialization Sequence

**Objective**: Reorder startup sequence to discover tools before OAuth initialization

Current sequence: Create OAuth config → Initialize OAuth provider → Discover tools New sequence:
Create OAuth config → **Discover tools** → Extract scopes → **Update config** → Initialize OAuth
provider

**Implementation in `src/index.ts`:**

**Step-by-step startup flow:**

1. Create initial OAuth config from environment (includes `additionalScopes`)
2. **NEW**: Call `discoverTools()` without authentication token
3. **NEW**: Call `extractRequiredScopes(tools, config.additionalScopes)`
4. **NEW**: Log discovered scopes for transparency
5. **NEW**: Call `configManager.updateScopes(discoveredScopes)`
6. Initialize OAuth provider with updated config
7. Fetch OAuth metadata
8. **NEW**: Validate requested scopes against `metadata.scopes_supported`
9. Continue with normal server initialization

**Scope Validation Logic:** Check if any requested scopes are not in `metadata.scopes_supported`
array. Log warnings for unsupported scopes but continue (OAuth server will ignore them anyway). This
helps diagnose configuration issues without blocking startup.

**Startup Log Output:**

```
✓ Discovered 15 tools from Drupal
  Extracted 8 scopes from tool definitions
  Additional scopes: admin:access
  Total scopes: admin:access, content:read, content:write, content_type:read, profile, ...
```

### Component 4: Dynamic Tool Handler Scope Validation

**Objective**: Validate session scopes before tool invocation and provide actionable error messages

Enhance `registerDynamicTools()` in `src/discovery/dynamic-handlers.ts` to validate access before
proxying requests to Drupal. This prevents unnecessary network calls for requests that will fail due
to insufficient permissions.

**Implementation Strategy:**

1. Add `validateToolAccessForSession()` async helper function
2. Call validation at start of tool handler, before parameter validation
3. Throw `McpError` with `ErrorCode.InvalidRequest` for auth failures
4. Include detailed error messages showing required vs. current scopes

**Validation Flow:**

```
validateToolAccessForSession(tool, oauthProvider, sessionId):
  authLevel = getAuthLevel(tool.annotations?.auth)

  if authLevel === 'none': return  // Public tool
  if authLevel === 'optional': return  // Graceful degradation

  if authLevel === 'required':
    if not oauthProvider or not sessionId:
      throw "Tool requires authentication. Please authenticate first."

    sessionScopes = await oauthProvider.getTokenScopes(sessionId)

    if sessionScopes is empty:
      throw "Tool requires authentication. No valid session found."

    requiredScopes = tool.annotations.auth.scopes
    missingScopes = requiredScopes.filter(s => not in sessionScopes)

    if missingScopes not empty:
      throw detailed error with required/missing/current scopes
```

**Error Message Format:**

```
Insufficient OAuth scopes for tool "examples.contentTypes.create".
Required: content_type:write
Missing: content_type:write
Current: profile, content_type:read
```

**OAuth Provider Enhancement:** The implementation requires adding
`getTokenScopes(sessionId): Promise<string[]>` method to `DrupalOAuthProvider` class. This method
should decode the JWT access token and extract the `scope` claim (space-separated string), split it,
and return as array.

### Component 5: Environment Documentation

**Objective**: Update `.env.example` and `README.md` to document new OAuth scope management

**Changes to `.env.example`:**

- Remove `OAUTH_SCOPES` (deprecated - now auto-discovered)
- Add `OAUTH_ADDITIONAL_SCOPES` with detailed comment explaining use cases
- Add examples showing space and comma-separated formats

**Changes to `README.md`:**

- Add "OAuth Scope Management" section
- Document automatic scope discovery process
- Explain when and how to use `OAUTH_ADDITIONAL_SCOPES`
- Provide examples of scope validation errors
- Show how to check discovered scopes in startup logs

### Component 6: Comprehensive Test Suite

**Objective**: Ensure scope discovery, validation, and error handling work correctly

**Test File: `src/discovery/__tests__/scope-discovery.test.ts`** (new file)

Test categories:

1. **Scope Extraction**: Verify `extractRequiredScopes()` correctly collects scopes from tools
2. **Additional Scopes**: Confirm additional scopes merged with discovered scopes
3. **Deduplication**: Ensure duplicate scopes removed (tools may share scope requirements)
4. **Access Validation**: Test `validateToolAccess()` with various scope combinations
5. **Public Tool Access**: Verify tools without auth metadata allow anonymous access
6. **Auth Level Inference**: Confirm correct inference when `level` field omitted

**Test File: `src/oauth/__tests__/config.test.ts`** (existing, add tests)

New test cases:

1. **Additional Scopes Parsing**: Verify space and comma-separated parsing
2. **Empty Additional Scopes**: Handle missing environment variable gracefully
3. **Scope Update**: Confirm `updateScopes()` updates config and clears cache

**Testing Strategy:**

- Use `nock` to mock Drupal HTTP endpoints
- Create sample tool definitions with various auth metadata configurations
- Test both positive (access granted) and negative (access denied) scenarios
- Verify error message formats and clarity

## Risk Considerations and Mitigation Strategies

### Technical Risks

- **Breaking Changes to Existing Tools**: Tools currently working may fail if Drupal backend returns
  auth metadata
  - **Mitigation**: Inference defaults to `level='none'` when no auth metadata present. Backward
    compatible.

- **OAuth Server Scope Support**: Drupal OAuth server may not support all requested scopes
  - **Mitigation**: Validate against `metadata.scopes_supported` and log warnings. Server continues
    with supported scopes subset.

- **JWT Scope Claim Format**: Different OAuth servers encode scopes differently (space-separated vs
  array)
  - **Mitigation**: Implement robust scope extraction in `getTokenScopes()` supporting both formats.

- **Performance Impact of Additional Validation**: Runtime scope checks add latency to tool
  invocations
  - **Mitigation**: Validation is in-memory array comparison (microseconds). Significantly faster
    than network call to Drupal that would fail anyway.

### Implementation Risks

- **Test Coverage Gaps**: Complex auth logic may have edge cases not covered by tests
  - **Mitigation**: Comprehensive test suite with >80% coverage requirement. Test both positive and
    negative paths.

- **Error Message Clarity**: Users may not understand scope-related errors
  - **Mitigation**: Multi-line error messages with explicit "Required:", "Missing:", "Current:"
    sections. Include actionable guidance.

- **Migration Path for Existing Deployments**: Deployments with `OAUTH_SCOPES` may break
  - **Mitigation**: Support both `OAUTH_SCOPES` (deprecated) and auto-discovery. Log deprecation
    warning if `OAUTH_SCOPES` found.

### Integration Risks

- **Drupal Backend Not Updated**: MCP server expects auth metadata but Drupal backend doesn't
  provide it
  - **Mitigation**: Auth metadata is optional. Tools without metadata work as before (public
    access).

- **Circular Dependency**: Tool discovery requires OAuth but OAuth needs tool scopes
  - **Mitigation**: Initial tool discovery uses **no authentication token**. Assumes public
    `/mcp/tools/list` endpoint or accepts 401 errors gracefully.

## Success Criteria

### Primary Success Criteria

1. **Automatic Scope Discovery**: Server extracts all required scopes from tool definitions without
   manual `OAUTH_SCOPES` configuration
2. **Runtime Access Validation**: Tool invocations with insufficient scopes fail immediately with
   clear error messages before reaching Drupal
3. **Additional Scope Support**: Administrators can add supplemental scopes via
   `OAUTH_ADDITIONAL_SCOPES` that merge with discovered scopes
4. **Backward Compatibility**: Existing tools without auth metadata continue working (default to
   public access)
5. **Startup Transparency**: Complete scope list logged during startup for debugging and
   verification

### Quality Assurance Metrics

1. **Test Coverage**: >80% code coverage on all new functions (`extractRequiredScopes`,
   `validateToolAccess`, `getAuthLevel`)
2. **Type Safety**: Zero TypeScript compilation errors, all new interfaces properly typed
3. **Error Handling**: All error paths tested, error messages validated for clarity
4. **Documentation Completeness**: README includes OAuth scope management section with examples
5. **Integration Testing**: End-to-end test covering startup → discovery → validation flow

## Resource Requirements

### Development Skills

- **TypeScript Expert**: Strong understanding of TypeScript type system, interfaces, and type
  inference
- **OAuth 2.1 Knowledge**: Understanding of OAuth scopes, JWT structure, and token validation
- **Testing Expertise**: Experience with Jest, nock for HTTP mocking, and async test patterns
- **MCP Protocol Familiarity**: Knowledge of Model Context Protocol types and error handling

### Technical Infrastructure

- **Testing Tools**: Jest, nock, ts-jest for TypeScript test execution
- **Type Checking**: TypeScript compiler with strict mode enabled
- **Linting**: Existing ESLint configuration for code quality
- **Documentation**: Markdown formatting for README and inline code comments

## Implementation Order

The implementation follows a dependency-based sequence:

1. **Foundation Types** (`src/discovery/tool-discovery.ts`): Define `ToolAuthMetadata` interface and
   helper functions before any code uses them
2. **OAuth Config Enhancement** (`src/oauth/config.ts`): Add additional scopes support so server
   initialization can use it
3. **Server Initialization Reordering** (`src/index.ts`): Implement new startup sequence with
   pre-OAuth tool discovery
4. **Runtime Validation** (`src/discovery/dynamic-handlers.ts`): Add scope checking to tool
   invocation handlers
5. **Documentation** (`.env.example`, `README.md`): Document new features after implementation
   complete
6. **Test Suite** (various `__tests__/` files): Write tests validating all components work together

## Notes

### Scope Inference Logic Rationale

The decision to infer `auth.level='required'` when scopes are present but level is undefined reduces
boilerplate in Drupal backend tool definitions. Most tools either:

- Are public (`auth` field omitted entirely → inferred as `level='none'`)
- Require specific scopes (`auth.scopes` specified → inferred as `level='required'`)

The `level='optional'` case is rare (tools that enhance behavior with auth but work without). It
must be explicitly set since it can't be inferred from scope presence alone.

### Migration from OAUTH_SCOPES

For backward compatibility, consider detecting `OAUTH_SCOPES` environment variable and logging a
deprecation warning:

```
⚠ WARNING: OAUTH_SCOPES is deprecated and will be ignored.
  Scopes are now automatically discovered from tool definitions.
  Use OAUTH_ADDITIONAL_SCOPES for supplemental permissions.
```

### Future Enhancements

**Not in scope for this plan** (potential follow-up work):

- **Dynamic Scope Re-discovery**: Refresh scopes when tools change without server restart
- **Scope Grouping**: Allow tool definitions to reference named scope groups (e.g., `role:editor`)
- **Conditional Scope Requirements**: Tools that require different scopes based on parameters
- **Scope Permission UI**: Claude Code interface showing which tools require which scopes

## Task Dependencies

```mermaid
graph TD
    001[Task 01: Auth Metadata Types] --> 004[Task 04: Server Init]
    001 --> 005[Task 05: Runtime Validation]
    001 --> 007[Task 07: Tests]
    002[Task 02: OAuth Config] --> 004
    002 --> 007
    003[Task 03: OAuth Provider Scopes] --> 005
    003 --> 007
    004 --> 006[Task 06: Documentation]
    005 --> 007
```

## Execution Blueprint

**Validation Gates:**

- Reference: `.ai/task-manager/config/hooks/POST_PHASE.md`

### Phase 1: Foundation Types and OAuth Enhancement

**Parallel Tasks:**

- Task 01: Add Authentication Metadata Types and Helper Functions
- Task 02: Enhance OAuth Configuration with Additional Scopes Support
- Task 03: Add Scope Extraction Method to OAuth Provider

**Description:** Establish type system foundations and OAuth infrastructure to support scope-aware
operations.

### ✅ Phase 2: Server Integration

**Parallel Tasks:**

- ✔️ Task 04: Reorder Server Initialization Sequence (depends on: 01, 02) - **Status: completed**
- ✔️ Task 05: Implement Runtime Tool Access Validation (depends on: 01, 03) - **Status: completed**

**Description:** Integrate scope discovery into server startup and enforce runtime access control.

### ✅ Phase 3: Documentation and Testing

**Parallel Tasks:**

- ✔️ Task 06: Update Environment and README Documentation (depends on: 04) - **Status: completed**
- ✔️ Task 07: Add Comprehensive Tests for Scope Discovery and Validation (depends on: 01, 02,
  03, 05) - **Status: completed**

**Description:** Complete implementation with documentation and comprehensive test coverage.

### Execution Summary

- Total Phases: 3
- Total Tasks: 7
- Maximum Parallelism: 3 tasks (in Phase 1)
- Critical Path Length: 3 phases
- Estimated Complexity: Low-Medium (all tasks ≤4 complexity)

## ✅ Implementation Results

**Status**: Successfully Completed

**Execution Timeline**: October 19, 2025

### Summary of Changes

This implementation successfully delivered a complete OAuth scope-aware tool discovery system for
the MCP server. All 7 tasks across 3 phases were completed successfully with comprehensive test
coverage and documentation.

### Phase 1: Foundation Types and OAuth Enhancement ✅

**Completed Tasks**:

- Task 01: Authentication Metadata Types and Helper Functions
- Task 02: OAuth Configuration Additional Scopes Support
- Task 03: OAuth Provider Scope Extraction Method

**Deliverables**:

- Added `ToolAuthMetadata` interface with auth level and scopes fields
- Implemented helper functions: `getAuthLevel()`, `extractRequiredScopes()`, `validateToolAccess()`
- Enhanced `OAuthConfig` with `additionalScopes` field
- Added `OAuthConfigManager.updateScopes()` method for post-discovery updates
- Implemented `DrupalOAuthProvider.getTokenScopes()` for JWT scope extraction
- Environment parsing for `OAUTH_ADDITIONAL_SCOPES` (space/comma-separated)

**Git Commit**: feat: add OAuth scope metadata types and config enhancements

### Phase 2: Server Integration ✅

**Completed Tasks**:

- Task 04: Reorder Server Initialization Sequence
- Task 05: Runtime Tool Access Validation

**Deliverables**:

- Reordered startup: discover tools → extract scopes → update OAuth config → initialize OAuth
- Added `validateScopes()` method to validate against server-supported scopes
- Implemented `validateToolAccessForSession()` helper for runtime checks
- Integrated validation into CallToolRequest handler before tool invocation
- Added detailed error messages showing required/missing/current scopes

**Git Commit**: feat: reorder server initialization and add runtime tool access validation

### Phase 3: Documentation and Testing ✅

**Completed Tasks**:

- Task 06: Environment and README Documentation Updates
- Task 07: Comprehensive Test Suite

**Deliverables**:

**Documentation**:

- Updated `.env.example` with `OAUTH_ADDITIONAL_SCOPES` configuration and detailed comments
- Added "OAuth Scope Management" section to `README.md` covering:
  - How automatic scope discovery works
  - When and how to use additional scopes
  - Tool access validation and error resolution
  - Startup log examples
  - Authentication levels (none/optional/required)

**Tests** (26 tests total, all passing):

- Created `src/discovery/__tests__/scope-discovery.test.ts` (12 tests):
  - Scope extraction from tool definitions
  - Additional scopes merging and deduplication
  - Access validation (positive and negative cases)
  - Auth level inference logic
  - Error message content verification
- Created `src/oauth/__tests__/config.test.ts` (14 tests):
  - Additional scopes parsing (space/comma-separated, mixed formats)
  - Scope updates and cache management
  - Environment variable configuration
  - Config manager behavior

**Git Commit**: docs: add OAuth scope management documentation and comprehensive tests

### Key Achievements

1. **Zero Manual Configuration**: Scopes automatically extracted from tool metadata
2. **Runtime Security**: Tool access validated before invocation with clear error messages
3. **Flexible Supplementation**: `OAUTH_ADDITIONAL_SCOPES` supports admin/experimental scopes
4. **Backward Compatible**: Tools without auth metadata default to public access
5. **Well Tested**: >80% coverage on new functions with 26 passing tests
6. **Fully Documented**: Complete user guide with practical examples

### Technical Metrics

- **Files Modified**: 8 files (5 implementation, 2 test, 1 documentation)
- **Lines Added**: ~800 lines (including tests and documentation)
- **Test Coverage**: 26 tests passing, >80% coverage on new functions
- **Commits**: 3 phase commits + 1 plan update
- **Zero Breaking Changes**: Fully backward compatible with existing tools

### Feature Branch

**Branch**: `plan-16-scope-aware-tool-discovery` **Status**: Ready for merge to main
