---
id: 3
group: 'entry-point-separation'
dependencies: [1, 2]
status: 'completed'
created: '2025-10-08'
skills:
  - node-package-config
---

# Update Package Configuration

## Objective

Update `package.json` to point the `bin` field to the new `dist/server.js` executable entry point
while keeping `main` pointed to `dist/index.js` for library imports, and update npm scripts to
reference the correct files.

## Skills Required

- **node-package-config**: Understanding of package.json structure, bin field, main field, and npm
  scripts configuration

## Acceptance Criteria

- [ ] `package.json` `bin` field updated to `"dist/server.js"`
- [ ] `package.json` `main` field remains `"dist/index.js"`
- [ ] `npm run dev` script updated to reference `src/server.ts`
- [ ] `npm start` script updated to reference `dist/server.js`
- [ ] `npm run start:debug` script updated to reference `dist/server.js`
- [ ] All other scripts remain functional
- [ ] Type checking passes after changes

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

- Maintain backward compatibility for library consumers
- Ensure CLI command (`drupal-bridge-mcp`) points to the new server entry point
- Update only the necessary script references
- Verify build output includes both `dist/index.js` and `dist/server.js`

## Input Dependencies

- Task 1: `src/server.ts` created
- Task 2: `src/index.ts` refactored to pure exports
- Current `package.json` structure

## Output Artifacts

- Updated `package.json` with corrected bin, main, and script references
- No changes to dependencies or other package metadata

## Implementation Notes

<details>
<summary>Detailed Implementation Instructions</summary>

### Step 1: Update bin Field

Change the bin field in `package.json`:

**Current (line 6-8):**

```json
"bin": {
  "drupal-bridge-mcp": "dist/index.js"
}
```

**New:**

```json
"bin": {
  "drupal-bridge-mcp": "dist/server.js"
}
```

### Step 2: Verify main Field

Ensure the main field remains unchanged (line 5):

```json
"main": "dist/index.js"
```

This allows library consumers to import from the package.

### Step 3: Update npm Scripts

Update the following scripts in the `scripts` section:

**dev script (line 15):**

- **Current:** `"dev": "DEBUG=mcp:* tsx --env-file=.env src/index.ts"`
- **New:** `"dev": "DEBUG=mcp:* tsx --env-file=.env src/server.ts"`

**start script (line 16):**

- **Current:** `"start": "node --env-file=.env dist/index.js"`
- **New:** `"start": "node --env-file=.env dist/server.js"`

**start:debug script (line 17):**

- **Current:** `"start:debug": "DEBUG=mcp:* node --env-file=.env dist/index.js"`
- **New:** `"start:debug": "DEBUG=mcp:* node --env-file=.env dist/server.js"`

### Step 4: Scripts That Should NOT Change

These scripts reference source files or use different entry points and should remain unchanged:

- `build` - builds all TypeScript files
- `type-check` - checks all source files
- `test` - runs test suite
- `semantic-release` - release automation

### Step 5: Verification Checklist

After making changes:

1. Verify JSON syntax is valid (no trailing commas, proper quotes)
2. Ensure all referenced files will exist after build
3. Check that the bin field uses the executable entry point
4. Confirm main field uses the library entry point

### Expected Changes Summary

Only 4 fields should change:

1. `bin.drupal-bridge-mcp`: `dist/index.js` → `dist/server.js`
2. `scripts.dev`: `src/index.ts` → `src/server.ts`
3. `scripts.start`: `dist/index.js` → `dist/server.js`
4. `scripts.start:debug`: `dist/index.js` → `dist/server.js`

### Important Notes

- **Do not change**: The `main` field (stays `dist/index.js`)
- **Do not change**: The `build` script or TypeScript configuration references
- **Do not change**: Any other package.json fields (dependencies, metadata, etc.)

</details>
