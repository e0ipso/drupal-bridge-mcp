---
id: 1
group: 'cli-parser'
dependencies: []
status: 'completed'
created: 2025-11-05
skills:
  - typescript
  - cli-parsing
---

# Update CLI Parser for Auth String Values

## Objective

Modify the CLI parser to accept `--auth` as a string argument with values `enabled` or `disabled`
instead of the boolean `--no-auth` flag.

## Skills Required

- TypeScript: For type definitions and implementation
- CLI Parsing: Understanding minimist string argument configuration

## Acceptance Criteria

- [ ] `--auth` accepts string values instead of boolean
- [ ] `--auth=enabled` parses correctly
- [ ] `--auth=disabled` parses correctly
- [ ] No `--auth` flag returns `undefined` for auth property
- [ ] `ParsedCliArgs` interface updated to reflect `auth?: string`
- [ ] minimist configuration updated to treat `auth` as string type

## Technical Requirements

**File to modify**: `src/utils/cli-parser.ts`

**Changes needed**:

1. Update `ParsedCliArgs` interface:
   - Change `auth?: boolean` to `auth?: string`
   - Update JSDoc comment to reflect new behavior

2. Update minimist configuration in `parseCliArgs()`:
   - Remove `auth` from `boolean` array
   - Add `auth` to `string` array
   - Remove `default: { auth: undefined }` configuration

3. Update return statement:
   - Change `auth: parsed.auth` to pass through string value

## Input Dependencies

None - this is the first task in the dependency chain.

## Output Artifacts

- Updated `cli-parser.ts` with string-based auth parsing
- Updated TypeScript interface for downstream consumption

## Implementation Notes

<details>
<summary>Implementation Details</summary>

### Current Implementation (to be changed):

```typescript
boolean: ['auth', 'help', 'version'],
default: {
  auth: undefined,
}
```

### New Implementation:

```typescript
string: [
  'drupal-url',
  'drupal-base-url',
  'auth',  // Add here
  'port',
],
boolean: ['help', 'version'],  // Remove auth from here
```

### Interface Change:

```typescript
// Old
auth?: boolean;

// New
auth?: string;
```

The parser should NOT validate values (enabled/disabled) - validation happens in config-manager. The
parser only extracts the raw string value.

</details>
