/**
 * Main module for the MCP server
 */

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export const config = {
  name: '@e0ipso/drupalizeme-mcp-server',
  version: '1.0.0',
} as const;
