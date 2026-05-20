/**
 * Tool result shape. We extend with an index signature so it satisfies the
 * MCP SDK's `CallToolResult` constraint without us having to import every
 * SDK helper type into this PoC.
 */
export type ToolReply = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} & { [key: string]: unknown };

export function errorReply(message: string): ToolReply {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Wrap a tool body so any thrown error becomes a structured `errorReply`
 * instead of propagating. Used by every `runX` so tests and the MCP transport
 * both see the same shape.
 */
export async function safe(fn: () => Promise<ToolReply>): Promise<ToolReply> {
  try {
    return await fn();
  } catch (err) {
    return errorReply(err instanceof Error ? err.message : String(err));
  }
}
