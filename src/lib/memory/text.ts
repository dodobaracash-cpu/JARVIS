/** Canonical form used for entity-name matching, so "Track Zoom" == "track zoom". */
export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|my|our)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenSet(value: string): Set<string> {
  return new Set(normalizeKey(value).split(' ').filter(Boolean));
}

/** Lexical overlap in [0,1]. Cheap, deterministic, no model call. */
export function jaccard(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}
