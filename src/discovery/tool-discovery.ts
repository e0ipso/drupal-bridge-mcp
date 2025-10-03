/**
 * Tool Discovery Service
 *
 * Queries the Drupal /mcp/tools/list endpoint to discover available tools
 * at server startup. Follows the emerging A2A (agent-to-agent) community
 * standard for dynamic tool registration.
 *
 * @see https://www.devturtleblog.com/agentic-a2a-framework-mcp/
 * @see https://github.com/e0ipso/jsonrpc_mcp - Drupal backend implementation
 */

export interface JSONSchema {
  $schema?: string;
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  [key: string]: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  title?: string;
  annotations?: Record<string, unknown>;
}

export interface ToolDiscoveryResponse {
  tools: ToolDefinition[];
}

function validateToolDefinition(
  tool: any,
  index: number
): asserts tool is ToolDefinition {
  const requiredFields = ['name', 'description', 'inputSchema'];

  for (const field of requiredFields) {
    if (!(field in tool) || tool[field] === undefined || tool[field] === null) {
      throw new Error(
        `Tool discovery failed: Tool at index ${index} missing ` +
          `required field "${field}". Tool data: ${JSON.stringify(tool)}`
      );
    }
  }

  // Additional type validation
  if (typeof tool.name !== 'string' || tool.name.trim() === '') {
    throw new Error(
      `Tool at index ${index} has invalid name: must be non-empty string`
    );
  }

  if (typeof tool.description !== 'string' || tool.description.trim() === '') {
    throw new Error(
      `Tool at index ${index} has invalid description: must be non-empty string`
    );
  }

  if (typeof tool.inputSchema !== 'object') {
    throw new Error(
      `Tool "${tool.name}" has invalid inputSchema: must be an object`
    );
  }

  // Validate optional fields if present
  if ('outputSchema' in tool && typeof tool.outputSchema !== 'object') {
    throw new Error(
      `Tool "${tool.name}" has invalid outputSchema: must be an object if provided`
    );
  }

  if ('title' in tool && typeof tool.title !== 'string') {
    throw new Error(
      `Tool "${tool.name}" has invalid title: must be a string if provided`
    );
  }

  if ('annotations' in tool && typeof tool.annotations !== 'object') {
    throw new Error(
      `Tool "${tool.name}" has invalid annotations: must be an object if provided`
    );
  }
}

export async function discoverTools(
  drupalBaseUrl: string,
  accessToken?: string
): Promise<ToolDefinition[]> {
  const url = `${drupalBaseUrl}/mcp/tools/list`;

  // Create abort controller for 5-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    console.log(`Discovering tools from ${url}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      throw new Error(
        `Tool discovery failed: HTTP ${response.status} ${response.statusText}. ` +
          `Endpoint: ${url}. ` +
          `Troubleshooting: Verify DRUPAL_BASE_URL is correct and ` +
          `/mcp/tools/list endpoint exists.`
      );
    }

    // Parse JSON response
    let data: unknown;
    try {
      data = await response.json();
    } catch (jsonError) {
      const responseText = await response
        .text()
        .catch(() => '<unable to read response>');
      throw new Error(
        `Tool discovery failed: Invalid JSON response from ${url}. ` +
          `Error: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}. ` +
          `Response: ${responseText.substring(0, 500)}`
      );
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error(
        `Tool discovery failed: Response is not an object. Got: ${typeof data}`
      );
    }

    if (!('tools' in data) || !Array.isArray((data as any).tools)) {
      throw new Error(
        `Tool discovery failed: Response missing "tools" array. ` +
          `Response keys: ${Object.keys(data).join(', ')}`
      );
    }

    const responseData = data as ToolDiscoveryResponse;

    // Validate empty tools array
    if (responseData.tools.length === 0) {
      throw new Error(
        `Tool discovery failed: No tools returned from ${url}. ` +
          `The MCP server cannot start without any tools. ` +
          `Ensure Drupal backend has configured tools at /mcp/tools/list.`
      );
    }

    // Normalize and validate each tool definition
    const normalizedTools = responseData.tools.map((tool, index) => {
      // Normalize inputSchema.properties from array to object (Drupal backend quirk)
      if (
        tool.inputSchema &&
        Array.isArray(tool.inputSchema.properties) &&
        tool.inputSchema.properties.length === 0
      ) {
        tool.inputSchema.properties = {};
      }

      validateToolDefinition(tool, index);
      return tool;
    });

    console.log(`✓ Successfully discovered ${normalizedTools.length} tools`);
    return normalizedTools;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Tool discovery failed: Request to ${url} timed out after 5 seconds. ` +
          `Check network connectivity and Drupal server status.`
      );
    }

    // Re-throw other errors with context
    throw error;
  }
}
