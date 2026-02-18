import { inspect } from 'node:util';

const INSPECT_OPTIONS = {
  depth: 3,
  breakLength: 120,
} as const;

interface ErrorResponse {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: { ok: false; error: { code: string; message: string } };
  isError: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    // Fall through to inspect-based serialization.
  }
  return inspect(value, INSPECT_OPTIONS);
}

function getMessageFromErrorLike(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.message === 'string' ? value.message : undefined;
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
  const errorLikeMessage = getMessageFromErrorLike(error);
  if (errorLikeMessage !== undefined) {
    return errorLikeMessage;
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
