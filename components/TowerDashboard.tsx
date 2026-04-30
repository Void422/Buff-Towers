"use client";

import Image from "next/image";
import { startTransition, useEffect, useState, type CSSProperties } from "react";
import {
  CAPTURE_DURATION_SECONDS,
  SHIELD_DURATION_SECONDS,
  getTowerPhase,
  parseServerOrder,
  resolveTowerState,
  type TowerColor,
  type TowerPhase,
  type TowerRecord,
  type TowerSnapshot,
} from "@/lib/tower-core";
import styles from "./TowerDashboard.module.css";

type ShieldEditorState = {
  server: string;
  shieldUnixValue: string;
  datetimeValue: string;
  ownerTribe: string;
  status: "idle" | "saving" | "error";
  error?: string;
};

type CaptureEditorState = {
  server: string;
  tribe: string;
  mode: "claim" | "stole";
  status: "idle" | "saving" | "error";
  error?: string;
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
} | null;

type ColorMeta = {
  label: string;
  accent: string;
  accentSoft: string;
  image: string;
};

type DisplayTower = TowerRecord & {
  phase: TowerPhase;
  captureEndsAt: number | null;
  timerEndsAt: number | null;
  timerLabel: string;
  statusLabel: string;
  statusDetail: string;
  progress: number;
};

const COLOR_META: Record<TowerColor, ColorMeta> = {
  yellow: {
    label: "Mate buff",
    accent: "#f0bf40",
    accentSoft: "rgba(240, 191, 64, 0.12)",
    image: "/tower-art/yellow-clean.png",
  },
  green: {
    label: "Growth buff",
    accent: "#57c276",
    accentSoft: "rgba(87, 194, 118, 0.12)",
    image: "/tower-art/green-clean.png",
  },
  blue: {
    label: "Incubator buff",
    accent: "#3790ff",
    accentSoft: "rgba(55, 144, 255, 0.12)",
    image: "/tower-art/blue-clean.png",
  },
};

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;

  const parts = [
    days > 0 ? `${days}d` : null,
    days > 0 || hours > 0 ? `${hours}h` : null,
    `${minutes}m`,
    `${seconds.toString().padStart(2, "0")}s`,
  ].filter(Boolean);

  return parts.join(" ");
}

