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

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    // Fall through to inspect-based serialization.
  }
  return inspect(value, INSPECT_OPTIONS);
}

function getMessageFromErrorLike(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const maybeError = value as { message?: unknown };
  return typeof maybeError.message === 'string'
    ? maybeError.message
    : undefined;
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
