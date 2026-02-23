import type {
  ContentBlock,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

import type { IconMeta } from './types.js';

export function withIconMeta(
  iconMeta?: IconMeta
): { icons: IconMeta[] } | undefined {
  return iconMeta ? { icons: [iconMeta] } : undefined;
}

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
  const content: ContentBlock[] =
    embeddedResource === undefined
      ? [createStructuredTextBlock(structured)]
      : [
          createStructuredTextBlock(structured),
          { type: 'resource', resource: embeddedResource },
        ];

  return {
    content,
    structuredContent: structured,
  };
}
