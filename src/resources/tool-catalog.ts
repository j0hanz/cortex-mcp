import { buildCoreContextPack } from './tool-info.js';

const CATALOG_GUIDE = `<optional_parameters>
- \`observation\`: Known facts at this step. Use with \`hypothesis\` + \`evaluation\` instead of \`thought\`.
- \`hypothesis\`: Proposed idea or next logical step.
- \`evaluation\`: Critique of the hypothesis.
- \`stepSummary\`: One-sentence step conclusion. Appended to \`summary\`.
- \`isConclusion\`: \`true\` to end session early.
- \`rollbackToStep\`: 0-based index. Discards all later thoughts.
</optional_parameters>

<data_flow>
\`\`\`
reasoning_think -> sessionId -> reasoning_think (continuation)
reasoning_think -> sessionId -> reasoning://sessions/{sessionId}
reasoning_think -> sessionId -> reasoning://sessions/{sessionId}/trace
\`\`\`
</data_flow>
`;

export function buildToolCatalog(): string {
  return `${buildCoreContextPack()}\n\n${CATALOG_GUIDE}`;
}
