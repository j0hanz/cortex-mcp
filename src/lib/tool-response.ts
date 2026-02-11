export function createToolResponse<T extends object>(
  structured: T
): {
  content: { type: 'text'; text: string }[];
  structuredContent: T;
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}
