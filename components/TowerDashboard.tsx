"use client";

import Image from "next/image";
import { startTransition, useEffect, useState, type CSSProperties } from "react";
import {
  CAPTURE_DURATION_SECONDS,
  SHIELD_DURATION_SECONDS,
  getTowerPhase,
  parseServerOrder,
  resolveTowerState,
  type TowerCaptureMarker,
  type TowerColor,
  type TowerPhase,
  type TowerRecord,
  type TowerSnapshot,
} from "@/lib/tower-core";
import styles from "./TowerDashboard.module.css";

type LanguageCode = "en" | "ja" | "zh-Hant";
type TimerKey = "shield" | "claim" | "live";
type StatusKey = "shielded" | "capturing" | "live";
type ShareMarker = "none" | "going" | "attacked" | "help";

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
  remainingMinutesValue: string;
  status: "idle" | "saving" | "error";
  error?: string;
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
} | null;

type DisplayTower = TowerRecord & {
  phase: TowerPhase;
  captureEndsAt: number | null;
  timerEndsAt: number | null;
  timerKey: TimerKey;
  statusKey: StatusKey;
  progress: number;
};

type Translation = {
  locale: string;
  nativeName: string;
  appTitle: string;
  language: string;
  timezone: string;
  heroTitle: string;
  nextTower: string;
  startsIn: string;
  liveNow: string;
  lastSync: string;
  nextBuff: string;
  claimInProgress: string;
  upcoming: (value: number) => string;
  owner: string;
  trying: string;
  tribe: string;
  ownerTribe: string;
  addKnownTribe: (tribe: string) => string;
  knownTribeSaved: (tribe: string) => string;
  shieldPopsAt: string;
  unixTimestamp: string;
  shield: string;
  claim: string;
  live: string;
  shielded: string;
  capturing: string;
  openToClaim: string;
  oneHourRunning: string;
  ready: string;
  done: string;
  popsIn: (value: string) => string;
  editShield: string;
  startClaim: string;
  stoleTower: string;
  copyTs: string;
  copyLink: string;
  copied: string;
  occupationTimeLeft: string;
  shareViewTitle: string;
  sharedTower: string;
  backToAllTowers: string;
  copyShareLink: string;
  note: string;
  marker: string;
  markerOptions: Record<ShareMarker, string>;
  captureMarkerOptions: Record<TowerCaptureMarker, string>;
  clearMarker: string;
  markerUpdated: (server: string) => string;
  linkCopied: (server: string) => string;
  saveShield: string;
  saveSteal: string;
  saving: string;
  cancel: string;
  invalidShieldTimestamp: string;
  tribeRequired: string;
  updated: (server: string) => string;
  stolenBy: (server: string, tribe: string) => string;
  claimStartedFor: (server: string, tribe: string) => string;
  closeShieldEditor: string;
  closeCaptureEditor: string;
  shieldEditorTitle: string;
  captureEditorTitle: string;
  stealEditorTitle: string;
  buffLabels: Record<TowerColor, string>;
  durationUnits: {
    day: string;
    hour: string;
    minute: string;
    second: string;
  };
};

type ColorMeta = {
  accent: string;
  accentSoft: string;
  image: string;
};

