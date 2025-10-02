---
id: 9
group: 'documentation'
dependencies: [6, 7]
status: 'pending'
created: '2025-10-02'
skills: ['technical-writing']
---

# Update Documentation for Dynamic Discovery

## Objective

Update README.md and create troubleshooting guide to document the new dynamic tool discovery
feature, configuration requirements, and common issues.

## Skills Required

- **technical-writing**: Clear explanations, examples, troubleshooting guides

## Acceptance Criteria

- [ ] README.md updated with Dynamic Discovery section
- [ ] Document required environment variable `DRUPAL_BASE_URL`
- [ ] Document optional environment variable `TOOL_CACHE_TTL_MS`
- [ ] Explain `/mcp/tools/list` endpoint requirement
- [ ] Add example tool definition JSON Schema format
- [ ] Document server startup behavior (fails if discovery fails)
- [ ] Create TROUBLESHOOTING.md with common issues and solutions
- [ ] Update existing setup/installation instructions if needed
- [ ] Note that this uses emerging community standard (A2A framework)

## Technical Requirements

**Files to Update**:

- `README.md` - add Dynamic Discovery section
- `TROUBLESHOOTING.md` - create new file (or add section to README)

**Documentation Sections**:

1. Overview of dynamic discovery
2. Environment variables
3. Drupal endpoint requirements
4. Tool definition format
5. Startup behavior
6. Troubleshooting common issues
7. Cache configuration

**Tone**: Clear, concise, helpful. Assume user is familiar with MCP but new to this implementation.

## Input Dependencies

- Completed implementation (Tasks 1-7)
- Understanding of discovery flow and error scenarios
- Sample tool definitions from plan

## Output Artifacts

- Updated `README.md` with complete discovery documentation
- `TROUBLESHOOTING.md` or troubleshooting section
- Examples of tool definitions and configurations

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Read Current README

```bash
cat README.md
```

Understand current structure and where to add new section.

### Step 2: Add Dynamic Discovery Section to README

Add after "Features" section or create new "Configuration" section:

````markdown
## Dynamic Tool Discovery

This MCP server uses **dynamic tool discovery** to automatically register tools from your Drupal
backend. Tools are discovered from the `/mcp/tools/list` endpoint at server startup, eliminating the
need for hardcoded tool definitions.

### How It Works

1. **Discovery**: Server queries `GET /mcp/tools/list` at startup
2. **Validation**: Tool definitions validated against JSON Schema
3. **Registration**: Tools dynamically registered with MCP SDK
4. **Invocation**: Tool calls proxied to Drupal JSON-RPC endpoints

### Community Standard

