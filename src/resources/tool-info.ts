import { getToolContracts } from '../lib/mcp.js';

export const SERVER_ROLE =
  'Reasoning assistant. Decompose queries into structured thought chains at four depth levels: basic (1-3), normal (4-8), high (10-15), expert (20-25).';

interface ToolEntry {
  name: string;
  model: string;
  timeout: string;
  maxOutputTokens: string;
  taskSupport: 'forbidden' | 'optional' | 'required';
  purpose: string;
}

function toEntry(
  contract: ReturnType<typeof getToolContracts>[number]
): ToolEntry {
  return {
    name: contract.name,
    model: contract.model,
    timeout:
      contract.timeoutMs > 0
        ? `${Math.round(contract.timeoutMs / 1_000)}s`
        : 'N/A',
    maxOutputTokens:
      contract.maxOutputTokens > 0 ? String(contract.maxOutputTokens) : 'N/A',
    taskSupport: contract.taskSupport,
    purpose: contract.purpose,
  };
}

const ENTRIES = Object.fromEntries(
  getToolContracts().map((contract) => [contract.name, toEntry(contract)])
) as Record<string, ToolEntry>;

export function buildCoreContextPack(): string {
  const names = Object.keys(ENTRIES).sort((a, b) => a.localeCompare(b));
  const rows = names.flatMap((name) => {
    const entry = ENTRIES[name];
    if (!entry) {
      return [];
    }
    return `| \`${entry.name}\` | ${entry.model} | ${entry.timeout} | ${entry.maxOutputTokens} | ${entry.taskSupport} | ${entry.purpose} |`;
  });
  return `<core_context_pack>\n| Tool | Model | Timeout | Max Output Tokens | Task Support | Purpose |\n|------|-------|---------|-------------------|--------------|---------|\n${rows.join('\n')}\n</core_context_pack>`;
}

function getSharedConstraints(): string[] {
  return [
    'In-memory sessions. Process restart clears all data.',
    'Session TTL: 30 min from last update. Expired sessions are unrecoverable.',
    'Max query length: 10,000 chars.',
    'Token budget: approximate (char-count proxy, not tokenizer).',
    'Transport: stdio only.',
    'Each thought stores verbatim `thought` parameter content.',
    '`targetThoughts`: integer within the level min/max range.',
    'Configurable via CORTEX_SESSION_TTL_MS, CORTEX_MAX_SESSIONS, CORTEX_MAX_TOTAL_TOKENS.',
  ];
}

export function formatSharedConstraints(): string {
  return getSharedConstraints()
    .map((c) => `- ${c}`)
    .join('\n');
}

export function buildToolReference(): string {
  return [...getToolContracts()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (c) =>
        `### \`${c.name}\`\n- Purpose: ${c.purpose}\n- Output: \`${c.outputShape}\``
    )
    .join('\n\n');
}

export function getToolNames(): readonly string[] {
  return Object.keys(ENTRIES);
}

export function getToolInfo(toolName: string): string | undefined {
  const entry = ENTRIES[toolName];
  if (!entry) {
    return undefined;
  }
  const contract = getToolContracts().find((c) => c.name === toolName);
  if (!contract) {
    return undefined;
  }
  const params = contract.params
    .map((p) => {
      const req = p.required ? 'required' : 'optional';
      return `  - \`${p.name}\` (${p.type}, ${req}): ${p.constraints}`;
    })
    .join('\n');
  return [
    `### \`${entry.name}\``,
    `- **Purpose:** ${entry.purpose}`,
    `- **Model:** ${entry.model}`,
    `- **Timeout:** ${entry.timeout}`,
    `- **Max output tokens:** ${entry.maxOutputTokens}`,
    `- **Task support:** \`${entry.taskSupport}\``,
    '- **Parameters:**',
    params,
    `- **Output:** \`${contract.outputShape}\``,
  ].join('\n');
}
