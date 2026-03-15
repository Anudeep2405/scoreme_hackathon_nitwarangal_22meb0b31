export function getValueAtPath(
  source: Record<string, unknown>,
  path: string
): unknown {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function setValueAtPath(
  source: Record<string, unknown>,
  path: string,
  value: unknown
) {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) {
    return;
  }

  let current: Record<string, unknown> = source;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextValue = current[segment];

    if (!nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}
