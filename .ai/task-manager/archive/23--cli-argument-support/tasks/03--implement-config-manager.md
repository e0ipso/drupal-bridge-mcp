---
id: 3
group: 'cli-parsing'
dependencies: [2]
status: 'completed'
created: '2025-11-04'
skills:
  - 'typescript'
  - 'validation'
---

# Implement Configuration Manager with Environment Override

## Objective

Create a configuration manager module that applies CLI argument precedence over environment
variables, validates the merged configuration, and provides helpful error messages for invalid
values.

## Skills Required

- typescript: Type-safe configuration merging and validation logic
- validation: Input validation, URL parsing, enum checking, range validation

## Acceptance Criteria

- [x] New file `src/utils/config-manager.ts` created with applyArgsToEnv function
- [x] Precedence rule implemented: CLI args > env vars > defaults
- [x] URL validation for drupal-url using Node.js URL API
- [x] Enum validation for log-level and drupal-jsonrpc-method
- [x] Port range validation (1-65535)
- [x] Helpful error messages with examples for invalid inputs
- [x] Function modifies process.env with validated values
- [x] Type checking passes without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Validation Rules**:

- **drupal-url**: Must be valid HTTP/HTTPS URL
- **port**: Integer between 1 and 65535
- **log-level**: One of: trace, debug, info, warn, error, fatal
- **drupal-jsonrpc-method**: One of: GET, POST
- **auth**: Boolean (true/false)

**Precedence Logic**:

```typescript
// Example for drupal-url
const drupalUrl =
  cliArgs.drupalUrl ??
  cliArgs.drupalBaseUrl ??
  process.env.DRUPAL_URL ??
  process.env.DRUPAL_BASE_URL;
```

**Error Messages**:

- Invalid URL: "Invalid --drupal-url: '<url>'. Must be a valid HTTP/HTTPS URL. Example:
  https://example.com"
- Invalid port: "Invalid --port: '<port>'. Must be between 1 and 65535."
- Invalid log-level: "Invalid --log-level: '<level>'. Must be one of: trace, debug, info, warn,
  error, fatal"

## Input Dependencies

- ParsedCliArgs interface and parseCliArgs function from cli-parser.ts (task 2)

## Output Artifacts

- `src/utils/config-manager.ts` with:
  - `applyArgsToEnv(args: ParsedCliArgs): void` function
  - Validation helper functions
  - Error message formatting utilities

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Create file structure**:

   ```bash
   touch src/utils/config-manager.ts
   ```

2. **Import dependencies**:

   ```typescript
   import type { ParsedCliArgs } from './cli-parser.js';
   ```

3. **Define validation functions**:

   ```typescript
   function isValidUrl(url: string): boolean {
     try {
       const parsed = new URL(url);
       return parsed.protocol === 'http:' || parsed.protocol === 'https:';
     } catch {
       return false;
     }
   }

   function isValidPort(port: number): boolean {
     return Number.isInteger(port) && port >= 1 && port <= 65535;
   }

   function isValidLogLevel(level: string): boolean {
     const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
     return validLevels.includes(level.toLowerCase());
   }

   function isValidJsonRpcMethod(method: string): boolean {
     return ['GET', 'POST'].includes(method.toUpperCase());
   }
   ```

4. **Implement applyArgsToEnv function**:

   ```typescript
   export function applyArgsToEnv(args: ParsedCliArgs): void {
     // Drupal URL (prefer drupal-url over drupal-base-url)
     const drupalUrl = args.drupalUrl ?? args.drupalBaseUrl;
     if (drupalUrl !== undefined) {
       if (!isValidUrl(drupalUrl)) {
         throw new Error(
           `Invalid --drupal-url: '${drupalUrl}'. Must be a valid HTTP/HTTPS URL. Example: https://example.com`
         );
       }
       process.env.DRUPAL_BASE_URL = drupalUrl;
     }

     // Auth
     if (args.auth !== undefined) {
       process.env.AUTH_ENABLED = args.auth.toString();
     }

     // Port
     if (args.port !== undefined) {
       if (!isValidPort(args.port)) {
         throw new Error(`Invalid --port: '${args.port}'. Must be between 1 and 65535.`);
       }
       process.env.PORT = args.port.toString();
     }

     // Log level
     if (args.logLevel !== undefined) {
       if (!isValidLogLevel(args.logLevel)) {
         throw new Error(
           `Invalid --log-level: '${args.logLevel}'. Must be one of: trace, debug, info, warn, error, fatal`
         );
       }
       process.env.LOG_LEVEL = args.logLevel;
     }

     // OAuth scopes
     if (args.oauthScopes !== undefined) {
       process.env.OAUTH_SCOPES = args.oauthScopes;
     }

     // OAuth additional scopes
     if (args.oauthAdditionalScopes !== undefined) {
       process.env.OAUTH_ADDITIONAL_SCOPES = args.oauthAdditionalScopes;
     }

     // OAuth resource server URL
     if (args.oauthResourceServerUrl !== undefined) {
       if (!isValidUrl(args.oauthResourceServerUrl)) {
         throw new Error(
           `Invalid --oauth-resource-server-url: '${args.oauthResourceServerUrl}'. Must be a valid HTTP/HTTPS URL.`
         );
       }
       process.env.OAUTH_RESOURCE_SERVER_URL = args.oauthResourceServerUrl;
     }

     // JSON-RPC method
     if (args.drupalJsonrpcMethod !== undefined) {
       if (!isValidJsonRpcMethod(args.drupalJsonrpcMethod)) {
         throw new Error(
           `Invalid --drupal-jsonrpc-method: '${args.drupalJsonrpcMethod}'. Must be one of: GET, POST`
         );
       }
       process.env.DRUPAL_JSONRPC_METHOD = args.drupalJsonrpcMethod.toUpperCase();
     }
   }
   ```

5. **Export all validation helpers** (optional, for testing):

   ```typescript
   export { isValidUrl, isValidPort, isValidLogLevel, isValidJsonRpcMethod };
   ```

6. **Key behaviors**:
   - Only modify process.env for args that are explicitly provided (not undefined)
   - Throw errors synchronously for invalid values (caught by error handler in server.ts)
   - Convert boolean auth to string ('true'/'false') for process.env compatibility
   - Normalize case for log-level and drupal-jsonrpc-method

7. **Test manually**:
   ```bash
   npm run build
   # Create test file or use Node REPL to verify validation
   ```

**Design Decisions**:

- Mutation of process.env is intentional - allows rest of codebase to remain unchanged
- Validation happens here (not in parser) to separate concerns
- Helper functions exported for potential test coverage
- Error messages include examples to guide users

</details>
