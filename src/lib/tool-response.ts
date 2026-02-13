import type {
  ContentBlock,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

function createStructuredTextBlock(structured: object): ContentBlock {
  return { type: 'text', text: JSON.stringify(structured) };
}

export function createToolResponse<T extends object>(
  structured: T,
  embeddedResource?: TextResourceContents
): {
  content: ContentBlock[];
  structuredContent: T;
} {
  const content: ContentBlock[] = [createStructuredTextBlock(structured)];
  if (embeddedResource) {
    content.push({ type: 'resource', resource: embeddedResource });
  }
  return {
    content,
    structuredContent: structured,
  };
}