function formatAbsoluteTime(unixSeconds: number | null, mounted: boolean) {
  if (unixSeconds === null) {
    return "Live now";
  }

  const date = new Date(unixSeconds * 1000);

  if (!mounted) {
    return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTimezoneLabel(mounted: boolean) {
  if (!mounted) {
    return "Local";
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
}

function toDatetimeLocalValue(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDisplayTower(tower: TowerRecord, currentSeconds: number): DisplayTower {
  const resolved = resolveTowerState(tower, currentSeconds).tower;
  const phase = getTowerPhase(resolved, currentSeconds);
  const captureEndsAt = resolved.captureStartedAt === null ? null : resolved.captureStartedAt + CAPTURE_DURATION_SECONDS;

  if (phase === "shielded") {
    const remaining = Math.max(0, resolved.shieldEndsAt - currentSeconds);

    return {
      ...resolved,
      phase,
      captureEndsAt: null,
      timerEndsAt: resolved.shieldEndsAt,
      timerLabel: "Shield",
      statusLabel: "Shielded",
      statusDetail: `Pops in ${formatDuration(remaining)}`,
      progress: clamp((SHIELD_DURATION_SECONDS - remaining) / SHIELD_DURATION_SECONDS),
    };
  }

  if (phase === "capturing") {
    const remaining = Math.max(0, (captureEndsAt ?? currentSeconds) - currentSeconds);

    return {
      ...resolved,
      phase,
      captureEndsAt,
      timerEndsAt: captureEndsAt,
      timerLabel: "Claim",
      statusLabel: "Capturing",
      statusDetail: resolved.contestingTribe ?? "1h running",
      progress: clamp((CAPTURE_DURATION_SECONDS - remaining) / CAPTURE_DURATION_SECONDS),
    };
  }

  return {
    ...resolved,
    phase,
    captureEndsAt: null,
    timerEndsAt: null,
    timerLabel: "Live",
    statusLabel: "Live",
    statusDetail: "Open to claim",
    progress: 0,
  };
}

function getCountdownValue(tower: DisplayTower, currentSeconds: number) {
  if (tower.timerEndsAt === null) {
    return "Ready";
  }

  const remaining = tower.timerEndsAt - currentSeconds;

  if (remaining <= 0) {
    return tower.phase === "shielded" ? "Live" : "Done";
  }

  return formatDuration(remaining);
}

function getTowerAbsoluteLabel(tower: DisplayTower, mounted: boolean) {
  return formatAbsoluteTime(tower.timerEndsAt ?? (tower.phase === "shielded" ? tower.shieldEndsAt : null), mounted);
}

function getAttemptingLabel(tower: DisplayTower) {
  return tower.phase === "capturing" ? tower.contestingTribe ?? "[-]" : "[-]";
}

function getProgressWidth(tower: DisplayTower) {
  return `${Math.round(tower.progress * 100)}%`;
}

function getTimelineLabel(tower: DisplayTower, upcomingOrder: number | undefined) {
  if (tower.phase === "capturing") {
    return "Claim in progress";
  }

  if (tower.phase === "open") {
    return "Live now";
  }

  if (upcomingOrder === 1) {
    return "Next buff";
  }

  return `Upcoming ${upcomingOrder}`;
}

function getTimelineNodeText(tower: DisplayTower, upcomingOrder: number | undefined) {
  if (tower.phase === "capturing") {
    return "!";
  }

  if (tower.phase === "open") {
    return "•";
  }

  return `${upcomingOrder ?? ""}`;
}

export function TowerDashboard({ initialSnapshot }: { initialSnapshot: TowerSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [copiedServer, setCopiedServer] = useState<string | null>(null);
  const [shieldEditor, setShieldEditor] = useState<ShieldEditorState | null>(null);
  const [captureEditor, setCaptureEditor] = useState<CaptureEditorState | null>(null);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());

    async function refreshSnapshot() {
      const response = await fetch("/api/towers", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const nextSnapshot = (await response.json()) as TowerSnapshot;
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
    }

    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    const poll = window.setInterval(() => {
      void refreshSnapshot();
    }, 30000);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!notice && !copiedServer) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
      setCopiedServer(null);
    }, 2400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copiedServer, notice]);

  const currentSeconds =
    nowMs === null ? Math.floor(new Date(snapshot.updatedAt).getTime() / 1000) : Math.floor(nowMs / 1000);
  const towers = snapshot.towers.map((tower) => getDisplayTower(tower, currentSeconds));
  const liveTowers = towers
    .filter((tower) => tower.phase !== "shielded")
    .sort((left, right) => {
      const leftRank = left.phase === "capturing" ? 0 : 1;
      const rightRank = right.phase === "capturing" ? 0 : 1;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftEndsAt = left.captureEndsAt ?? 0;
      const rightEndsAt = right.captureEndsAt ?? 0;

      return leftEndsAt - rightEndsAt || parseServerOrder(left.server) - parseServerOrder(right.server);
    });
  const upcomingTowers = towers
    .filter((tower) => tower.phase === "shielded")
    .sort((left, right) => left.shieldEndsAt - right.shieldEndsAt);
  const timelineTowers = [...liveTowers, ...upcomingTowers];
  const upcomingOrder = new Map(upcomingTowers.map((tower, index) => [tower.server, index + 1]));
  const nextTower = upcomingTowers[0] ?? liveTowers[0] ?? towers[0];
  const lastUpdated = Math.floor(new Date(snapshot.updatedAt).getTime() / 1000);

  async function copyDiscordTimestamp(server: string, shieldEndsAt: number) {
    await navigator.clipboard.writeText(`<t:${shieldEndsAt}:F>`);
    setCopiedServer(server);
  }

  function openShieldEditor(tower: DisplayTower) {
    setShieldEditor({
      server: tower.server,
      shieldUnixValue: `${tower.shieldEndsAt}`,
      datetimeValue: toDatetimeLocalValue(tower.shieldEndsAt),
      ownerTribe: tower.ownerTribe ?? "",
      status: "idle",
    });
  }

  function openCaptureEditor(tower: DisplayTower, mode: "claim" | "stole") {
    setCaptureEditor({
      server: tower.server,
      tribe: mode === "stole" ? "" : tower.contestingTribe ?? "",
      mode,
      status: "idle",
    });
  }

  function shiftShieldEditor(seconds: number) {
    setShieldEditor((current) => {
      if (!current) {
        return current;
      }

      const shieldEndsAt = Math.max(1, Number(current.shieldUnixValue || "0") + seconds);

      return {
        ...current,
        shieldUnixValue: `${shieldEndsAt}`,
        datetimeValue: toDatetimeLocalValue(shieldEndsAt),
        status: "idle",
        error: undefined,
      };
    });
  }

  function updateShieldFromDatetime(value: string) {
    setShieldEditor((current) => {
      if (!current) {
        return current;
      }

      const date = new Date(value);
      const shieldUnixValue = Number.isNaN(date.getTime())
        ? current.shieldUnixValue
        : `${Math.floor(date.getTime() / 1000)}`;

      return {
        ...current,
        datetimeValue: value,
        shieldUnixValue,
        status: "idle",
        error: undefined,
      };
    });
  }

  function updateShieldFromUnix(value: string) {
    setShieldEditor((current) => {
      if (!current) {
        return current;
      }

      const shieldEndsAt = Number(value);

      return {
        ...current,
        shieldUnixValue: value,
        datetimeValue:
          Number.isInteger(shieldEndsAt) && shieldEndsAt > 0
            ? toDatetimeLocalValue(shieldEndsAt)
            : current.datetimeValue,
        status: "idle",
        error: undefined,
      };
    });
  }

  async function saveShield() {
    if (!shieldEditor) {
      return;
    }

    const shieldEndsAt = Number(shieldEditor.shieldUnixValue);

    if (!Number.isInteger(shieldEndsAt) || shieldEndsAt < 1) {
      setShieldEditor({
        ...shieldEditor,
        status: "error",
        error: "Shield end timestamp is invalid.",
      });
      return;
    }

    setShieldEditor({
      ...shieldEditor,
      status: "saving",
      error: undefined,
    });

    try {
      const response = await fetch("/api/towers", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-shield-end",
          server: shieldEditor.server,
          shieldEndsAt,
          ownerTribe: shieldEditor.ownerTribe,
        }),
      });

      const nextSnapshot = (await response.json()) as TowerSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(nextSnapshot.error || "Could not update shield time.");
      }

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });

      setShieldEditor(null);
      setNotice({
        tone: "success",
        message: `${shieldEditor.server} updated.`,
      });
    } catch (error) {
      setShieldEditor((current) =>
        current
          ? {
              ...current,
              status: "error",
              error: error instanceof Error ? error.message : "Could not update shield time.",
            }
          : current,
      );
    }
  }

  async function saveCapture() {
    if (!captureEditor) {
      return;
    }

    if (!captureEditor.tribe.trim()) {
      setCaptureEditor({
        ...captureEditor,
        status: "error",
        error: "Tribe name is required.",
      });
      return;
    }

    setCaptureEditor({
      ...captureEditor,
      status: "saving",
      error: undefined,
    });

    try {
      const response = await fetch("/api/towers", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start-capture",
          server: captureEditor.server,
          tribe: captureEditor.tribe,
          mode: captureEditor.mode,
        }),
      });

      const nextSnapshot = (await response.json()) as TowerSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(nextSnapshot.error || "Could not start that capture.");
      }

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });

      setCaptureEditor(null);
      setNotice({
        tone: "success",
        message:
          captureEditor.mode === "stole"
            ? `${captureEditor.server} stolen by ${captureEditor.tribe}.`
            : `${captureEditor.server} claim started for ${captureEditor.tribe}.`,
      });
    } catch (error) {
      setCaptureEditor((current) =>
        current
          ? {
              ...current,
              status: "error",
              error: error instanceof Error ? error.message : "Could not start that capture.",
            }
          : current,
      );
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.topBarTitle}>Buff Towers</div>
        <div className={styles.topBarMeta}>{getTimezoneLabel(mounted)}</div>
      </header>

      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Upcoming Buffs</h1>

        <div className={styles.summaryRow}>
          <div className={styles.summaryCard}>
            <span>Next tower</span>
            <strong>{nextTower.server}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>Starts in</span>
            <strong>{getCountdownValue(nextTower, currentSeconds)}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>Live now</span>
            <strong>{liveTowers.length}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>Last sync</span>
            <strong>{formatAbsoluteTime(lastUpdated, mounted)}</strong>
          </div>
        </div>
      </section>

      {notice ? (
        <div className={`${styles.notice} ${notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}`}>
          {notice.message}
        </div>
      ) : null}

      <section className={styles.timeline}>
        {timelineTowers.map((tower) => {
          const meta = COLOR_META[tower.color];
          const order = upcomingOrder.get(tower.server);

          return (
            <article key={tower.server} className={styles.timelineItem}>
              <div className={styles.nodeColumn}>
                <div
                  className={`${styles.node} ${tower.phase === "capturing" ? styles.nodeHot : tower.phase === "open" ? styles.nodeLive : styles.nodeFuture}`}
                >
                  {getTimelineNodeText(tower, order)}
                </div>
              </div>

              <div
                className={styles.eventCard}
                style={
                  {
                    "--accent": meta.accent,
                    "--accent-soft": meta.accentSoft,
                  } as CSSProperties
                }
              >
                <div className={styles.eventTop}>
                  <div className={styles.eventText}>
                    <span className={styles.eventLabel}>{getTimelineLabel(tower, order)}</span>
                    <h2 className={styles.eventTitle}>
                      {tower.server} · {meta.label}
                    </h2>
                    <p className={styles.eventTime}>{getTowerAbsoluteLabel(tower, mounted)}</p>
                  </div>

                  <div className={styles.eventArtBox}>
                    <Image
                      src={meta.image}
                      alt={`${meta.label} tower`}
                      width={84}
                      height={112}
                      className={styles.eventArt}
                    />
                  </div>
                </div>

                <div className={styles.eventStats}>
                  <div className={styles.statBlock}>
                    <span>Owner</span>
                    <strong>{tower.ownerTribe ?? "[-]"}</strong>
                  </div>
                  <div className={styles.statBlock}>
                    <span>Trying</span>
                    <strong>{getAttemptingLabel(tower)}</strong>
                  </div>
                  <div className={styles.statBlock}>
                    <span>{tower.timerLabel}</span>
                    <strong>{getCountdownValue(tower, currentSeconds)}</strong>
                  </div>
                </div>

                {tower.phase !== "open" ? (
                  <div className={styles.progressTrack} aria-hidden="true">
                    <span className={styles.progressFill} style={{ width: getProgressWidth(tower) }} />
                  </div>
                ) : null}

                <div className={styles.actions}>
                  {tower.phase === "capturing" ? (
                    <button className={styles.primaryButton} onClick={() => openCaptureEditor(tower, "stole")}>
                      Stole tower
                    </button>
                  ) : tower.phase === "open" ? (
                    <button className={styles.primaryButton} onClick={() => openCaptureEditor(tower, "claim")}>
                      Start claim
                    </button>
                  ) : (
                    <button className={styles.secondaryButton} onClick={() => openShieldEditor(tower)}>
                      Edit shield
                    </button>
                  )}

                  {tower.phase !== "shielded" ? (
                    <button className={styles.secondaryButton} onClick={() => openShieldEditor(tower)}>
                      Edit shield
                    </button>
                  ) : null}

                  <button className={styles.ghostButton} onClick={() => void copyDiscordTimestamp(tower.server, tower.shieldEndsAt)}>
                    {copiedServer === tower.server ? "Copied" : "Copy ts"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {shieldEditor ? (
        <div className={styles.modalBackdrop} onClick={() => setShieldEditor(null)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalLabel}>Edit shield</span>
                <h2>{shieldEditor.server}</h2>
              </div>
              <button className={styles.closeButton} onClick={() => setShieldEditor(null)} aria-label="Close shield editor">
                ×
              </button>
            </div>

            <label className={styles.field}>
              <span>Owner tribe</span>
              <input
                value={shieldEditor.ownerTribe}
                onChange={(event) =>
                  setShieldEditor((current) =>
                    current
                      ? {
                          ...current,
                          ownerTribe: event.target.value,
                          status: "idle",
                          error: undefined,
                        }
                      : current,
                  )
                }
              />
            </label>

            <label className={styles.field}>
              <span>Shield pops at</span>
              <input
                type="datetime-local"
                value={shieldEditor.datetimeValue}
                onChange={(event) => updateShieldFromDatetime(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span>Unix timestamp</span>
              <input value={shieldEditor.shieldUnixValue} onChange={(event) => updateShieldFromUnix(event.target.value)} />
            </label>

            <div className={styles.quickActions}>
              <button className={styles.quickButton} onClick={() => shiftShieldEditor(3600)}>
                +1h
              </button>
              <button className={styles.quickButton} onClick={() => shiftShieldEditor(12 * 3600)}>
                +12h
              </button>
              <button className={styles.quickButton} onClick={() => shiftShieldEditor(24 * 3600)}>
                +24h
              </button>
              <button className={styles.quickButton} onClick={() => shiftShieldEditor(48 * 3600)}>
                +48h
              </button>
            </div>

            {shieldEditor.error ? <p className={styles.errorText}>{shieldEditor.error}</p> : null}

            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={() => setShieldEditor(null)}>
                Cancel
              </button>
              <button className={styles.primaryButton} onClick={() => void saveShield()} disabled={shieldEditor.status === "saving"}>
                {shieldEditor.status === "saving" ? "Saving..." : "Save shield"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {captureEditor ? (
        <div className={styles.modalBackdrop} onClick={() => setCaptureEditor(null)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalLabel}>{captureEditor.mode === "stole" ? "Stole tower" : "Start claim"}</span>
                <h2>{captureEditor.server}</h2>
              </div>
              <button className={styles.closeButton} onClick={() => setCaptureEditor(null)} aria-label="Close capture editor">
                ×
              </button>
            </div>

            <label className={styles.field}>
              <span>Tribe</span>
              <input
                value={captureEditor.tribe}
                onChange={(event) =>
                  setCaptureEditor((current) =>
                    current
                      ? {
                          ...current,
                          tribe: event.target.value,
                          status: "idle",
                          error: undefined,
                        }
                      : current,
                  )
                }
              />
            </label>

            {captureEditor.error ? <p className={styles.errorText}>{captureEditor.error}</p> : null}

            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={() => setCaptureEditor(null)}>
                Cancel
              </button>
              <button className={styles.primaryButton} onClick={() => void saveCapture()} disabled={captureEditor.status === "saving"}>
                {captureEditor.status === "saving"
                  ? "Saving..."
                  : captureEditor.mode === "stole"
                    ? "Save steal"
                    : "Start claim"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
