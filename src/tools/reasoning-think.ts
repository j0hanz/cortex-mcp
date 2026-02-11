import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { reason } from '../engine/index.js';

import { ReasoningThinkInputSchema } from '../schemas/inputs.js';
import { ReasoningThinkResultSchema } from '../schemas/outputs.js';

import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool-response.js';

export function registerReasoningThinkTool(server: McpServer): void {
  server.registerTool(
    'reasoning.think',
    {
      title: 'Reasoning Think',
      description:
        'Perform multi-step reasoning on a query. Supports three depth levels: basic (3-5 thoughts), normal (6-10 thoughts), and high (15-25 thoughts). Optionally continue an existing session by providing sessionId.',
      inputSchema: ReasoningThinkInputSchema,
      outputSchema: ReasoningThinkResultSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
      },
    },
    async (params, extra) => {
      try {
        const { query, level, sessionId } = params;

        // Access progress token from request metadata
        const progressToken = (
          extra as { _meta?: { progressToken?: string | number } }
        )._meta?.progressToken;

        const onProgress =
          progressToken !== undefined
            ? async (progress: number, total: number): Promise<void> => {
                await server.server.notification({
                  method: 'notifications/progress',
                  params: {
                    progressToken,
                    progress,
                    total,
                  },
                });
              }
            : undefined;

        const session = await reason(query, level, {
          ...(sessionId ? { sessionId } : {}),
          abortSignal: extra.signal,
          ...(onProgress ? { onProgress } : {}),
        });

        const structured = {
          ok: true as const,
          result: {
            sessionId: session.id,
            level: session.level,
            thoughts: session.thoughts.map((t) => ({
              index: t.index,
              content: t.content,
              revision: t.revision,
            })),
            totalThoughts: session.thoughts.length,
            tokenBudget: session.tokenBudget,
            tokensUsed: session.tokensUsed,
          },
        };

        return createToolResponse(structured);
      } catch (err) {
        return createErrorResponse('E_REASONING', getErrorMessage(err));
      }
    }
  );
}
