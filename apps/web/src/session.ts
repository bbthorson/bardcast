import type { Player } from "@bardcast/domain";
import { AuthError, createAuthClient, takeAuthError, type User } from "@bbthorson/atproto-cf-auth/client";
import { useCallback, useEffect, useState } from "react";

/**
 * The web front door's view of AT-Proto sign-in.
 *
 * Sign-in runs on the orchestrator (`AtprotoIdentityProvider`, mounted at
 * `/atproto`) using `@bbthorson/atproto-cf-auth`; this hook is the browser half,
 * on the same package's headless client:
 *
 *  - `signIn(handle)` cleans up the handle, POSTs to `/atproto/login` and sends
 *    the browser to the player's PDS. After consent `/atproto/callback` sets an
 *    httpOnly session cookie and redirects back here.
 *  - On load we ask `/atproto/session` who we are (the cookie is httpOnly, so
 *    JS can't read the DID directly).
 *
 * Dev fallback: when no orchestrator is reachable (running this app on its own),
 * sign-in drops into a *simulated* session so the whole front door is walkable
 * without a backend. Simulated sessions are marked and never touch the network.
 * TODO(bardcast): remove the fallback once the orchestrator is a hard dependency.
 */

// In production the orchestrator shares this Worker's origin (root wrangler.jsonc),
// so the default is a relative URL; `vite dev` talks to the local Node service.
const ORCHESTRATOR =
  (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ??
  // 127.0.0.1, not localhost: Bluesky's development client redirects to the loopback IP.
  (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");
const SIM_KEY = "bardcast.web.simulated-session";

export interface SessionState {
  player: Player | null;
  /** True only during the one-time session resolution on mount (drives the full-page splash). */
  initializing: boolean;
  /** True while a sign-in is in flight (drives the button, not the splash). */
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

/** Bardcast's sign-in routes, via the shared package's browser client. */
const auth = createAuthClient({
  basePath: `${ORCHESTRATOR}/atproto`,
  // Cross-origin in `vite dev` (web and orchestrator on different ports).
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

function toPlayer(user: User): Player {
  return { did: user.did, createdAt: user.signedInAt, ...(user.handle ? { handle: user.handle } : {}) };
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    player: null,
    initializing: true,
    loading: false,
    simulated: false,
    error: null,
  });

  // On load: prefer a real orchestrator session; fall back to a simulated one
  // left in localStorage from a previous offline sign-in. A sign-in that failed
  // at the PDS comes back as ?auth_error=, which takeAuthError reads once.
  useEffect(() => {
    let cancelled = false;
    const redirectError = takeAuthError()?.message ?? null;
    (async () => {
      const sim = loadSimulated();
      try {
        const user = await auth.getUser();
        if (cancelled) return;
        if (user) {
          setState({ player: toPlayer(user), initializing: false, loading: false, simulated: false, error: null });
          return;
        }
      } catch {
        // Orchestrator unreachable — stay on whatever simulated session we have.
      }
      if (cancelled) return;
      setState({ player: sim, initializing: false, loading: false, simulated: sim !== null, error: redirectError });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (handle: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // Navigates to the player's PDS on success; we come back via /atproto/callback.
      await auth.signIn(handle);
    } catch (err) {
      // Only a genuinely unreachable orchestrator drops us into the simulated
      // dev session. Anything else (a typo'd handle, a PDS that won't answer)
      // is a real error the player must see.
      if (err instanceof AuthError && err.code === "network_error") {
        const player = simulatedPlayer(handle);
        try {
          localStorage.setItem(SIM_KEY, JSON.stringify(player));
        } catch {
          /* private mode — session lives only in memory this tab */
        }
        setState({ player, initializing: false, loading: false, simulated: true, error: null });
        return;
      }
      setState({
        player: null,
        initializing: false,
        loading: false,
        simulated: false,
        error: err instanceof AuthError ? err.message : "Sign-in failed. Try again in a moment.",
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(SIM_KEY);
    } catch {
      /* ignore */
    }
    // Best-effort: clear the real cookie too if an orchestrator is there.
    await auth.signOut().catch(() => undefined);
    setState({ player: null, initializing: false, loading: false, simulated: false, error: null });
  }, []);

  return { ...state, signIn, signOut };
}
