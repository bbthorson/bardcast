import { useCallback, useEffect, useState } from "react";

/**
 * A tiny history-based router — enough to give each view a real URL so the
 * browser back/forward buttons work and a refresh keeps your place. We don't
 * pull in a router dependency for a handful of views; the Cloudflare Worker
 * serves index.html for any path (assets.not_found_handling: single-page-app),
 * so deep links resolve here.
 *
 * `navigate` pushes a new history entry; `back` pops one (falling back to home
 * when there's nowhere in-app to return to, e.g. a fresh deep link).
 *
 * We track an in-app depth in `history.state.idx` rather than trusting
 * `history.length` — the latter counts entries from before the app loaded, so a
 * deep link opened after visiting another site would let `back` walk right out
 * of the app.
 */
function currentIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? 0;
}

export function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    // Stamp the entry we loaded on as depth 0 so `back` knows there's nothing
    // in-app behind it.
    if (window.history.state === null) window.history.replaceState({ idx: 0 }, "");
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({ idx: currentIdx() + 1 }, "", to);
      setPath(to);
    }
  }, []);

  const back = useCallback(() => {
    if (currentIdx() > 0) window.history.back();
    else navigate("/");
  }, [navigate]);

  return { path, navigate, back };
}
