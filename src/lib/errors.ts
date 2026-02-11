import { inspect } from 'node:util';

const INSPECT_OPTIONS = {
  depth: 3,
  breakLength: 120,
} as const;

export interface ErrorResponse {
  content: { type: 'text'; text: string }[];
  structuredContent: { ok: false; error: { code: string; message: string } };
  isError: true;
}

function stringifyUnknown(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized === 'string') {
      return serialized;
    }
  } catch {
    // Fall through to inspect-based serialization.
  }
  return inspect(value, INSPECT_OPTIONS);
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error === null || error === undefined) {
    return 'Unknown error';
  }
  if (typeof error === 'object') {
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === 'string') {
      return maybeError.message;
    }
  }
  return stringifyUnknown(error);
}

export function createErrorResponse(
  code: string,
  message: string
): ErrorResponse {
  const structured = { ok: false as const, error: { code, message } };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true as const,
  };
}
