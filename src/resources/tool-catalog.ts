import { buildCoreContextPack } from './tool-info.js';

const CATALOG_GUIDE = `<optional_parameters>
- \`observation\`: What facts are known at this step? Use with \`hypothesis\` and \`evaluation\` as an alternative to \`thought\`.
- \`hypothesis\`: What is the proposed idea or next logical leap?
- \`evaluation\`: Critique the hypothesis. Are there flaws?
- \`step_summary\`: A 1-sentence summary of the conclusion reached in this step. Accumulates in the \`summary\` field for contextual guidance.
- \`is_conclusion\`: Set to true to end the session early with a final answer.
- \`rollback_to_step\`: Roll back to a thought index (0-based). All thoughts after this index are discarded.
</optional_parameters>

<cross_tool_data_flow>
\`\`\`
reasoning_think -> result.sessionId -> reasoning_think.sessionId
reasoning_think -> result.sessionId -> reasoning://sessions/{sessionId}
reasoning_think -> result.sessionId -> file:///cortex/sessions/{sessionId}/trace.md
\`\`\`
</cross_tool_data_flow>
`;

export function buildToolCatalog(): string {
  return `${buildCoreContextPack()}\n\n${CATALOG_GUIDE}`;
}