const TRANSLATIONS: Record<LanguageCode, Translation> = {
  en: {
    locale: "en-US",
    nativeName: "English",
    appTitle: "Buff Towers",
    language: "Language",
    timezone: "Timezone",
    heroTitle: "Upcoming Buffs",
    nextTower: "Next tower",
    startsIn: "Starts in",
    liveNow: "Live now",
    lastSync: "Last sync",
    nextBuff: "Next buff",
    claimInProgress: "Claim in progress",
    upcoming: (value) => `Upcoming ${value}`,
    owner: "Owner",
    trying: "Trying",
    tribe: "Tribe",
    ownerTribe: "Owner tribe",
    addKnownTribe: (tribe) => `Save ${tribe}`,
    knownTribeSaved: (tribe) => `${tribe} saved to known tribes.`,
    shieldPopsAt: "Shield pops at",
    unixTimestamp: "Unix timestamp",
    shield: "Shield",
    claim: "Claim",
    live: "Live",
    shielded: "Shielded",
    capturing: "Capturing",
    openToClaim: "Open to claim",
    oneHourRunning: "1h running",
    ready: "Ready",
    done: "Done",
    popsIn: (value) => `Pops in ${value}`,
    editShield: "Edit shield",
    startClaim: "Start claim",
    stoleTower: "Stole tower",
    copyTs: "Copy ts",
    copyLink: "Copy link",
    copied: "Copied",
    occupationTimeLeft: "Occupation time left",
    shareViewTitle: "Tower ping",
    sharedTower: "Shared tower",
    backToAllTowers: "All towers",
    copyShareLink: "Copy ping link",
    note: "Note",
    marker: "Marker",
    markerOptions: {
      none: "No marker",
      going: "We are going",
      attacked: "Getting attacked",
      help: "Need help",
    },
    captureMarkerOptions: {
      help: "Help",
      attacking: "Attacking",
    },
    clearMarker: "Clear marker",
    markerUpdated: (server) => `${server} marker updated.`,
    linkCopied: (server) => `${server} link copied.`,
    saveShield: "Save shield",
    saveSteal: "Save steal",
    saving: "Saving...",
    cancel: "Cancel",
    invalidShieldTimestamp: "Shield end timestamp is invalid.",
    tribeRequired: "Tribe name is required.",
    updated: (server) => `${server} updated.`,
    stolenBy: (server, tribe) => `${server} stolen by ${tribe}.`,
    claimStartedFor: (server, tribe) => `${server} claim started for ${tribe}.`,
    closeShieldEditor: "Close shield editor",
    closeCaptureEditor: "Close capture editor",
    shieldEditorTitle: "Edit shield",
    captureEditorTitle: "Start claim",
    stealEditorTitle: "Stole tower",
    buffLabels: {
      yellow: "Mate buff",
      green: "Growth buff",
      blue: "Incubator buff",
    },
    durationUnits: {
      day: "d",
      hour: "h",
      minute: "m",
      second: "s",
    },
  },
  ja: {
    locale: "ja-JP",
    nativeName: "日本語",
    appTitle: "バフタワー",
    language: "言語",
    timezone: "タイムゾーン",
    heroTitle: "今後のバフ",
    nextTower: "次のタワー",
    startsIn: "開始まで",
    liveNow: "現在ライブ",
    lastSync: "最終同期",
    nextBuff: "次のバフ",
    claimInProgress: "占領進行中",
    upcoming: (value) => `予定 ${value}`,
    owner: "所有",
    trying: "挑戦中",
    tribe: "部族",
    ownerTribe: "所有部族",
    addKnownTribe: (tribe) => `${tribe} を保存`,
    knownTribeSaved: (tribe) => `${tribe} を候補に保存しました。`,
    shieldPopsAt: "シールド終了",
    unixTimestamp: "Unix タイムスタンプ",
    shield: "シールド",
    claim: "占領",
    live: "ライブ",
    shielded: "シールド中",
    capturing: "占領中",
    openToClaim: "占領可能",
    oneHourRunning: "1時間進行中",
    ready: "開始可能",
    done: "完了",
    popsIn: (value) => `${value}後に出現`,
    editShield: "シールド編集",
    startClaim: "占領開始",
    stoleTower: "奪取した",
    copyTs: "時刻コピー",
    copyLink: "リンクコピー",
    copied: "コピー済み",
    occupationTimeLeft: "占領残り時間",
    shareViewTitle: "タワーピン",
    sharedTower: "共有タワー",
    backToAllTowers: "全タワー",
    copyShareLink: "ピンリンクコピー",
    note: "メモ",
    marker: "マーカー",
    markerOptions: {
      none: "マーカーなし",
      going: "向かいます",
      attacked: "攻撃されています",
      help: "ヘルプ必要",
    },
    captureMarkerOptions: {
      help: "ヘルプ",
      attacking: "攻撃中",
    },
    clearMarker: "マーカー解除",
    markerUpdated: (server) => `${server} のマーカーを更新しました。`,
    linkCopied: (server) => `${server} のリンクをコピーしました。`,
    saveShield: "シールド保存",
    saveSteal: "奪取を保存",
    saving: "保存中...",
    cancel: "キャンセル",
    invalidShieldTimestamp: "シールド終了タイムスタンプが無効です。",
    tribeRequired: "部族名は必須です。",
    updated: (server) => `${server} を更新しました。`,
    stolenBy: (server, tribe) => `${server} は ${tribe} に奪取されました。`,
    claimStartedFor: (server, tribe) => `${server} の占領を ${tribe} で開始しました。`,
    closeShieldEditor: "シールド編集を閉じる",
    closeCaptureEditor: "占領編集を閉じる",
    shieldEditorTitle: "シールド編集",
    captureEditorTitle: "占領開始",
    stealEditorTitle: "奪取した",
    buffLabels: {
      yellow: "交配バフ",
      green: "成長バフ",
      blue: "孵化バフ",
    },
    durationUnits: {
      day: "日",
      hour: "時間",
      minute: "分",
      second: "秒",
    },
  },
  "zh-Hant": {
    locale: "zh-Hant-TW",
    nativeName: "繁體中文",
    appTitle: "增益塔",
    language: "語言",
    timezone: "時區",
    heroTitle: "即將到來的增益",
    nextTower: "下一座塔",
    startsIn: "開始倒數",
    liveNow: "目前可打",
    lastSync: "最後同步",
    nextBuff: "下一個增益",
    claimInProgress: "佔領進行中",
    upcoming: (value) => `即將到來 ${value}`,
    owner: "持有者",
    trying: "嘗試中",
    tribe: "部落",
    ownerTribe: "持有部落",
    addKnownTribe: (tribe) => `儲存 ${tribe}`,
    knownTribeSaved: (tribe) => `${tribe} 已加入已知部落。`,
    shieldPopsAt: "護盾結束時間",
    unixTimestamp: "Unix 時間戳",
    shield: "護盾",
    claim: "佔領",
    live: "開放",
    shielded: "護盾中",
    capturing: "佔領中",
    openToClaim: "可開始佔領",
    oneHourRunning: "1 小時進行中",
    ready: "可開始",
    done: "完成",
    popsIn: (value) => `${value}後開放`,
    editShield: "編輯護盾",
    startClaim: "開始佔領",
    stoleTower: "偷塔",
    copyTs: "複製時間",
    copyLink: "複製連結",
    copied: "已複製",
    occupationTimeLeft: "佔領剩餘時間",
    shareViewTitle: "塔標記",
    sharedTower: "分享塔",
    backToAllTowers: "全部塔",
    copyShareLink: "複製標記連結",
    note: "備註",
    marker: "標記",
    markerOptions: {
      none: "無標記",
      going: "我們要去",
      attacked: "正在被攻擊",
      help: "需要支援",
    },
    captureMarkerOptions: {
      help: "支援",
      attacking: "攻擊中",
    },
    clearMarker: "清除標記",
    markerUpdated: (server) => `${server} 標記已更新。`,
    linkCopied: (server) => `${server} 連結已複製。`,
    saveShield: "儲存護盾",
    saveSteal: "儲存偷塔",
    saving: "儲存中...",
    cancel: "取消",
    invalidShieldTimestamp: "護盾結束時間戳無效。",
    tribeRequired: "必須填寫部落名稱。",
    updated: (server) => `${server} 已更新。`,
    stolenBy: (server, tribe) => `${server} 已被 ${tribe} 偷塔。`,
    claimStartedFor: (server, tribe) => `${server} 已由 ${tribe} 開始佔領。`,
    closeShieldEditor: "關閉護盾編輯",
    closeCaptureEditor: "關閉佔領編輯",
    shieldEditorTitle: "編輯護盾",
    captureEditorTitle: "開始佔領",
    stealEditorTitle: "偷塔",
    buffLabels: {
      yellow: "交配增益",
      green: "成長增益",
      blue: "孵化增益",
    },
    durationUnits: {
      day: "天",
      hour: "小時",
      minute: "分",
      second: "秒",
    },
  },
};

