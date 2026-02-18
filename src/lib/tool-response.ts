import type {
  ContentBlock,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

function createStructuredTextBlock(structured: object): ContentBlock {
  return { type: 'text', text: JSON.stringify(structured) };
}

function hasEmbeddedResource(
  embeddedResource: TextResourceContents | undefined
): embeddedResource is TextResourceContents {
  return embeddedResource !== undefined;
}

export function createToolResponse<T extends object>(
  structured: T,
  embeddedResource?: TextResourceContents
): {
  content: ContentBlock[];
  structuredContent: T;
} {
  const content: ContentBlock[] = [createStructuredTextBlock(structured)];
  if (hasEmbeddedResource(embeddedResource)) {
    content.push({ type: 'resource', resource: embeddedResource });
  }
  return {
    content,
    structuredContent: structured,
  };
}
