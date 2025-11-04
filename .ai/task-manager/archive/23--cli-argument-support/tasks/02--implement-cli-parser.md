---
id: 2
group: 'cli-parsing'
dependencies: [1]
status: 'completed'
created: '2025-11-04'
completed: '2025-11-04'
skills:
  - 'typescript'
  - 'node-cli'
---

# Implement CLI Argument Parser Module

## Objective

Create a type-safe CLI argument parser module that uses minimist to parse command-line arguments and
return a structured configuration object with proper TypeScript types.

## Skills Required

- typescript: Type-safe argument parsing with interfaces and validation
- node-cli: CLI best practices for argument parsing and validation

## Acceptance Criteria

- [x] New file `src/utils/cli-parser.ts` created with parseCliArgs function
- [x] TypeScript interface defines all supported CLI arguments
- [x] Parser handles both `--flag=value` and `--flag value` syntax
- [x] Boolean flags work correctly (`--auth`, `--no-auth`)
- [x] Shorthand flags supported (`-h` for help, `-v` for version)
- [x] Type checking passes without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Supported Arguments**:

- `--drupal-url=<url>` or `--drupal-base-url=<url>`: Drupal site URL
- `--auth` / `--no-auth`: Enable/disable OAuth authentication
- `--port=<number>`: Server port
- `--log-level=<level>`: Logging verbosity (trace|debug|info|warn|error|fatal)
- `--oauth-scopes=<scopes>`: OAuth scopes (comma or space separated)
- `--oauth-additional-scopes=<scopes>`: Additional OAuth scopes
- `--oauth-resource-server-url=<url>`: OAuth resource server URL
- `--drupal-jsonrpc-method=<method>`: JSON-RPC HTTP method (GET|POST)
- `--help` / `-h`: Show help message
- `--version` / `-v`: Show version

**TypeScript Interface**:

```typescript
export interface ParsedCliArgs {
  drupalUrl?: string;
  drupalBaseUrl?: string;
  auth?: boolean;
  port?: number;
  logLevel?: string;
  oauthScopes?: string;
  oauthAdditionalScopes?: string;
  oauthResourceServerUrl?: string;
  drupalJsonrpcMethod?: string;
  help?: boolean;
  version?: boolean;
}
```

## Input Dependencies

- minimist package installed (task 1)

## Output Artifacts

- `src/utils/cli-parser.ts` with:
  - `ParsedCliArgs` interface
  - `parseCliArgs(argv: string[]): ParsedCliArgs` function
  - Helper functions for argument normalization if needed

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Create file structure**:

   ```bash
   touch src/utils/cli-parser.ts
   ```

2. **Import minimist**:

   ```typescript
   import minimist from 'minimist';
   ```

3. **Define ParsedCliArgs interface** with optional properties for all supported arguments

4. **Implement parseCliArgs function**:

   ```typescript
   export function parseCliArgs(argv: string[]): ParsedCliArgs {
     const parsed = minimist(argv, {
       string: [
         'drupal-url',
         'drupal-base-url',
         'log-level',
         'oauth-scopes',
         'oauth-additional-scopes',
         'oauth-resource-server-url',
         'drupal-jsonrpc-method',
       ],
       boolean: ['auth', 'help', 'version'],
       alias: {
         h: 'help',
         v: 'version',
       },
       default: {
         auth: undefined, // Let env vars take precedence if not specified
       },
     });

     return {
       drupalUrl: parsed['drupal-url'],
       drupalBaseUrl: parsed['drupal-base-url'],
       auth: parsed.auth,
       port: parsed.port ? parseInt(parsed.port, 10) : undefined,
       logLevel: parsed['log-level'],
       oauthScopes: parsed['oauth-scopes'],
       oauthAdditionalScopes: parsed['oauth-additional-scopes'],
       oauthResourceServerUrl: parsed['oauth-resource-server-url'],
       drupalJsonrpcMethod: parsed['drupal-jsonrpc-method'],
       help: parsed.help,
       version: parsed.version,
     };
   }
   ```

5. **Handle camelCase conversion**:
   - minimist returns kebab-case keys
   - Convert to camelCase in return object for TypeScript consistency

6. **Type safety**:
   - Use TypeScript strict mode
   - Ensure all return values match ParsedCliArgs interface
   - Handle type coercion for port (string to number)

7. **Test manually**:
   ```bash
   npm run build
   # Test in Node REPL or create temporary test file
   ```

**Key Design Decisions**:

- Use undefined (not null) for missing values to match TypeScript optional property semantics
- Keep parser pure - no validation in this module (validation happens in config-manager)
- Support both --drupal-url and --drupal-base-url for backward compatibility
- Port converted to number here (not in config-manager) since it's always a number

</details>
