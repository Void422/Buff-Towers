import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import {
  normalizeSnapshot,
  normalizeTribe,
  resolveSnapshot,
  type TowerRecord,
  type TowerSnapshot,
  type TowerEventType,
} from "@/lib/tower-core";

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIRECTORY, "towers.json");

const DEFAULT_SNAPSHOT: TowerSnapshot = {
  updatedAt: "2026-04-29T23:46:11.000Z",
  towers: [
    {
      server: "1-7",
      color: "yellow",
      shieldEndsAt: 1777676937,
      ownerTribe: "[ARK] Vengeanceover",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T23:46:11.000Z",
    },
    {
      server: "1-8",
      color: "yellow",
      shieldEndsAt: 1777563965,
      ownerTribe: "[APEXx] SR71 Onyx GOAT",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:51:39.000Z",
    },
    {
      server: "1-9",
      color: "yellow",
      shieldEndsAt: 1777659187,
      ownerTribe: "[APEX] SR71 | Onyx | GOAT",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:51:55.000Z",
    },
    {
      server: "1-12",
      color: "green",
      shieldEndsAt: 1777667726,
      ownerTribe: "[ARK] Vengeanceover",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:52:21.000Z",
    },
    {
      server: "1-14",
      color: "green",
      shieldEndsAt: 1777650524,
      ownerTribe: "[ARIZE] maipu",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:52:34.000Z",
    },
    {
      server: "1-17",
      color: "blue",
      shieldEndsAt: 1777563746,
      ownerTribe: "[ARK] Vengeanceover",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:52:49.000Z",
    },
    {
      server: "1-18",
      color: "blue",
      shieldEndsAt: 1777559887,
      ownerTribe: "[APEX] SR71 | Onyx | GOAT",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:53:04.000Z",
    },
    {
      server: "1-19",
      color: "blue",
      shieldEndsAt: 1777504941,
      ownerTribe: "[RISK] Aventurine",
      contestingTribe: null,
      captureStartedAt: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:53:21.000Z",
    },
  ],
};

async function writeSnapshot(snapshot: TowerSnapshot) {
  const payload = JSON.stringify(normalizeSnapshot(snapshot), null, 2);
  const tempFile = `${DATA_FILE}.tmp`;

  await writeFile(tempFile, payload, "utf8");
  await rename(tempFile, DATA_FILE);
}

async function ensureDataFile() {
  await mkdir(DATA_DIRECTORY, { recursive: true });

  try {
    await access(DATA_FILE, fsConstants.F_OK);
  } catch {
    await writeSnapshot(DEFAULT_SNAPSHOT);
  }
}

export async function getTowerSnapshot() {
  await ensureDataFile();

  const raw = await readFile(DATA_FILE, "utf8");
  const snapshot = normalizeSnapshot(JSON.parse(raw) as TowerSnapshot);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const resolved = resolveSnapshot(snapshot, nowSeconds);

  if (resolved.changed) {
    await writeSnapshot(resolved.snapshot);
  }

  return resolved.snapshot;
}

async function saveTowerChange(server: string, applyChange: (tower: TowerRecord, nowSeconds: number) => void) {
  const snapshot = await getTowerSnapshot();
  const tower = snapshot.towers.find((entry) => entry.server === server);

  if (!tower) {
    throw new Error(`Unknown server: ${server}`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  applyChange(tower, nowSeconds);
  snapshot.updatedAt = new Date(nowSeconds * 1000).toISOString();

  await writeSnapshot(snapshot);

  return normalizeSnapshot(snapshot);
}

export async function setShieldEnd(server: string, shieldEndsAt: number, ownerTribe?: null | string) {
  return saveTowerChange(server, (tower, nowSeconds) => {
    tower.shieldEndsAt = Math.trunc(shieldEndsAt);
    tower.contestingTribe = null;
    tower.captureStartedAt = null;
    tower.lastEvent = "shield-set";
    tower.updatedAt = new Date(nowSeconds * 1000).toISOString();

    if (ownerTribe !== undefined) {
      tower.ownerTribe = normalizeTribe(ownerTribe);
    }
  });
}

export async function startCapture(server: string, tribe: string, eventType: Extract<TowerEventType, "claim-started" | "tower-stolen">) {
  const normalizedTribe = normalizeTribe(tribe);

  if (!normalizedTribe) {
    throw new Error("A tribe name is required.");
  }

  return saveTowerChange(server, (tower, nowSeconds) => {
    if (nowSeconds < tower.shieldEndsAt) {
      throw new Error("Tower is still shielded.");
    }

    tower.contestingTribe = normalizedTribe;
    tower.captureStartedAt = nowSeconds;
    tower.lastEvent = eventType;
    tower.updatedAt = new Date(nowSeconds * 1000).toISOString();
  });
}
