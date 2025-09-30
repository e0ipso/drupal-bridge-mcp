---
id: 2
group: 'configuration-updates'
dependencies: [1]
status: 'completed'
created: '2025-10-01'
skills:
  - nodejs
---

# Update package.json scripts to remove HTTP variants

## Objective

Simplify package.json npm scripts by removing redundant `:http` variants and updating base scripts
to use the new default HTTP server in `src/index.ts`.

## Skills Required

- **nodejs**: Understanding npm package configuration and script management

## Acceptance Criteria

- [ ] `dev:http` script is removed from package.json
- [ ] `start:http` script is removed from package.json
- [ ] `dev` script points to `tsx --env-file=.env src/index.ts`
- [ ] `start` script points to `node --env-file=.env dist/index.js`
- [ ] Build, type-check, and test scripts remain unchanged
- [ ] All scripts execute correctly after changes

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

- Edit package.json scripts section
- Remove duplicate HTTP variant scripts
- Update base scripts to use index.ts
- Preserve all other scripts (build, type-check, test, semantic-release)
- Maintain proper JSON formatting

## Input Dependencies

- Task 1 must be completed (HTTP server is now in src/index.ts)

## Output Artifacts

- Updated package.json with simplified scripts section

## Implementation Notes

<details>
<summary>Detailed implementation steps</summary>

1. **Read current package.json**:
   - Locate the `scripts` section
   - Identify all `:http` variant scripts

2. **Remove HTTP variants**:
   - Delete `dev:http` script
   - Delete `start:http` script

3. **Update base scripts** (if they're not already correct):
   - Set `dev`: `tsx --env-file=.env src/index.ts`
   - Set `start`: `node --env-file=.env dist/index.js`

4. **Verify other scripts are unchanged**:
   - `build`: `tsc`
   - `type-check`: `tsc --noEmit`
   - `test`: `jest`
   - `semantic-release`: `semantic-release`

5. **Validate changes**:
   - Ensure JSON is properly formatted
   - Run `npm run dev` to verify it works
   - Run `npm run build` and then `npm run start` to verify production mode

**Expected final scripts section**:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsx --env-file=.env src/index.ts",
  "start": "node --env-file=.env dist/index.js",
  "type-check": "tsc --noEmit",
  "test": "jest",
  "semantic-release": "semantic-release"
}
```

</details>
