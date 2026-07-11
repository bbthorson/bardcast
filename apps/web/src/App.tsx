import { color } from "@bardcast/brand";
import { useState } from "react";
import { useSession } from "./session.js";
import { useRouter } from "./router.js";
import { useVoiceClone } from "./voice.js";
import { styles, TopBar } from "./ui.js";
import { Landing } from "./screens/Landing.js";
import { LoginDialog } from "./screens/LoginDialog.js";
import { Dashboard } from "./screens/Dashboard.js";
import { CreateCampaign } from "./screens/CreateCampaign.js";
import { JoinInvite } from "./screens/JoinInvite.js";
import { VoiceClone } from "./screens/VoiceClone.js";

/** Routes for the signed-in views. Home ("/") is the dashboard. */
const path = { home: "/", create: "/campaigns/new", join: "/join", voice: "/voice" } as const;

/**
 * The web front door. Views are URL-driven (see router.ts) so the browser
 * back/forward buttons work and a refresh keeps your place. The header is always
 * present; logged out shows the public landing page with a "Sign in" button that
 * opens a dialog, logged in the DID drives everything. Kept client-side so the
 * whole thing is a static Cloudflare build (docs/hosting.md).
 */
export function App() {
  const session = useSession();
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);

  // Only the one-time session resolution shows the full-page splash. A sign-in
  // in flight is reflected in the dialog's button instead.
  if (session.initializing) {
    return (
      <main style={{ ...styles.main, justifyContent: "center", alignItems: "center" }}>
        <p style={styles.muted}>Finding your seat…</p>
      </main>
    );
  }

  if (!session.player) {
    return (
      <main style={styles.main}>
        <TopBar
          actions={
            // The always-present twin of the hero CTA — quieter (outline) so the
            // hero keeps the single ember.
            <button style={styles.secondary} onClick={() => setShowLogin(true)}>
              Sign in
            </button>
          }
        />
        <Landing onOpenLogin={() => setShowLogin(true)} />
        {showLogin && (
          <LoginDialog
            onSignIn={session.signIn}
            loading={session.loading}
            error={session.error}
            onClose={() => setShowLogin(false)}
          />
        )}
      </main>
    );
  }

  return <SignedIn session={session} router={router} />;
}

/**
 * Signed-in shell. The voice-clone hook lives here so the Dashboard's status
 * strip and the VoiceClone screen share one source of truth. The current view is
 * derived from the URL path.
 */
function SignedIn({
  session,
  router,
}: {
  session: ReturnType<typeof useSession>;
  router: ReturnType<typeof useRouter>;
}) {
  const player = session.player!;
  const voice = useVoiceClone(player.did);
  const { navigate, back } = router;

  return (
    <main style={styles.main}>
      <TopBar
        onHome={() => navigate(path.home)}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {session.simulated && (
              <span style={{ ...styles.muted, fontSize: "0.75rem", color: color.candleGold }} title="No orchestrator reachable — signed in with a local stand-in session.">
                demo session
              </span>
            )}
            <button style={styles.ghost} onClick={() => { navigate(path.home); session.signOut(); }}>
              Sign out
            </button>
          </div>
        }
      />

      {router.path === path.create ? (
        <CreateCampaign player={player} onBack={back} />
      ) : router.path === path.join ? (
        <JoinInvite onBack={back} />
      ) : router.path === path.voice ? (
        <VoiceClone {...voice} onBack={back} />
      ) : (
        <Dashboard
          player={player}
          voice={voice.profile}
          onCreate={() => navigate(path.create)}
          onJoin={() => navigate(path.join)}
          onManageVoice={() => navigate(path.voice)}
        />
      )}
    </main>
  );
}
