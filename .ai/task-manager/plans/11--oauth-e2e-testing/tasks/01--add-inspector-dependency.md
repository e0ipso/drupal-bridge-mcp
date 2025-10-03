---
id: 1
group: 'test-infrastructure'
dependencies: []
status: 'completed'
created: '2025-10-03'
skills:
  - 'npm'
---

# Add MCP Inspector as Dev Dependency

## Objective

Add `@modelcontextprotocol/inspector` package as a dev dependency to enable CLI-based e2e testing of
the OAuth flow.

## Skills Required

- **npm**: Package management and dependency installation

## Acceptance Criteria

- [ ] `@modelcontextprotocol/inspector` added to devDependencies in package.json
- [ ] Package version is pinned to prevent breaking changes
- [ ] Dependencies are installed successfully
- [ ] Inspector CLI is accessible via npx

## Technical Requirements

- Add the latest stable version of `@modelcontextprotocol/inspector`
- Pin to exact version (not using ^ or ~) to prevent API changes
- Verify the package includes the CLI binary (`mcp-inspector`)

## Input Dependencies

- Existing package.json file

## Output Artifacts

- Updated package.json with new devDependency
- Updated package-lock.json with inspector package

## Implementation Notes

<details>
<summary>Click to expand implementation details</summary>

Install the package using:

```bash
npm install --save-dev @modelcontextprotocol/inspector
```

After installation, verify the CLI is available:

```bash
npx @modelcontextprotocol/inspector --help
```

Document the installed version in the task completion notes for reference in README documentation.

</details>
