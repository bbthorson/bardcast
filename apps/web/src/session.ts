import type { Player } from "@bardcast/domain";
import { useCallback, useEffect, useState } from "react";

/**
 * The web front door's view of AT-Proto sign-in.
 *
 * Bardcast's OWN AT-Proto OAuth is live and lives on the orchestrator
 * (`AtprotoIdentityProvider`, mounted at `/atproto`). This module is the
 * browser half of that seam:
 *
 *  - `signIn(handle)` POSTs to the real `/atproto/login`, which resolves the
 *    handle and returns the PDS authorization URL; we redirect the browser to
 *    it. After consent the orchestrator's `/callback` sets an httpOnly session
 *    cookie and bounces back here.
 *  - On load we ask `/atproto/session` who we are (the cookie is httpOnly, so
 *    JS can't read the DID directly).
 *
 * Dev fallback: when no orchestrator is reachable (running this app on its own),
 * sign-in drops into a *simulated* session so the whole front door is walkable
 * without a backend. Simulated sessions are marked and never touch the network.
 * TODO(bardcast): remove the fallback once the orchestrator is a hard dependency.
 */

const ORCHESTRATOR = (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ?? "http://localhost:8787";
const SIM_KEY = "bardcast.web.simulated-session";

export interface SessionState {
  player: Player | null;
  loading: boolean;
  /** True when the current session is the offline dev stub, not a real PDS login. */
  simulated: boolean;
  error: string | null;
}

function loadSimulated(): Player | null {
  try {
    const raw = localStorage.getItem(SIM_KEY);
    return raw ? (JSON.parse(raw) as Player) : null;
  } catch {
    return null;
  }
}

/** Build a stand-in Player from a handle for the offline dev path. */
function simulatedPlayer(handle: string): Player {
  const clean = handle.trim().replace(/^@/, "");
  return {
    // A did:web derived from the handle — clearly a stand-in, not a resolved DID.
    did: `did:web:${clean || "guest.bardcast.local"}`,
    handle: clean || undefined,
    createdAt: new Date().toISOString(),
  };
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    player: null,
    loading: true,
    simulated: false,
    error: null,
  });

  // On load: prefer a real orchestrator session; fall back to a simulated one
  // left in localStorage from a previous offline sign-in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sim = loadSimulated();
      try {
        const res = await fetch(`${ORCHESTRATOR}/atproto/session`, { credentials: "include" });
        const data = (await res.json()) as { authenticated: boolean; player?: Player };
        if (cancelled) return;
        if (data.authenticated && data.player) {
          setState({ player: data.player, loading: false, simulated: false, error: null });
          return;
        }
      } catch {
        // Orchestrator unreachable — stay on whatever simulated session we have.
      }
      if (cancelled) return;
      setState({ player: sim, loading: false, simulated: sim !== null, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (handle: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`${ORCHESTRATOR}/atproto/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ handle }),
      });
      if (res.ok) {
        const { url } = (await res.json()) as { url?: string };
        if (url) {
          // Hand the browser to the player's PDS to authorize. We return here
          // after the orchestrator's callback redirects back.
          window.location.href = url;
          return;
        }
      }
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(error ?? `login failed (${res.status})`);
    } catch {
      // Offline / no orchestrator: walk the rest of the app on a simulated login.
      const player = simulatedPlayer(handle);
      try {
        localStorage.setItem(SIM_KEY, JSON.stringify(player));
      } catch {
        /* private mode — session lives only in memory this tab */
      }
      setState({ player, loading: false, simulated: true, error: null });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(SIM_KEY);
    } catch {
      /* ignore */
    }
    // Best-effort: clear the real cookie too if an orchestrator is there.
    try {
      await fetch(`${ORCHESTRATOR}/atproto/logout`, { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    setState({ player: null, loading: false, simulated: false, error: null });
  }, []);

  return { ...state, signIn, signOut };
}
