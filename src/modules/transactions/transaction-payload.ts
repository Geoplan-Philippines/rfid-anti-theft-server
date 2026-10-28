const EPC_PATTERN = /^[0-9A-F]{24}$/;

export const EPC_INVALID_MESSAGE = 'EPC must be 24 hexadecimal characters';

export type TransactionTagInput = {
  epc: string;
  scannedAt: string;
};

export type TransactionPayloadInput = {
  clientTransactionId: string;
  storeCode: string;
  deviceId: string;
  cashierName?: string | null;
  startedAt: string;
  endedAt: string;
  tags: TransactionTagInput[];
};

export type CanonicalTag = {
  epc: string;
  scannedAt: Date;
};

export type CanonicalTransaction = {
  clientTransactionId: string;
  storeCode: string;
  deviceId: string;
  cashierName: string | null;
  startedAt: Date;
  endedAt: Date;
  itemCount: number;
  duplicateEpcsIgnored: number;
  tags: CanonicalTag[];
};

export type StoredTransactionSnapshot = {
  clientTransactionId: string;
  storeCode: string;
  deviceId: string;
  cashierName: string | null;
  startedAt: Date;
  endedAt: Date;
  itemCount: number;
  duplicateEpcsIgnored: number;
  tags: CanonicalTag[];
};

export type CanonicalizeResult =
  | { ok: true; value: CanonicalTransaction }
  | { ok: false; message: string };

export function canonicalizeTransaction(input: TransactionPayloadInput): CanonicalizeResult {
  const tags: CanonicalTag[] = [];
  const seenEpcs = new Set<string>();
  let duplicateEpcsIgnored = 0;

  for (const tag of input.tags) {
    const epc = normalizeEpc(tag.epc);
    if (!EPC_PATTERN.test(epc)) {
      return { ok: false, message: EPC_INVALID_MESSAGE };
    }

    const scannedAt = parseInstant(tag.scannedAt);
    if (!scannedAt) {
      return { ok: false, message: 'scannedAt must be a valid date' };
    }

    if (seenEpcs.has(epc)) {
      duplicateEpcsIgnored += 1;
      continue;
    }

    seenEpcs.add(epc);
    tags.push({ epc, scannedAt });
  }

  const startedAt = parseInstant(input.startedAt);
  const endedAt = parseInstant(input.endedAt);
  if (!startedAt || !endedAt) {
    return { ok: false, message: 'startedAt and endedAt must be valid dates' };
  }

  return {
    ok: true,
    value: {
      clientTransactionId: input.clientTransactionId,
      storeCode: input.storeCode.trim(),
      deviceId: input.deviceId.trim(),
      cashierName: normalizeCashierName(input.cashierName),
      startedAt,
      endedAt,
      itemCount: tags.length,
      duplicateEpcsIgnored,
      tags,
    },
  };
}

export function canonicalFromStored(row: StoredTransactionSnapshot): CanonicalTransaction {
  return {
    clientTransactionId: row.clientTransactionId,
    storeCode: row.storeCode,
    deviceId: row.deviceId,
    cashierName: row.cashierName,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    itemCount: row.itemCount,
    duplicateEpcsIgnored: row.duplicateEpcsIgnored,
    tags: row.tags.map((tag) => ({ epc: tag.epc, scannedAt: tag.scannedAt })),
  };
}

export function canonicalPayloadsMatch(left: CanonicalTransaction, right: CanonicalTransaction): boolean {
  if (left.storeCode !== right.storeCode || left.deviceId !== right.deviceId) {
    return false;
  }

  if (left.cashierName !== right.cashierName) {
    return false;
  }

  if (left.startedAt.getTime() !== right.startedAt.getTime() || left.endedAt.getTime() !== right.endedAt.getTime()) {
    return false;
  }

  if (left.tags.length !== right.tags.length) {
    return false;
  }

  const scannedAtByEpc = new Map(left.tags.map((tag) => [tag.epc, tag.scannedAt.getTime()]));
  return right.tags.every((tag) => scannedAtByEpc.get(tag.epc) === tag.scannedAt.getTime());
}

function normalizeEpc(epc: string): string {
  return epc.trim().replace(/\s/g, '').toUpperCase();
}

function normalizeCashierName(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseInstant(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
