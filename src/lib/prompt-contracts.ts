export interface PromptContract {
  name: string;
  title: string;
  description: string;
}

const PROMPT_CONTRACTS: readonly PromptContract[] = [
  {
    name: 'get-help',
    title: 'Get Help',
    description: 'Return the server usage instructions.',
  },
  {
    name: 'reasoning.basic',
    title: 'Reasoning Basic',
    description: 'Prepare a basic-depth reasoning request (3–5 thoughts).',
  },
  {
    name: 'reasoning.normal',
    title: 'Reasoning Normal',
    description: 'Prepare a normal-depth reasoning request (6–10 thoughts).',
  },
  {
    name: 'reasoning.high',
    title: 'Reasoning High',
    description: 'Prepare a high-depth reasoning request (15–25 thoughts).',
  },
  {
    name: 'reasoning.continue',
    title: 'Continue Reasoning',
    description:
      'Continue an existing reasoning session (follow-up query optional).',
  },
  {
    name: 'reasoning.retry',
    title: 'Retry Reasoning',
    description: 'Retry a failed reasoning task with modified parameters.',
  },
];

export function getPromptContracts(): readonly PromptContract[] {
  return PROMPT_CONTRACTS;
}
