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
import { CampaignProgress } from "./screens/CampaignProgress.js";
import { CharacterSheet } from "./screens/CharacterSheet.js";
import { campaign, characters, party } from "./fixtures/gawain.js";

/** Routes for the signed-in views. Home ("/") is the dashboard. */
const path = {
  home: "/",
  create: "/campaigns/new",
  join: "/join",
  voice: "/voice",
  campaign: `/campaigns/${campaign.id}`,
  character: (id: string) => `/campaigns/${campaign.id}/characters/${id}`,
} as const;
const CHARACTER_ROUTE = new RegExp(`^/campaigns/${campaign.id}/characters/([a-z0-9-]+)$`);

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
            // The always-present twin of the hero CTA — quieter (felt) so the
            // hero keeps the single candle.
            <button style={styles.compact} onClick={() => setShowLogin(true)}>
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
  const characterId = CHARACTER_ROUTE.exec(router.path)?.[1];

  return (
    <main style={styles.main}>
      <TopBar
        onHome={() => navigate(path.home)}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {session.simulated && (
              <span style={styles.meta} title="No orchestrator reachable — signed in with a local stand-in session.">
                demo session
              </span>
            )}
            <button style={styles.quiet} onClick={() => { navigate(path.home); session.signOut(); }}>
              Sign out
            </button>
          </div>
        }
      />

      {router.path === path.campaign ? (
        <CampaignProgress
          // TODO(bardcast): open the player app's recorder for this prompt.
          onAnswer={() => undefined}
          onOpenCharacter={(id) => navigate(path.character(id))}
        />
      ) : characterId && characters[characterId] ? (
        <CharacterSheet
          character={characters[characterId]}
          hue={party.find((p) => p.id === characterId)?.hue ?? 35}
          chapterLabel={`Sir Gawain · Ch. ${campaign.currentChapter}`}
          onBack={back}
        />
      ) : router.path === path.create ? (
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
          onOpenCampaign={() => navigate(path.campaign)}
        />
      )}
    </main>
  );
}