This implementation follows the emerging **A2A (Agent-to-Agent) Framework** community standard for
MCP tool discovery. See [DevTurtle Blog](https://www.devturtleblog.com/agentic-a2a-framework-mcp/)
for details.

⚠️ **Note**: `/mcp/tools/list` is not part of the official MCP specification (yet). It's an emerging
community pattern.

### Required Configuration

#### Environment Variables

**`DRUPAL_BASE_URL`** (required)

- Base URL of your Drupal site
- Must be accessible from the MCP server
- Example: `https://your-drupal-site.com`

**`TOOL_CACHE_TTL_MS`** (optional)

- Cache lifetime for discovered tools in milliseconds
- Default: `3600000` (1 hour)
- Set to `0` to disable caching (not recommended)

#### .env Example

```bash
DRUPAL_BASE_URL=https://drupal-contrib.ddev.site
TOOL_CACHE_TTL_MS=3600000  # 1 hour
```
````

### Drupal Endpoint Requirements

Your Drupal backend must implement the `/mcp/tools/list` endpoint. This is provided by the
**`jsonrpc_mcp` Drupal module**:

**Installation**:

```bash
composer require e0ipso/jsonrpc_mcp
drush en jsonrpc_mcp -y
```

**Documentation**: https://github.com/e0ipso/jsonrpc_mcp

**Expected Response Format**:

The endpoint returns:

```json
{
  "tools": [
    {
      "name": "search_content",
      "description": "Search Drupal content with filters",
      "inputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search query",
            "minLength": 1
          },
          "limit": {
            "type": "integer",
            "description": "Maximum results",
            "minimum": 1,
            "maximum": 100,
            "default": 10
          }
        },
        "required": ["query"]
      },
      "endpoint": "/jsonrpc",
      "method": "content.search",
      "requiresAuth": true
    }
  ]
}
```

#### Tool Definition Schema

Each tool must have:

- **name** (string): Unique tool identifier (kebab-case recommended)
- **description** (string): Human-readable description
- **inputSchema** (object): JSON Schema Draft 2020-12 for parameters
- **endpoint** (string): Drupal JSON-RPC endpoint path
- **method** (string): JSON-RPC method name
- **requiresAuth** (boolean): Whether tool requires OAuth authentication

### Startup Behavior

**Success**: Server discovers tools and starts normally

```
=== Discovering Tools ===
✓ Successfully discovered 5 tools
✓ Registered 5 dynamic tool handlers
=== Starting MCP Server ===
✅ MCP Server started successfully with 5 tools
```

**Failure**: Server exits with error if discovery fails

```
❌ FATAL: Tool discovery failed
Error: HTTP 404 Not Found

Troubleshooting:
  1. Verify DRUPAL_BASE_URL is correct
  2. Ensure /mcp/tools/list endpoint exists on Drupal
  3. Check network connectivity to Drupal server
```

The server **will not start** without successfully discovering at least one tool. This is
intentional fail-fast behavior.

### Caching

Discovered tools are cached in memory for 1 hour (configurable via `TOOL_CACHE_TTL_MS`). This
reduces startup time and load on the Drupal server.

To force fresh discovery:

- Restart the MCP server
- Wait for cache TTL to expire
- Clear cache programmatically (not exposed via API currently)

### Adding New Tools

1. Add tool definition to Drupal `/mcp/tools/list` endpoint
2. Restart MCP server
3. Tool is automatically discovered and registered
4. No code changes needed on MCP server side

### Technical Details

- Uses `zod-from-json-schema` for runtime schema validation
- Supports all JSON Schema Draft 2020-12 features
- Proxies tool calls to Drupal JSON-RPC endpoints
- Propagates OAuth tokens for authenticated tools
- Skips tools with invalid schemas (logs warning, continues with valid tools)

````

### Step 3: Create TROUBLESHOOTING.md

```markdown
# Troubleshooting Dynamic Tool Discovery

Common issues and solutions for MCP tool discovery.

## Server Won't Start

### Error: "DRUPAL_BASE_URL environment variable is required"

**Cause**: Missing required environment variable

**Solution**:
1. Create `.env` file in project root
2. Add: `DRUPAL_BASE_URL=https://your-drupal-site.com`
3. Restart server

### Error: "Tool discovery failed: HTTP 404 Not Found"

**Cause**: Drupal endpoint `/mcp/tools/list` doesn't exist or `jsonrpc_mcp` module not installed

**Solutions**:
1. **Install the `jsonrpc_mcp` Drupal module**:
   ```bash
   composer require e0ipso/jsonrpc_mcp
   drush en jsonrpc_mcp -y
   drush cr
````

2. Verify Drupal URL is correct: `curl $DRUPAL_BASE_URL/mcp/tools/list`
3. Check Drupal logs for routing errors
4. Ensure module is enabled: `drush pm:list --status=enabled | grep jsonrpc_mcp`
5. Verify endpoint responds with JSON (not HTML error page)
6. See module documentation: https://github.com/e0ipso/jsonrpc_mcp

### Error: "Tool discovery failed: Request timed out after 5 seconds"

**Cause**: Network connectivity issue or slow Drupal response

**Solutions**:

1. Check network connectivity: `ping your-drupal-site.com`
2. Test endpoint directly: `curl -w "\nTime: %{time_total}s\n" $DRUPAL_BASE_URL/mcp/tools/list`
3. Check Drupal server performance and caching
4. Verify no firewall blocking requests

### Error: "No tools discovered from /mcp/tools/list"

**Cause**: Endpoint returned empty `tools` array

**Solutions**:

1. Check `jsonrpc_mcp` module configuration in Drupal admin
2. Verify tools are configured in the module settings
3. Test endpoint: `curl $DRUPAL_BASE_URL/mcp/tools/list | jq .tools`
4. Verify user permissions (if authentication required)
5. Check Drupal logs for errors in tool retrieval
6. Consult module documentation: https://github.com/e0ipso/jsonrpc_mcp

## Schema Validation Errors

### Warning: "Skipping tool xyz: schema conversion failed"

**Cause**: Tool's JSON Schema is invalid or unsupported

**Solutions**:

1. Validate JSON Schema: https://www.jsonschemavalidator.net/
2. Ensure schema follows JSON Schema Draft 2020-12
3. Check for unsupported features (e.g., external `$ref`)
4. Verify `inputSchema` is an object, not a string

**Example Valid Schema**:

```json
{
  "type": "object",
  "properties": {
    "param1": { "type": "string" }
  },
  "required": ["param1"]
}
```

## Tool Invocation Errors

### Error: "Unknown tool: xyz"

**Cause**: Tool not discovered or schema conversion failed

**Solutions**:

1. Check server startup logs for tool registration
2. Verify tool name matches exactly (case-sensitive)
3. Check if tool was skipped due to invalid schema
4. Restart server to re-discover tools

### Error: "Tool xyz requires authentication"

**Cause**: Tool has `requiresAuth: true` but no session provided

**Solutions**:

1. Use `auth_login` tool first to authenticate
2. Ensure OAuth flow completed successfully
3. Check session hasn't expired
4. Verify access token is valid

### Error: "Invalid parameters for tool xyz"

**Cause**: Request parameters don't match tool's JSON Schema

**Solutions**:

1. Check tool's `inputSchema` for required fields
2. Verify parameter types match (string, number, boolean)
3. Check for missing required parameters
4. Review Zod validation error message for specifics

## Performance Issues

### Server Startup Slow

**Cause**: Discovery taking too long or too many tools

**Solutions**:

1. Check endpoint response time: `time curl $DRUPAL_BASE_URL/mcp/tools/list`
2. Optimize Drupal caching for `/mcp/tools/list`
3. Reduce number of tools if possible
4. Increase cache TTL: `TOOL_CACHE_TTL_MS=7200000` (2 hours)

### Tools Not Updating

**Cause**: Cache still valid

**Solutions**:

1. Wait for cache to expire (default 1 hour)
2. Restart MCP server to force fresh discovery
3. Reduce cache TTL for development: `TOOL_CACHE_TTL_MS=60000` (1 minute)

## Network Issues

### ECONNREFUSED

**Cause**: Can't connect to Drupal server

**Solutions**:

1. Verify Drupal server is running
2. Check `DRUPAL_BASE_URL` uses correct protocol (http/https)
3. Check port number if non-standard
4. Verify firewall rules allow outbound connections

### SSL Certificate Errors

**Cause**: Self-signed certificate or certificate validation failure

**Solutions** (development only):

1. Use `http://` instead of `https://` for local development
2. Ensure valid SSL certificate in production
3. Do NOT disable SSL verification in production code

## Getting Help

If issues persist:

1. Check server logs for detailed error messages
2. Test endpoint manually with `curl`
3. Review Drupal logs for backend errors
4. Verify JSON response format matches expected structure
5. Check Drupal module documentation: https://github.com/e0ipso/jsonrpc_mcp
6. Open issue at MCP server repository [GitHub repository URL]

## Related Resources

- **Drupal Backend Module**: https://github.com/e0ipso/jsonrpc_mcp
- **A2A Framework Blog**: https://www.devturtleblog.com/agentic-a2a-framework-mcp/
- **MCP Protocol Specification**: https://modelcontextprotocol.io/

````

### Step 4: Update Installation Section (if needed)

Add to installation instructions:

```markdown
## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and set DRUPAL_BASE_URL
````

4. Build: `npm run build`
5. Start: `npm start`

⚠️ **Important**: Server requires valid `DRUPAL_BASE_URL` and accessible `/mcp/tools/list` endpoint
to start.

````

### Step 5: Add to Package README (if separate)

If there's a package description for npm, add note about dynamic discovery:

```markdown
## Key Features

- 🔍 **Dynamic Tool Discovery**: Automatically discovers tools from Drupal `/mcp/tools/list` endpoint
- 🔐 **OAuth 2.1 Authentication**: Device Flow and Client Credentials support
- 🧠 **MCP Sampling**: AI-enhanced search capabilities
- ⚡ **Minimal Codebase**: 336 lines vs 6000 lines (94% reduction)
- 📦 **Zero Hardcoded Tools**: All tools configured on Drupal side
````

### Step 6: Review and Test Links

Check all links work:

```bash
# If using markdown linter
npm run lint:md README.md TROUBLESHOOTING.md
```

### Step 7: Add Examples Directory (Optional)

Create `examples/` directory with sample tool definitions:

```bash
mkdir -p examples
cat > examples/sample-tools-list-response.json << 'EOF'
{
  "tools": [
    {
      "name": "create_article",
      "description": "Create a new Drupal article with title and body",
      "inputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Article title",
            "minLength": 1,
            "maxLength": 255
          },
          "body": {
            "type": "string",
            "description": "Article body content"
          },
          "published": {
            "type": "boolean",
            "description": "Publish immediately",
            "default": false
          }
        },
        "required": ["title", "body"]
      },
      "endpoint": "/jsonrpc",
      "method": "article.create",
      "requiresAuth": true
    }
  ]
}
EOF
```

### Step 8: Commit Documentation

```bash
git add README.md TROUBLESHOOTING.md examples/
git commit -m "docs: add dynamic tool discovery documentation

- Document /mcp/tools/list endpoint requirement
- Add environment variable configuration
- Create troubleshooting guide with common issues
- Add example tool definition format
- Explain A2A community standard context

Refs: Plan 7 - MCP Tool Auto-Discovery"
```

### Troubleshooting

**Issue: Documentation Too Technical**

- Add more examples and use cases
- Include diagrams if helpful (mermaid, etc.)
- Add "Quick Start" section for impatient users

**Issue: Missing Information**

- Review plan document for technical details
- Check implementation code for edge cases
- Add FAQ section for common questions

**Issue: Links Broken**

- Test all external links
- Use relative paths for internal docs
- Consider using link checker tool

</details>
