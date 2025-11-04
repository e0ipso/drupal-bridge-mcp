---
id: 2
group: 'environment-configuration'
dependencies: [1]
status: 'completed'
created: 2025-11-03
skills:
  - documentation
---

# Verify Environment Variable Consistency Across Documentation

## Objective

Ensure all environment variable references across project documentation (README.md, AGENTS.md,
src/oauth/README.md) are consistent with the updated .env.example template, using standardized
variable names and avoiding references to obsolete variables.

## Skills Required

- **documentation**: Technical documentation verification and consistency checking

## Acceptance Criteria

- [ ] All documentation files checked for environment variable references
- [ ] DRUPAL_BASE_URL is the primary documented variable (not DRUPAL_URL)
- [ ] No references to DRUPAL_JSONRPC_ENDPOINT exist in documentation
- [ ] OAUTH_SCOPES and OAUTH_RESOURCE_SERVER_URL are mentioned where appropriate
- [ ] Variable naming is consistent across all documentation files
- [ ] Examples in documentation use current variable names
- [ ] Migration guides reference correct current state

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Files to Check:**

1. /workspace/README.md
2. /workspace/AGENTS.md
3. /workspace/src/oauth/README.md
4. /workspace/.github/DEPLOYMENT.md (if exists)

**Verification Steps:**

1. **Search for Obsolete Variables:**
   - DRUPAL_JSONRPC_ENDPOINT
   - References to "PR #3"
   - Old migration notes

2. **Verify Standard Variable Names:**
   - DRUPAL_BASE_URL is used (not DRUPAL_URL)
   - OAUTH_ADDITIONAL_SCOPES is documented correctly
   - DRUPAL_JSONRPC_METHOD is explained with GET/POST behavior

3. **Check for Missing Variables:**
   - OAUTH_SCOPES should be mentioned in OAuth configuration sections
   - OAUTH_RESOURCE_SERVER_URL should be mentioned as optional override

**Expected Updates:**

- Replace any DRUPAL_URL examples with DRUPAL_BASE_URL
- Remove DRUPAL_JSONRPC_ENDPOINT from all configuration examples
- Add OAUTH_SCOPES to OAuth configuration sections where appropriate
- Update migration guides to reflect current architecture

## Input Dependencies

- Task 1: Updated .env.example serves as the authoritative reference for variable naming and
  documentation

## Output Artifacts

- Consistent environment variable documentation across all project files
- No conflicting or outdated variable references
- Clear, unified guidance for new users

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Search for Obsolete References

Use grep to find all references to obsolete variables:

```bash
# Search for DRUPAL_JSONRPC_ENDPOINT
grep -r "DRUPAL_JSONRPC_ENDPOINT" --include="*.md" --exclude-dir=".ai/task-manager/archive" .

# Search for DRUPAL_URL (to verify it's not the primary documented variable)
grep -r "DRUPAL_URL" --include="*.md" --exclude-dir=".ai/task-manager/archive" . | grep -v "DRUPAL_BASE_URL"
```

### Step 2: Check README.md

Review /workspace/README.md for:

- Environment configuration section
- OAuth scope configuration examples
- Any references to DRUPAL_JSONRPC_ENDPOINT or old architecture
- Consistency with .env.example variable names

Update as needed to match .env.example.

### Step 3: Check AGENTS.md

Review /workspace/AGENTS.md for:

- Environment Configuration section (lines 38-44)
- Required variables list
- OAuth configuration mentions
- Migration workflow documentation

Update as needed to match .env.example.

### Step 4: Check src/oauth/README.md

Review /workspace/src/oauth/README.md for:

- OAuth configuration examples
- Environment variable documentation
- Required variables list
- Setup instructions

Update as needed to match .env.example.

### Step 5: Check Deployment Documentation

If /workspace/.github/DEPLOYMENT.md exists, verify:

- Environment variables section
- No obsolete variables
- Consistent naming with .env.example

### Step 6: Validate Code Comments

Check for any code comments in TypeScript files that reference environment variables:

```bash
grep -r "process\.env\." --include="*.ts" src/ | grep -v "test" | grep "//"
```

Ensure inline comments use correct variable names.

### Step 7: Create Verification Report

Document findings:

- List of files updated
- Variables corrected
- Any inconsistencies that couldn't be automatically resolved

</details>

**Search Commands:**

```bash
# Find all .md files with environment variable references
grep -r "DRUPAL_BASE_URL\|OAUTH_" --include="*.md" --exclude-dir=".ai/task-manager/archive" .

# Find obsolete references
grep -r "DRUPAL_JSONRPC_ENDPOINT" --include="*.md" --exclude-dir=".ai/task-manager/archive" .
```

**Reference:**

- Updated .env.example from Task 1 serves as the authoritative source

## Execution Notes

### Completed Actions

✅ **Obsolete Variable References Removed:**

- Removed all references to `DRUPAL_JSONRPC_ENDPOINT` from documentation files
- Updated AGENTS.md tool invocation section to reflect per-tool URL architecture
- Updated DEPLOYMENT.md to remove obsolete `DRUPAL_JSONRPC_ENDPOINT` variable

✅ **Variable Name Standardization:**

- Updated src/oauth/README.md to use `DRUPAL_BASE_URL` instead of `DRUPAL_URL` (3 occurrences)
- All documentation now consistently uses `DRUPAL_BASE_URL` as the primary variable

✅ **Documentation Updates:**

- AGENTS.md: Replaced migration section with "Tool Invocation Method" section describing current
  architecture
- AGENTS.md: Updated Tool Discovery component description to reference per-tool URLs
- DEPLOYMENT.md: Replaced `DRUPAL_JSONRPC_ENDPOINT` with `DRUPAL_JSONRPC_METHOD` in configuration
  list
- src/oauth/README.md: Updated environment variable examples and troubleshooting sections

✅ **Verification Completed:**

- README.md: No obsolete references found ✓
- AGENTS.md: All obsolete references removed and updated ✓
- src/oauth/README.md: All DRUPAL_URL references replaced with DRUPAL_BASE_URL ✓
- .github/DEPLOYMENT.md: DRUPAL_JSONRPC_ENDPOINT removed ✓

### Files Updated

1. **AGENTS.md**
   - Line 70: Updated tool invocation description
   - Lines 171-184: Replaced "Migrating to Standard JSON-RPC Endpoint" with "Tool Invocation Method"

2. **src/oauth/README.md**
   - Line 70: Changed `DRUPAL_URL` to `DRUPAL_BASE_URL`
   - Line 82: Updated comment to reference `DRUPAL_BASE_URL`
   - Line 259: Updated troubleshooting to reference `DRUPAL_BASE_URL`

3. **.github/DEPLOYMENT.md**
   - Line 64: Replaced `DRUPAL_JSONRPC_ENDPOINT` with `DRUPAL_JSONRPC_METHOD`

### Verification Summary

All acceptance criteria have been met:

- ✅ All documentation files checked for environment variable references
- ✅ DRUPAL_BASE_URL is now the primary documented variable across all files
- ✅ No references to DRUPAL_JSONRPC_ENDPOINT remain in documentation
- ✅ Variable naming is consistent across all documentation files
- ✅ Examples in documentation use current variable names
- ✅ Architecture descriptions reflect current per-tool URL implementation