const LANGUAGE_OPTIONS: LanguageCode[] = ["en", "ja", "zh-Hant"];
const LANGUAGE_STORAGE_KEY = "buff-towers-language";
const TIMEZONE_STORAGE_KEY = "buff-towers-timezone";
const KNOWN_TRIBES_STORAGE_KEY = "buff-towers-known-tribes";
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Toronto",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Taipei",
  "Asia/Hong_Kong",
  "Australia/Sydney",
];
const TIMEZONE_OPTIONS =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : FALLBACK_TIMEZONES;
const DEFAULT_KNOWN_TRIBES = ["APEX", "APEXX", "ARK", "ARIZE", "GRIM", "RISK"] as const;
const SHARE_MARKERS: ShareMarker[] = ["none", "going", "attacked", "help"];
const CAPTURE_MARKERS: TowerCaptureMarker[] = ["help", "attacking"];

const COLOR_META: Record<TowerColor, ColorMeta> = {
  yellow: {
    accent: "#f0bf40",
    accentSoft: "rgba(240, 191, 64, 0.12)",
    image: "/tower-art/yellow-clean.png",
  },
  green: {
    accent: "#57c276",
    accentSoft: "rgba(87, 194, 118, 0.12)",
    image: "/tower-art/green-clean.png",
  },
  blue: {
    accent: "#3790ff",
    accentSoft: "rgba(55, 144, 255, 0.12)",
    image: "/tower-art/blue-clean.png",
  },
};

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function detectLanguage(): LanguageCode {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const language = navigator.language.toLowerCase();

  if (language.startsWith("ja")) {
    return "ja";
  }

  if (
    language.startsWith("zh-hant") ||
    language.startsWith("zh-tw") ||
    language.startsWith("zh-hk") ||
    language.startsWith("zh-mo")
  ) {
    return "zh-Hant";
  }

  return "en";
}

function normalizeTribeInput(value: string) {
  return value.toUpperCase();
}

function mergeKnownTribes(...lists: ReadonlyArray<ReadonlyArray<string>>) {
  const values = new Set<string>();

  for (const list of lists) {
    for (const entry of list) {
      const normalized = normalizeTribeInput(entry.trim());

      if (normalized) {
        values.add(normalized);
      }
    }
  }

  return [...values];
}

function getTribeSuggestions(value: string, knownTribes: string[]) {
  const query = normalizeTribeInput(value.trim());

  if (!query) {
    return [];
  }

  return [...knownTribes]
    .filter((tribe) => tribe.includes(query) && tribe !== query)
    .sort((left, right) => {
      const leftStarts = left.startsWith(query) ? 0 : 1;
      const rightStarts = right.startsWith(query) ? 0 : 1;

      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      return left.localeCompare(right);
    })
    .slice(0, 6);
}

