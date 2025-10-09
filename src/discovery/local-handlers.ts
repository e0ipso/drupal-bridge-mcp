import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type LocalToolHandler = (
  params: unknown,
  extra: { sessionId?: string }
) => Promise<CallToolResult>;
