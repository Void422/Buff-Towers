import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import {
  normalizeCaptureMarker,
  normalizeSnapshot,
  normalizeTribe,
  resolveSnapshot,
  type TowerCaptureMarker,
  type TowerEventType,
  type TowerRecord,
  type TowerSnapshot,
} from "@/lib/tower-core";

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIRECTORY, "towers.json");
const REDIS_SNAPSHOT_KEY = process.env.TOWER_STATE_REDIS_KEY?.trim() || "buff-towers:snapshot";

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
      captureMarker: null,
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
      captureMarker: null,
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
      captureMarker: null,
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
      captureMarker: null,
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
      captureMarker: null,
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
      captureMarker: null,
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
      captureMarker: null,
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
      captureMarker: null,
      lastEvent: "seed",
      updatedAt: "2026-04-29T21:53:21.000Z",
    },
  ],
};

let writeQueue = Promise.resolve();

function isRedisEnabled() {
  return !!(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

function getRedis() {
  if (!isRedisEnabled()) {
    return null;
  }

  return Redis.fromEnv();
}

async function writeSnapshotToDisk(snapshot: TowerSnapshot) {
  const payload = JSON.stringify(normalizeSnapshot(snapshot), null, 2);
  const tempFile = `${DATA_FILE}.tmp`;

  await mkdir(DATA_DIRECTORY, { recursive: true });
  await writeFile(tempFile, payload, "utf8");
  await rename(tempFile, DATA_FILE);
}

async function ensureLocalDataFile() {
  await mkdir(DATA_DIRECTORY, { recursive: true });

  try {
    await access(DATA_FILE, fsConstants.F_OK);
  } catch {
    await writeSnapshotToDisk(DEFAULT_SNAPSHOT);
  }
}

async function readSnapshotFromDisk() {
  await ensureLocalDataFile();
  const raw = await readFile(DATA_FILE, "utf8");
  return normalizeSnapshot(JSON.parse(raw) as TowerSnapshot);
}

async function readSnapshotFromRedis() {
  const redis = getRedis();

  if (!redis) {
    return null;
  }

  const snapshot = await redis.get<TowerSnapshot>(REDIS_SNAPSHOT_KEY);

  if (!snapshot) {
    const seedSnapshot = await readSnapshotFromDisk().catch(() => DEFAULT_SNAPSHOT);
    const normalizedSeed = normalizeSnapshot(seedSnapshot);
    await redis.set(REDIS_SNAPSHOT_KEY, normalizedSeed);
    return normalizedSeed;
  }

  return normalizeSnapshot(snapshot);
}

async function writeSnapshotToRedis(snapshot: TowerSnapshot) {
  const redis = getRedis();

  if (!redis) {
    return false;
  }

  await redis.set(REDIS_SNAPSHOT_KEY, normalizeSnapshot(snapshot));
  return true;
}

async function persistSnapshot(snapshot: TowerSnapshot) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);

  if (await writeSnapshotToRedis(normalizedSnapshot)) {
    return;
  }

  await writeSnapshotToDisk(normalizedSnapshot);
}

async function loadSourceSnapshot() {
  const redisSnapshot = await readSnapshotFromRedis();

  if (redisSnapshot) {
    return redisSnapshot;
  }

  return readSnapshotFromDisk();
}

function queueWrite<T>(task: () => Promise<T>) {
  const nextTask = writeQueue.then(task, task);
  writeQueue = nextTask.then(
    () => undefined,
    () => undefined,
  );
  return nextTask;
}

export async function getTowerSnapshot() {
  const snapshot = await loadSourceSnapshot();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const resolved = resolveSnapshot(snapshot, nowSeconds);

  if (resolved.changed) {
    await persistSnapshot(resolved.snapshot);
  }

  return resolved.snapshot;
}

async function saveTowerChange(server: string, applyChange: (tower: TowerRecord, nowSeconds: number) => void) {
  return queueWrite(async () => {
    const snapshot = await loadSourceSnapshot();
    const tower = snapshot.towers.find((entry) => entry.server === server);

    if (!tower) {
      throw new Error(`Unknown server: ${server}`);
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    applyChange(tower, nowSeconds);
    snapshot.updatedAt = new Date(nowSeconds * 1000).toISOString();

    await persistSnapshot(snapshot);

    return normalizeSnapshot(snapshot);
  });
}

export async function setShieldEnd(server: string, shieldEndsAt: number, ownerTribe?: null | string) {
  return saveTowerChange(server, (tower, nowSeconds) => {
    tower.shieldEndsAt = Math.trunc(shieldEndsAt);
    tower.contestingTribe = null;
    tower.captureStartedAt = null;
    tower.captureMarker = null;
    tower.lastEvent = "shield-set";
    tower.updatedAt = new Date(nowSeconds * 1000).toISOString();

    if (ownerTribe !== undefined) {
      tower.ownerTribe = normalizeTribe(ownerTribe);
    }
  });
}

export async function startCapture(
  server: string,
  tribe: string,
  eventType: Extract<TowerEventType, "claim-started" | "tower-stolen">,
  captureEndsAt?: number,
) {
  const normalizedTribe = normalizeTribe(tribe);

  if (!normalizedTribe) {
    throw new Error("A tribe name is required.");
  }

  return saveTowerChange(server, (tower, nowSeconds) => {
    if (nowSeconds < tower.shieldEndsAt) {
      throw new Error("Tower is still shielded.");
    }

    const normalizedCaptureEndsAt =
      typeof captureEndsAt === "number" && Number.isInteger(captureEndsAt) && captureEndsAt > nowSeconds
        ? Math.min(captureEndsAt, nowSeconds + 60 * 60)
        : nowSeconds + 60 * 60;

    tower.contestingTribe = normalizedTribe;
    tower.captureStartedAt = normalizedCaptureEndsAt - 60 * 60;
    tower.captureMarker = null;
    tower.lastEvent = eventType;
    tower.updatedAt = new Date(nowSeconds * 1000).toISOString();
  });
}

export async function setCaptureMarker(server: string, marker: TowerCaptureMarker | null) {
  const normalizedMarker = normalizeCaptureMarker(marker);

  return saveTowerChange(server, (tower, nowSeconds) => {
    if (tower.captureStartedAt === null || tower.captureStartedAt + 60 * 60 <= nowSeconds) {
      throw new Error("Markers can only be set on towers in progress.");
    }

    tower.captureMarker = normalizedMarker;
    tower.updatedAt = new Date(nowSeconds * 1000).toISOString();
  });
}