function getBrowserTimezone() {
  if (typeof Intl === "undefined") {
    return "UTC";
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const rawParts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(rawParts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const parts = getZonedParts(date, timeZone);
  const zonedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return Math.round((zonedUtc - date.getTime()) / 60000);
}

function formatUtcOffset(offsetMinutes: number) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = `${Math.floor(absolute / 60)}`.padStart(2, "0");
  const minutes = `${absolute % 60}`.padStart(2, "0");

  return `UTC${sign}${hours}:${minutes}`;
}

function buildTimeZoneOptionLabels(date: Date) {
  return Object.fromEntries(
    TIMEZONE_OPTIONS.map((timeZone) => [
      timeZone,
      `${formatUtcOffset(getTimeZoneOffsetMinutes(timeZone, date))} · ${timeZone}`,
    ]),
  );
}

function toDatetimeInputValue(unixSeconds: number, timeZone: string) {
  const parts = getZonedParts(new Date(unixSeconds * 1000), timeZone);

  return `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}T${`${parts.hour}`.padStart(2, "0")}:${`${parts.minute}`.padStart(2, "0")}`;
}

function fromDatetimeInputValue(value: string, timeZone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (!match) {
    return Number.NaN;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetAsUtc;

  for (let index = 0; index < 4; index += 1) {
    const actual = getZonedParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    const diff = targetAsUtc - actualAsUtc;

    if (diff === 0) {
      break;
    }

    guess += diff;
  }

  return Math.floor(guess / 1000);
}

function formatDuration(totalSeconds: number, translation: Translation) {
  const safe = Math.max(0, totalSeconds);
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  const units = translation.durationUnits;

  const parts = [
    days > 0 ? `${days}${units.day}` : null,
    days > 0 || hours > 0 ? `${hours}${units.hour}` : null,
    `${minutes}${units.minute}`,
    `${seconds.toString().padStart(2, "0")}${units.second}`,
  ].filter(Boolean);

  return parts.join(" ");
}

function formatAbsoluteTime(
  unixSeconds: number | null,
  mounted: boolean,
  language: LanguageCode,
  timeZone: string,
  liveNowLabel: string,
) {
  if (unixSeconds === null) {
    return liveNowLabel;
  }

  const date = new Date(unixSeconds * 1000);

  if (!mounted) {
    return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  }

  return new Intl.DateTimeFormat(TRANSLATIONS[language].locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
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
      timerKey: "shield",
      statusKey: "shielded",
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
      timerKey: "claim",
      statusKey: "capturing",
      progress: clamp((CAPTURE_DURATION_SECONDS - remaining) / CAPTURE_DURATION_SECONDS),
    };
  }

  return {
    ...resolved,
    phase,
    captureEndsAt: null,
    timerEndsAt: null,
    timerKey: "live",
    statusKey: "live",
    progress: 0,
  };
}

function getTimerLabel(timerKey: TimerKey, translation: Translation) {
  if (timerKey === "shield") {
    return translation.shield;
  }

  if (timerKey === "claim") {
    return translation.claim;
  }

  return translation.live;
}

function getCountdownValue(tower: DisplayTower, currentSeconds: number, translation: Translation) {
  if (tower.timerEndsAt === null) {
    return translation.ready;
  }

  const remaining = tower.timerEndsAt - currentSeconds;

  if (remaining <= 0) {
    return tower.phase === "shielded" ? translation.liveNow : translation.done;
  }

  return formatDuration(remaining, translation);
}

function getTowerAbsoluteLabel(
  tower: DisplayTower,
  mounted: boolean,
  language: LanguageCode,
  timeZone: string,
  translation: Translation,
) {
  return formatAbsoluteTime(
    tower.timerEndsAt ?? (tower.phase === "shielded" ? tower.shieldEndsAt : null),
    mounted,
    language,
    timeZone,
    translation.liveNow,
  );
}

function getAttemptingLabel(tower: DisplayTower) {
  return tower.phase === "capturing" ? tower.contestingTribe ?? "[-]" : "[-]";
}

function getProgressWidth(tower: DisplayTower) {
  return `${Math.round(tower.progress * 100)}%`;
}

function getTimelineLabel(tower: DisplayTower, upcomingOrder: number | undefined, translation: Translation) {
  if (tower.phase === "capturing") {
    return translation.claimInProgress;
  }

  if (tower.phase === "open") {
    return translation.liveNow;
  }

  if (upcomingOrder === 1) {
    return translation.nextBuff;
  }

  return translation.upcoming(upcomingOrder ?? 0);
}

function getShareMarker(value: string | null): ShareMarker {
  return value === "going" || value === "attacked" || value === "help" ? value : "none";
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
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>("en");
  const [selectedTimezone, setSelectedTimezone] = useState("UTC");
  const [selectedTowerServer, setSelectedTowerServer] = useState<string | null>(null);
  const [timeZoneOptionLabels, setTimeZoneOptionLabels] = useState<Record<string, string>>({});
  const [knownTribes, setKnownTribes] = useState<string[]>([...DEFAULT_KNOWN_TRIBES]);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [copiedServer, setCopiedServer] = useState<string | null>(null);
  const [shieldEditor, setShieldEditor] = useState<ShieldEditorState | null>(null);
  const [captureEditor, setCaptureEditor] = useState<CaptureEditorState | null>(null);
  const [shieldTribeFocused, setShieldTribeFocused] = useState(false);
  const [captureTribeFocused, setCaptureTribeFocused] = useState(false);
  const [isShareView, setIsShareView] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [shareMarker, setShareMarker] = useState<ShareMarker>("none");

  const translation = TRANSLATIONS[selectedLanguage];

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());

    if (typeof window !== "undefined") {
      const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const storedTimezone = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
      const storedKnownTribes = window.localStorage.getItem(KNOWN_TRIBES_STORAGE_KEY);
      const browserTimezone = getBrowserTimezone();
      const query = new URLSearchParams(window.location.search);
      setTimeZoneOptionLabels(buildTimeZoneOptionLabels(new Date()));

      if (storedLanguage && LANGUAGE_OPTIONS.includes(storedLanguage as LanguageCode)) {
        setSelectedLanguage(storedLanguage as LanguageCode);
      } else {
        setSelectedLanguage(detectLanguage());
      }

      if (storedTimezone && TIMEZONE_OPTIONS.includes(storedTimezone)) {
        setSelectedTimezone(storedTimezone);
      } else if (TIMEZONE_OPTIONS.includes(browserTimezone)) {
        setSelectedTimezone(browserTimezone);
      } else {
        setSelectedTimezone("UTC");
      }

      if (storedKnownTribes) {
        try {
          const parsed = JSON.parse(storedKnownTribes) as unknown;

          if (Array.isArray(parsed)) {
            setKnownTribes(mergeKnownTribes(DEFAULT_KNOWN_TRIBES, parsed.filter((item) => typeof item === "string")));
          }
        } catch {
          setKnownTribes([...DEFAULT_KNOWN_TRIBES]);
        }
      }

      const queryTower = query.get("tower");
      const queryView = query.get("view");

      if (queryTower && /^1-\d+$/.test(queryTower)) {
        setSelectedTowerServer(queryTower);
        setIsShareView(false);
        setShareMarker(getShareMarker(query.get("marker")));
        setShareNote(query.get("note") ?? "");
      }
    }

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
    if (!mounted || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, selectedTimezone);
    window.localStorage.setItem(KNOWN_TRIBES_STORAGE_KEY, JSON.stringify(knownTribes));
  }, [knownTribes, mounted, selectedLanguage, selectedTimezone]);

  useEffect(() => {
    if (!shieldEditor) {
      return;
    }

    setShieldEditor((current) =>
      current
        ? (() => {
            const nextDatetimeValue = toDatetimeInputValue(Number(current.shieldUnixValue), selectedTimezone);

            if (current.datetimeValue === nextDatetimeValue) {
              return current;
            }

            return {
              ...current,
              datetimeValue: nextDatetimeValue,
            };
          })()
        : current,
    );
  }, [selectedTimezone, shieldEditor]);

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

  useEffect(() => {
    if (!selectedTowerServer || typeof document === "undefined") {
      return;
    }

    const target = document.getElementById(`tower-${selectedTowerServer}`);

    if (target) {
      target.scrollIntoView({
        behavior: mounted ? "smooth" : "auto",
        block: "center",
      });
    }
  }, [mounted, selectedTowerServer]);

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
  const focusedTower = selectedTowerServer ? towers.find((tower) => tower.server === selectedTowerServer) ?? null : null;
  const visibleTowers = isShareView && focusedTower ? [focusedTower] : timelineTowers;
  const nextTower = focusedTower && isShareView ? focusedTower : upcomingTowers[0] ?? liveTowers[0] ?? towers[0];
  const lastUpdated = Math.floor(new Date(snapshot.updatedAt).getTime() / 1000);
  const shieldOwnerSuggestions = shieldEditor ? getTribeSuggestions(shieldEditor.ownerTribe, knownTribes) : [];
  const captureTribeSuggestions = captureEditor ? getTribeSuggestions(captureEditor.tribe, knownTribes) : [];
  const shieldOwnerCanBeSaved =
    !!shieldEditor?.ownerTribe.trim() && !knownTribes.includes(normalizeTribeInput(shieldEditor.ownerTribe.trim()));
  const captureTribeCanBeSaved =
    !!captureEditor?.tribe.trim() && !knownTribes.includes(normalizeTribeInput(captureEditor.tribe.trim()));

  async function copyDiscordTimestamp(server: string, shieldEndsAt: number) {
    await navigator.clipboard.writeText(`<t:${shieldEndsAt}:F>`);
    setCopiedServer(server);
  }

  function buildTowerShareUrl(server: string, options?: { note?: string; marker?: ShareMarker }) {
    const url = new URL(window.location.href);
    url.searchParams.set("tower", server);
    url.searchParams.delete("view");

    const marker = options?.marker ?? "none";
    const note = options?.note?.trim() ?? "";

    if (marker === "none") {
      url.searchParams.delete("marker");
    } else {
      url.searchParams.set("marker", marker);
    }

    if (note) {
      url.searchParams.set("note", note);
    } else {
      url.searchParams.delete("note");
    }

    return url.toString();
  }

  async function copyTowerLink(server: string) {
    if (typeof window === "undefined") {
      return;
    }

    await navigator.clipboard.writeText(buildTowerShareUrl(server));
    setSelectedTowerServer(server);
    setNotice({
      tone: "success",
      message: translation.linkCopied(server),
    });
  }

  async function copyShareLink() {
    if (typeof window === "undefined" || !focusedTower) {
      return;
    }

    await navigator.clipboard.writeText(buildTowerShareUrl(focusedTower.server, { note: shareNote, marker: shareMarker }));
    setNotice({
      tone: "success",
      message: translation.linkCopied(focusedTower.server),
    });
  }

  function showAllTowers() {
    setIsShareView(false);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      url.searchParams.delete("note");
      url.searchParams.delete("marker");
      window.history.replaceState(null, "", url.toString());
    }
  }

  function openShieldEditor(tower: DisplayTower) {
    setSelectedTowerServer(tower.server);
    setShieldTribeFocused(false);
    setShieldEditor({
      server: tower.server,
      shieldUnixValue: `${tower.shieldEndsAt}`,
      datetimeValue: toDatetimeInputValue(tower.shieldEndsAt, selectedTimezone),
      ownerTribe: tower.ownerTribe ?? "",
      status: "idle",
    });
  }

  function openCaptureEditor(tower: DisplayTower, mode: "claim" | "stole") {
    setSelectedTowerServer(tower.server);
    setCaptureTribeFocused(false);
    setCaptureEditor({
      server: tower.server,
      tribe: mode === "stole" ? "" : tower.contestingTribe ?? "",
      mode,
      remainingMinutesValue: `${Math.max(1, Math.ceil(((tower.captureEndsAt ?? currentSeconds + CAPTURE_DURATION_SECONDS) - currentSeconds) / 60))}`,
      status: "idle",
    });
  }

  function setShieldOwnerValue(value: string) {
    setShieldEditor((current) =>
      current
        ? {
            ...current,
            ownerTribe: normalizeTribeInput(value),
            status: "idle",
            error: undefined,
          }
        : current,
    );
  }

  function setCaptureTribeValue(value: string) {
    setCaptureEditor((current) =>
      current
        ? {
            ...current,
            tribe: normalizeTribeInput(value),
            status: "idle",
            error: undefined,
          }
        : current,
    );
  }

  function saveKnownTribe(value: string) {
    const tribe = normalizeTribeInput(value.trim());

    if (!tribe) {
      return;
    }

    setKnownTribes((current) => mergeKnownTribes(current, [tribe]));
    setNotice({
      tone: "success",
      message: translation.knownTribeSaved(tribe),
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
        datetimeValue: toDatetimeInputValue(shieldEndsAt, selectedTimezone),
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

      const shieldEndsAt = fromDatetimeInputValue(value, selectedTimezone);

      return {
        ...current,
        datetimeValue: value,
        shieldUnixValue:
          Number.isInteger(shieldEndsAt) && shieldEndsAt > 0 ? `${shieldEndsAt}` : current.shieldUnixValue,
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
            ? toDatetimeInputValue(shieldEndsAt, selectedTimezone)
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
        error: translation.invalidShieldTimestamp,
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
        message: translation.updated(shieldEditor.server),
      });
    } catch (error) {
      setShieldEditor((current) =>
        current
          ? {
              ...current,
              status: "error",
              error: error instanceof Error ? error.message : translation.invalidShieldTimestamp,
            }
          : current,
      );
    }
  }

  function setCaptureRemainingMinutes(value: string) {
    setCaptureEditor((current) =>
      current
        ? {
            ...current,
            remainingMinutesValue: value,
            status: "idle",
            error: undefined,
          }
        : current,
    );
  }

  async function saveCapture() {
    if (!captureEditor) {
      return;
    }

    if (!captureEditor.tribe.trim()) {
      setCaptureEditor({
        ...captureEditor,
        status: "error",
        error: translation.tribeRequired,
      });
      return;
    }

    const remainingMinutes = Math.min(60, Math.max(1, Number(captureEditor.remainingMinutesValue)));

    if (!Number.isFinite(remainingMinutes)) {
      setCaptureEditor({
        ...captureEditor,
        status: "error",
        error: translation.invalidShieldTimestamp,
      });
      return;
    }

    setCaptureEditor({
      ...captureEditor,
      remainingMinutesValue: `${remainingMinutes}`,
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
          captureEndsAt: currentSeconds + Math.round(remainingMinutes * 60),
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
            ? translation.stolenBy(captureEditor.server, captureEditor.tribe)
            : translation.claimStartedFor(captureEditor.server, captureEditor.tribe),
      });
    } catch (error) {
      setCaptureEditor((current) =>
        current
          ? {
              ...current,
              status: "error",
              error: error instanceof Error ? error.message : translation.tribeRequired,
            }
          : current,
      );
    }
  }

  async function updateCaptureMarker(server: string, marker: TowerCaptureMarker | null) {
    try {
      const response = await fetch("/api/towers", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-capture-marker",
          server,
          marker: marker ?? "",
        }),
      });

      const nextSnapshot = (await response.json()) as TowerSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(nextSnapshot.error || "Could not update that marker.");
      }

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });

      setNotice({
        tone: "success",
        message: translation.markerUpdated(server),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not update that marker.",
      });
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.topBarTitle}>{translation.appTitle}</div>

        <div className={styles.topBarControls}>
          <label className={styles.control}>
            <span>{translation.language}</span>
            <select
              className={styles.select}
              value={selectedLanguage}
              onChange={(event) => setSelectedLanguage(event.target.value as LanguageCode)}
            >
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language} value={language}>
                  {TRANSLATIONS[language].nativeName}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.control}>
                <span>{translation.timezone}</span>
            <select
              className={styles.select}
              value={selectedTimezone}
              onChange={(event) => setSelectedTimezone(event.target.value)}
            >
              {TIMEZONE_OPTIONS.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZoneOptionLabels[timeZone] ?? timeZone}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroHeading}>
          <h1 className={styles.heroTitle}>{isShareView ? translation.shareViewTitle : translation.heroTitle}</h1>
          {isShareView ? (
            <button className={styles.ghostButton} onClick={showAllTowers}>
              {translation.backToAllTowers}
            </button>
          ) : null}
        </div>

        <div className={styles.summaryRow}>
          <div className={styles.summaryCard}>
            <span>{isShareView ? translation.sharedTower : translation.nextTower}</span>
            <strong>{nextTower.server}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>{translation.startsIn}</span>
            <strong>{getCountdownValue(nextTower, currentSeconds, translation)}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>{translation.liveNow}</span>
            <strong>{liveTowers.length}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>{translation.lastSync}</span>
            <strong>{formatAbsoluteTime(lastUpdated, mounted, selectedLanguage, selectedTimezone, translation.liveNow)}</strong>
          </div>
        </div>
      </section>

      {notice ? (
        <div className={`${styles.notice} ${notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}`}>
          {notice.message}
        </div>
      ) : null}

      {isShareView && focusedTower ? (
        <section className={styles.sharePanel}>
          <label className={styles.field}>
            <span>{translation.marker}</span>
            <select className={styles.select} value={shareMarker} onChange={(event) => setShareMarker(event.target.value as ShareMarker)}>
              {SHARE_MARKERS.map((marker) => (
                <option key={marker} value={marker}>
                  {translation.markerOptions[marker]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{translation.note}</span>
            <textarea
              className={styles.textarea}
              value={shareNote}
              onChange={(event) => setShareNote(event.target.value)}
              placeholder="Meet here, attack timing, scout notes..."
            />
          </label>

          <button className={styles.primaryButton} onClick={() => void copyShareLink()}>
            {translation.copyShareLink}
          </button>
        </section>
      ) : null}

      <section className={`${styles.timeline} ${isShareView ? styles.timelineSingle : ""}`}>
        {visibleTowers.map((tower) => {
          const meta = COLOR_META[tower.color];
          const order = upcomingOrder.get(tower.server);
          const isFocused = selectedTowerServer === tower.server;

          return (
            <article key={tower.server} className={styles.timelineItem} id={`tower-${tower.server}`}>
              <div className={styles.nodeColumn}>
                <div
                  className={`${styles.node} ${tower.phase === "capturing" ? styles.nodeHot : tower.phase === "open" ? styles.nodeLive : styles.nodeFuture}`}
                >
                  {getTimelineNodeText(tower, order)}
                </div>
              </div>

              <div
                className={`${styles.eventCard} ${isFocused ? styles.eventCardFocused : ""}`}
                style={
                  {
                    "--accent": meta.accent,
                    "--accent-soft": meta.accentSoft,
                  } as CSSProperties
                }
              >
                <div className={styles.eventTop}>
                  <div className={styles.eventText}>
                    <span className={styles.eventLabel}>{getTimelineLabel(tower, order, translation)}</span>
                    {isShareView && shareMarker !== "none" ? (
                      <span className={styles.markerBadge}>{translation.markerOptions[shareMarker]}</span>
                    ) : null}
                    {tower.phase === "capturing" && tower.captureMarker ? (
                      <span className={styles.markerBadge}>{translation.captureMarkerOptions[tower.captureMarker]}</span>
                    ) : null}
                    <h2 className={styles.eventTitle}>
                      {tower.server} · {translation.buffLabels[tower.color]}
                    </h2>
                    <p className={styles.eventTime}>
                      {getTowerAbsoluteLabel(tower, mounted, selectedLanguage, selectedTimezone, translation)}
                    </p>
                  </div>

                  <div className={styles.eventArtBox}>
                    <Image
                      src={meta.image}
                      alt={`${translation.buffLabels[tower.color]} tower`}
                      width={84}
                      height={112}
                      className={styles.eventArt}
                    />
                  </div>
                </div>

                <div className={styles.eventStats}>
                  <div className={styles.statBlock}>
                    <span>{translation.owner}</span>
                    <strong>{tower.ownerTribe ?? "[-]"}</strong>
                  </div>
                  <div className={styles.statBlock}>
                    <span>{translation.trying}</span>
                    <strong>{getAttemptingLabel(tower)}</strong>
                  </div>
                  <div className={styles.statBlock}>
                    <span>{getTimerLabel(tower.timerKey, translation)}</span>
                    <strong>{getCountdownValue(tower, currentSeconds, translation)}</strong>
                  </div>
                </div>

                {tower.phase !== "open" ? (
                  <div className={styles.progressTrack} aria-hidden="true">
                    <span className={styles.progressFill} style={{ width: getProgressWidth(tower) }} />
                  </div>
                ) : null}

                {isShareView && shareNote.trim() ? <p className={styles.shareNote}>{shareNote}</p> : null}

                {tower.phase === "capturing" ? (
                  <div className={styles.markerActions}>
                    {CAPTURE_MARKERS.map((marker) => (
                      <button
                        key={marker}
                        className={`${styles.markerButton} ${tower.captureMarker === marker ? styles.markerButtonActive : ""}`}
                        onClick={() => void updateCaptureMarker(tower.server, tower.captureMarker === marker ? null : marker)}
                      >
                        {translation.captureMarkerOptions[marker]}
                      </button>
                    ))}
                    {tower.captureMarker ? (
                      <button className={styles.markerButton} onClick={() => void updateCaptureMarker(tower.server, null)}>
                        {translation.clearMarker}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.actions}>
                  {tower.phase === "capturing" ? (
                    <button className={styles.primaryButton} onClick={() => openCaptureEditor(tower, "stole")}>
                      {translation.stoleTower}
                    </button>
                  ) : tower.phase === "open" ? (
                    <button className={styles.primaryButton} onClick={() => openCaptureEditor(tower, "claim")}>
                      {translation.startClaim}
                    </button>
                  ) : (
                    <button className={styles.secondaryButton} onClick={() => openShieldEditor(tower)}>
                      {translation.editShield}
                    </button>
                  )}

                  {tower.phase !== "shielded" ? (
                    <button className={styles.secondaryButton} onClick={() => openShieldEditor(tower)}>
                      {translation.editShield}
                    </button>
                  ) : null}

                  <button className={styles.ghostButton} onClick={() => void copyDiscordTimestamp(tower.server, tower.shieldEndsAt)}>
                    {copiedServer === tower.server ? translation.copied : translation.copyTs}
                  </button>

                  <button className={styles.ghostButton} onClick={() => void copyTowerLink(tower.server)}>
                    {translation.copyLink}
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
                <span className={styles.modalLabel}>{translation.shieldEditorTitle}</span>
                <h2>{shieldEditor.server}</h2>
              </div>
              <button
                className={styles.closeButton}
                onClick={() => setShieldEditor(null)}
                aria-label={translation.closeShieldEditor}
              >
                ×
              </button>
            </div>

            <label className={styles.field}>
              <span>{translation.ownerTribe}</span>
              <input
                value={shieldEditor.ownerTribe}
                onFocus={() => setShieldTribeFocused(true)}
                onBlur={() => setShieldTribeFocused(false)}
                onChange={(event) => setShieldOwnerValue(event.target.value)}
              />
            </label>

            {shieldTribeFocused && (shieldOwnerSuggestions.length > 0 || shieldOwnerCanBeSaved) ? (
              <div className={styles.tribeAssist}>
                {shieldOwnerSuggestions.length > 0 ? (
                  <div className={styles.tribeSuggestions}>
                    {shieldOwnerSuggestions.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={styles.tribeSuggestionButton}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setShieldOwnerValue(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                ) : null}

                {shieldOwnerCanBeSaved ? (
                  <button
                    type="button"
                    className={styles.tribeAddButton}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => saveKnownTribe(shieldEditor.ownerTribe)}
                  >
                    {translation.addKnownTribe(normalizeTribeInput(shieldEditor.ownerTribe.trim()))}
                  </button>
                ) : null}
              </div>
            ) : null}

            <label className={styles.field}>
              <span>{translation.shieldPopsAt}</span>
              <input
                type="datetime-local"
                value={shieldEditor.datetimeValue}
                onChange={(event) => updateShieldFromDatetime(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span>{translation.unixTimestamp}</span>
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
                {translation.cancel}
              </button>
              <button className={styles.primaryButton} onClick={() => void saveShield()} disabled={shieldEditor.status === "saving"}>
                {shieldEditor.status === "saving" ? translation.saving : translation.saveShield}
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
                <span className={styles.modalLabel}>
                  {captureEditor.mode === "stole" ? translation.stealEditorTitle : translation.captureEditorTitle}
                </span>
                <h2>{captureEditor.server}</h2>
              </div>
              <button
                className={styles.closeButton}
                onClick={() => setCaptureEditor(null)}
                aria-label={translation.closeCaptureEditor}
              >
                ×
              </button>
            </div>

            <label className={styles.field}>
              <span>{translation.tribe}</span>
              <input
                value={captureEditor.tribe}
                onFocus={() => setCaptureTribeFocused(true)}
                onBlur={() => setCaptureTribeFocused(false)}
                onChange={(event) => setCaptureTribeValue(event.target.value)}
              />
            </label>

            {captureTribeFocused && (captureTribeSuggestions.length > 0 || captureTribeCanBeSaved) ? (
              <div className={styles.tribeAssist}>
                {captureTribeSuggestions.length > 0 ? (
                  <div className={styles.tribeSuggestions}>
                    {captureTribeSuggestions.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={styles.tribeSuggestionButton}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setCaptureTribeValue(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                ) : null}

                {captureTribeCanBeSaved ? (
                  <button
                    type="button"
                    className={styles.tribeAddButton}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => saveKnownTribe(captureEditor.tribe)}
                  >
                    {translation.addKnownTribe(normalizeTribeInput(captureEditor.tribe.trim()))}
                  </button>
                ) : null}
              </div>
            ) : null}

            <label className={styles.field}>
              <span>{translation.occupationTimeLeft}</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={captureEditor.remainingMinutesValue}
                onChange={(event) => setCaptureRemainingMinutes(event.target.value)}
              />
            </label>

            <div className={styles.quickActions}>
              {[15, 30, 45, 60].map((minutes) => (
                <button key={minutes} className={styles.quickButton} onClick={() => setCaptureRemainingMinutes(`${minutes}`)}>
                  {minutes}m
                </button>
              ))}
            </div>

            {captureEditor.error ? <p className={styles.errorText}>{captureEditor.error}</p> : null}

            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={() => setCaptureEditor(null)}>
                {translation.cancel}
              </button>
              <button className={styles.primaryButton} onClick={() => void saveCapture()} disabled={captureEditor.status === "saving"}>
                {captureEditor.status === "saving"
                  ? translation.saving
                  : captureEditor.mode === "stole"
                    ? translation.saveSteal
                    : translation.startClaim}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
