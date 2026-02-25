import { buildCoreContextPack } from './tool-info.js';

const CATALOG_GUIDE = `<optional_parameters>
- \`observation\`: Facts known at this step. Use with \`hypothesis\` and \`evaluation\` instead of \`thought\`.
- \`hypothesis\`: Proposed idea or next logical leap.
- \`evaluation\`: Critique of the hypothesis.
- \`step_summary\`: 1-sentence conclusion summary. Accumulates in \`summary\` field.
- \`is_conclusion\`: Set true to end session early.
- \`rollback_to_step\`: 0-based thought index to rollback to. Discards subsequent thoughts.
</optional_parameters>

<cross_tool_data_flow>
\`\`\`
reasoning_think -> result.sessionId -> reasoning_think.sessionId
reasoning_think -> result.sessionId -> reasoning://sessions/{sessionId}
reasoning_think -> result.sessionId -> reasoning://sessions/{sessionId}/trace
\`\`\`
</cross_tool_data_flow>
`;

export function buildToolCatalog(): string {
  return `${buildCoreContextPack()}\n\n${CATALOG_GUIDE}`;
}
