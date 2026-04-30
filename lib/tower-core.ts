export const SHIELD_DURATION_SECONDS = 48 * 60 * 60;
export const CAPTURE_DURATION_SECONDS = 60 * 60;

export type TowerColor = "yellow" | "green" | "blue";

export type TowerPhase = "shielded" | "open" | "capturing";

export type TowerEventType =
  | "seed"
  | "shield-set"
  | "claim-started"
  | "tower-stolen"
  | "capture-complete";

export type TowerRecord = {
  server: string;
  color: TowerColor;
  shieldEndsAt: number;
  ownerTribe: string | null;
  contestingTribe: string | null;
  captureStartedAt: number | null;
  lastEvent: TowerEventType;
  updatedAt: string;
};

export type TowerSnapshot = {
  updatedAt: string;
  towers: TowerRecord[];
};

export function normalizeTribe(value: null | string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.toUpperCase() : null;
}

export function parseServerOrder(server: string) {
  return Number(server.split("-")[1] || "0");
}

export function sortTowers(towers: TowerRecord[]) {
  return [...towers].sort((left, right) => parseServerOrder(left.server) - parseServerOrder(right.server));
}

export function normalizeTower(tower: TowerRecord): TowerRecord {
  const legacyTower = tower as TowerRecord & { nextPopAt?: number };
  const shieldEndsAt = tower.shieldEndsAt ?? legacyTower.nextPopAt ?? 0;

  return {
    server: tower.server,
    color: tower.color,
    shieldEndsAt: Math.trunc(shieldEndsAt),
    ownerTribe: normalizeTribe(tower.ownerTribe),
    contestingTribe: normalizeTribe(tower.contestingTribe),
    captureStartedAt:
      tower.captureStartedAt === null || tower.captureStartedAt === undefined
        ? null
        : Math.trunc(tower.captureStartedAt),
    lastEvent: tower.lastEvent ?? "seed",
    updatedAt: new Date(tower.updatedAt).toISOString(),
  };
}

export function normalizeSnapshot(snapshot: TowerSnapshot): TowerSnapshot {
  return {
    updatedAt: new Date(snapshot.updatedAt).toISOString(),
    towers: sortTowers(snapshot.towers.map(normalizeTower)),
  };
}

export function resolveTowerState(
  tower: TowerRecord,
  nowSeconds: number,
): {
  changed: boolean;
  tower: TowerRecord;
} {
  const normalized = normalizeTower(tower);
  const captureStartedAt = normalized.captureStartedAt;

  if (captureStartedAt === null) {
    return {
      changed: false,
      tower: normalized,
    };
  }

  const captureEndsAt = captureStartedAt + CAPTURE_DURATION_SECONDS;

  if (captureEndsAt > nowSeconds) {
    return {
      changed: false,
      tower: normalized,
    };
  }

  return {
    changed: true,
    tower: {
      ...normalized,
      shieldEndsAt: captureEndsAt + SHIELD_DURATION_SECONDS,
      ownerTribe: normalizeTribe(normalized.contestingTribe) ?? normalized.ownerTribe,
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "capture-complete",
      updatedAt: new Date(nowSeconds * 1000).toISOString(),
    },
  };
}

export function resolveSnapshot(
  snapshot: TowerSnapshot,
  nowSeconds: number,
): {
  changed: boolean;
  snapshot: TowerSnapshot;
} {
  let changed = false;

  const towers = snapshot.towers.map((tower) => {
    const resolved = resolveTowerState(tower, nowSeconds);

    if (resolved.changed) {
      changed = true;
    }

    return resolved.tower;
  });

  return {
    changed,
    snapshot: normalizeSnapshot({
      updatedAt: changed ? new Date(nowSeconds * 1000).toISOString() : snapshot.updatedAt,
      towers,
    }),
  };
}

export function getTowerPhase(tower: TowerRecord, nowSeconds: number): TowerPhase {
  if (nowSeconds < tower.shieldEndsAt) {
    return "shielded";
  }

  if (tower.captureStartedAt !== null && tower.captureStartedAt + CAPTURE_DURATION_SECONDS > nowSeconds) {
    return "capturing";
  }

  return "open";
}
