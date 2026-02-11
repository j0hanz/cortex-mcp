export function createToolResponse(structured: Record<string, unknown>): {
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}
