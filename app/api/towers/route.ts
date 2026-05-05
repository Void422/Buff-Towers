import { NextResponse } from "next/server";
import { getTowerSnapshot, setCaptureMarker, setShieldEnd, startCapture } from "@/lib/tower-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getTowerSnapshot();

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const action = typeof body === "object" && body && "action" in body ? String(body.action).trim() : "";
  const server = typeof body === "object" && body && "server" in body ? String(body.server).trim() : "";

  if (!/^1-\d+$/.test(server)) {
    return NextResponse.json({ error: "A valid server id is required." }, { status: 400 });
  }

  try {
    let snapshot;

    if (action === "set-shield-end") {
      const shieldEndsAt =
        typeof body === "object" && body && "shieldEndsAt" in body ? Number(body.shieldEndsAt) : Number.NaN;
      const ownerTribe =
        typeof body === "object" && body && "ownerTribe" in body ? String(body.ownerTribe) : undefined;

      if (!Number.isInteger(shieldEndsAt) || shieldEndsAt < 1) {
        return NextResponse.json(
          { error: "A valid shield end Unix timestamp is required." },
          { status: 400 },
        );
      }

      snapshot = await setShieldEnd(server, shieldEndsAt, ownerTribe);
    } else if (action === "start-capture") {
      const tribe = typeof body === "object" && body && "tribe" in body ? String(body.tribe) : "";
      const mode = typeof body === "object" && body && "mode" in body ? String(body.mode) : "";

      if (!tribe.trim()) {
        return NextResponse.json({ error: "A tribe name is required." }, { status: 400 });
      }

      if (mode !== "claim" && mode !== "stole") {
        return NextResponse.json({ error: "A valid capture mode is required." }, { status: 400 });
      }

      const captureEndsAt =
        typeof body === "object" && body && "captureEndsAt" in body ? Number(body.captureEndsAt) : undefined;

      if (captureEndsAt !== undefined && (!Number.isInteger(captureEndsAt) || captureEndsAt < 1)) {
        return NextResponse.json({ error: "A valid capture end Unix timestamp is required." }, { status: 400 });
      }

      snapshot = await startCapture(
        server,
        tribe,
        mode === "stole" ? "tower-stolen" : "claim-started",
        captureEndsAt,
      );
    } else if (action === "set-capture-marker") {
      const rawMarker = typeof body === "object" && body && "marker" in body ? String(body.marker) : "";

      if (rawMarker !== "" && rawMarker !== "help" && rawMarker !== "attacking") {
        return NextResponse.json({ error: "A valid marker is required." }, { status: 400 });
      }

      snapshot = await setCaptureMarker(server, rawMarker === "" ? null : rawMarker);
    } else {
      return NextResponse.json({ error: "Unknown update action." }, { status: 400 });
    }

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that tower.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
