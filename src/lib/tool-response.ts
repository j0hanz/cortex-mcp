import type {
  ContentBlock,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

export function createToolResponse<T extends object>(
  structured: T,
  embeddedResource?: TextResourceContents
): {
  content: ContentBlock[];
  structuredContent: T;
} {
  const content: ContentBlock[] = [
    { type: 'text', text: JSON.stringify(structured) },
  ];
  if (embeddedResource) {
    content.push({ type: 'resource', resource: embeddedResource });
  }
  return {
    content,
    structuredContent: structured,
  };
}
