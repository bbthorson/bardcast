import { color } from "@bardcast/brand";
import { useState } from "react";
import { useSession } from "./session.js";
import { useVoiceClone } from "./voice.js";
import { styles, TopBar } from "./ui.js";
import { Landing } from "./screens/Landing.js";
import { LoginDialog } from "./screens/LoginDialog.js";
import { Dashboard } from "./screens/Dashboard.js";
import { CreateCampaign } from "./screens/CreateCampaign.js";
import { JoinInvite } from "./screens/JoinInvite.js";
import { VoiceClone } from "./screens/VoiceClone.js";

type View = "dashboard" | "create" | "join" | "voice";

/**
 * The web front door. A small view state machine rather than a router. The
 * header is always present; logged out shows the public landing page with a
 * "Sign in" button that opens a dialog, logged in the DID drives everything
 * (create/join a campaign, manage the voice clone). Kept client-side so the
 * whole thing is a static Cloudflare build (docs/hosting.md).
 */
export function App() {
  const session = useSession();
  const [view, setView] = useState<View>("dashboard");
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

  return <SignedIn view={view} setView={setView} session={session} />;
}

/**
 * Signed-in shell. The voice-clone hook lives here so the Dashboard's status
 * strip and the VoiceClone screen share one source of truth.
 */
function SignedIn({
  view,
  setView,
  session,
}: {
  view: View;
  setView: (v: View) => void;
  session: ReturnType<typeof useSession>;
}) {
  const player = session.player!;
  const voice = useVoiceClone(player.did);

  return (
    <main style={styles.main}>
      <TopBar
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {session.simulated && (
              <span style={{ ...styles.muted, fontSize: "0.75rem", color: color.candleGold }} title="No orchestrator reachable — signed in with a local stand-in session.">
                demo session
              </span>
            )}
            <button style={styles.ghost} onClick={() => { setView("dashboard"); session.signOut(); }}>
              Sign out
            </button>
          </div>
        }
      />

      {view === "dashboard" && (
        <Dashboard
          player={player}
          voice={voice.profile}
          onCreate={() => setView("create")}
          onJoin={() => setView("join")}
          onManageVoice={() => setView("voice")}
        />
      )}
      {view === "create" && <CreateCampaign player={player} onBack={() => setView("dashboard")} />}
      {view === "join" && <JoinInvite onBack={() => setView("dashboard")} />}
      {view === "voice" && <VoiceClone {...voice} onBack={() => setView("dashboard")} />}
    </main>
  );
}
