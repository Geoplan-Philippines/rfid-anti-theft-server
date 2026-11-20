/**
 * The key a store code is matched on: trimmed and uppercased.
 * "muji-nuvali " typed at a till and "MUJI-NUVALI" in the registry are the same store.
 */
export function normalizeStoreCode(code: string): string {
  return code.trim().toUpperCase();
}
