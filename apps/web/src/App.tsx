import { color } from "@bardcast/brand";
import { useState } from "react";
import { useSession } from "./session.js";
import { useVoiceClone } from "./voice.js";
import { styles, TopBar } from "./ui.js";
import { Landing } from "./screens/Landing.js";
import { Dashboard } from "./screens/Dashboard.js";
import { CreateCampaign } from "./screens/CreateCampaign.js";
import { JoinInvite } from "./screens/JoinInvite.js";
import { VoiceClone } from "./screens/VoiceClone.js";

type View = "dashboard" | "create" | "join" | "voice";

/**
 * The web front door. A small view state machine rather than a router: logged
 * out shows the Landing hero; logged in, the DID drives everything (create/join
 * a campaign, manage the voice clone). Kept client-side so the whole thing is a
 * static Cloudflare Pages build (docs/hosting.md).
 */
export function App() {
  const session = useSession();
  const [view, setView] = useState<View>("dashboard");

  if (session.loading) {
    return (
      <main style={{ ...styles.main, justifyContent: "center", alignItems: "center" }}>
        <p style={styles.muted}>Finding your seat…</p>
      </main>
    );
  }

  if (!session.player) {
    return <Landing onSignIn={session.signIn} loading={session.loading} />;
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
