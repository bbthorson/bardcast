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
 */
export function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState(null, "", to);
      setPath(to);
    }
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  }, [navigate]);

  return { path, navigate, back };
}
