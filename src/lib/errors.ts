export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error === null || error === undefined) {
    return 'Unknown error';
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error (serialization failed)';
  }
}

export function createErrorResponse(
  code: string,
  message: string
): {
  content: { type: 'text'; text: string }[];
  structuredContent: { ok: false; error: { code: string; message: string } };
  isError: true;
} {
  const structured = { ok: false as const, error: { code, message } };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true as const,
  };
}
