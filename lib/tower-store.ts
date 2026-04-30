import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import {
  normalizeSnapshot,
  normalizeTribe,
  resolveSnapshot,
  type TowerEventType,
  type TowerRecord,
  type TowerSnapshot,
} from "@/lib/tower-core";

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIRECTORY, "towers.json");
const GITHUB_SYNC_REPO = process.env.GITHUB_SYNC_REPO?.trim() || "";
const GITHUB_SYNC_BRANCH = process.env.GITHUB_SYNC_BRANCH?.trim() || "main";
const GITHUB_SYNC_PATH = process.env.GITHUB_SYNC_PATH?.trim() || "data/towers.json";
const GITHUB_SYNC_TOKEN = process.env.GITHUB_SYNC_TOKEN?.trim() || "";
const GITHUB_SYNC_CACHE_TTL_MS = 15_000;

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

type GithubContentsResponse = {
  content: string;
  encoding: string;
  sha: string;
};

type GithubCache = {
  fetchedAtMs: number;
  sha: null | string;
  snapshot: TowerSnapshot;
};

let githubCache: GithubCache | null = null;
let writeQueue = Promise.resolve();

function isGithubSyncEnabled() {
  return !!(GITHUB_SYNC_REPO && GITHUB_SYNC_TOKEN);
}

function getGithubContentsUrl() {
  const repoPath = GITHUB_SYNC_REPO.split("/").map(encodeURIComponent).join("/");
  const filePath = GITHUB_SYNC_PATH.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`https://api.github.com/repos/${repoPath}/contents/${filePath}`);
  url.searchParams.set("ref", GITHUB_SYNC_BRANCH);
  return url.toString();
}

function getGithubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${GITHUB_SYNC_TOKEN}`,
    "User-Agent": "buff-towers-app",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function writeSnapshotToDisk(snapshot: TowerSnapshot) {
  const payload = JSON.stringify(normalizeSnapshot(snapshot), null, 2);
  const tempFile = `${DATA_FILE}.tmp`;

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

async function fetchGithubSnapshot(forceRefresh = false) {
  if (!isGithubSyncEnabled()) {
    return null;
  }

  if (
    !forceRefresh &&
    githubCache &&
    Date.now() - githubCache.fetchedAtMs < GITHUB_SYNC_CACHE_TTL_MS
  ) {
    return githubCache;
  }

  const response = await fetch(getGithubContentsUrl(), {
    headers: getGithubHeaders(),
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub sync read failed (${response.status}).`);
  }

  const payload = (await response.json()) as GithubContentsResponse;

  if (payload.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content encoding: ${payload.encoding}.`);
  }

  const content = Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
  const snapshot = normalizeSnapshot(JSON.parse(content) as TowerSnapshot);

  githubCache = {
    fetchedAtMs: Date.now(),
    sha: payload.sha,
    snapshot,
  };

  return githubCache;
}

async function pushSnapshotToGithub(snapshot: TowerSnapshot) {
  if (!isGithubSyncEnabled()) {
    return;
  }

  const normalizedSnapshot = normalizeSnapshot(snapshot);
  let sha = githubCache?.sha ?? null;

  if (!sha) {
    const current = await fetchGithubSnapshot(true);
    sha = current?.sha ?? null;
  }

  const response = await fetch(getGithubContentsUrl(), {
    method: "PUT",
    headers: getGithubHeaders(),
    body: JSON.stringify({
      message: `Update tower data ${normalizedSnapshot.updatedAt}`,
      content: Buffer.from(JSON.stringify(normalizedSnapshot, null, 2), "utf8").toString("base64"),
      sha: sha ?? undefined,
      branch: GITHUB_SYNC_BRANCH,
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`GitHub sync write failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as {
    content?: {
      sha?: string;
    };
  };

  githubCache = {
    fetchedAtMs: Date.now(),
    sha: payload.content?.sha ?? sha,
    snapshot: normalizedSnapshot,
  };
}

async function persistSnapshot(snapshot: TowerSnapshot) {
  await writeSnapshotToDisk(snapshot);
  await pushSnapshotToGithub(snapshot);
}

async function loadSourceSnapshot(options?: { forceRemoteRefresh?: boolean }) {
  if (isGithubSyncEnabled()) {
    const githubState = await fetchGithubSnapshot(options?.forceRemoteRefresh ?? false);

    if (githubState) {
      await ensureLocalDataFile();
      await writeSnapshotToDisk(githubState.snapshot);
      return githubState.snapshot;
    }
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
    const snapshot = await loadSourceSnapshot({ forceRemoteRefresh: isGithubSyncEnabled() });
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
) {
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
