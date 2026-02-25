import { getToolContracts } from '../lib/tool-contracts.js';

interface ToolEntry {
  name: string;
  model: string;
  timeout: string;
  maxOutputTokens: string;
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
    purpose: contract.purpose,
  };
}

const ENTRIES = Object.fromEntries(
  getToolContracts().map((contract) => [contract.name, toEntry(contract)])
) as Record<string, ToolEntry>;

export function buildCoreContextPack(): string {
  const names = Object.keys(ENTRIES).sort((a, b) => a.localeCompare(b));
  const rows = names.map((name) => {
    const e = ENTRIES[name];
    return e
      ? `| \`${e.name}\` | ${e.model} | ${e.timeout} | ${e.maxOutputTokens} | ${e.purpose} |`
      : '';
  });
  return `<core_context_pack>\n| Tool | Model | Timeout | Max Output Tokens | Purpose |\n|------|-------|---------|-------------------|---------|\n${rows.join('\n')}\n</core_context_pack>`;
}

export function getSharedConstraints(): string[] {
  return [
    'Sessions are in-memory — all data is lost on process restart.',
    'Session TTL: 30 minutes from last update. Expired sessions cannot be recovered.',
    'Maximum query length: 10,000 characters.',
    'Token budget enforcement is approximate (character-based proxy, not true tokenization).',
    'stdio transport only — no HTTP endpoint available.',
    'Every thought in the trace contains LLM-authored reasoning content provided via the `thought` parameter.',
    "targetThoughts must be an integer within the level's min/max range.",
    'Session store limits are configurable via CORTEX_SESSION_TTL_MS, CORTEX_MAX_SESSIONS, and CORTEX_MAX_TOTAL_TOKENS.',
  ];
}
