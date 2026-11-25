import {
  RPG_ACTOR_SPRITE_DEFAULTS,
  type RpgActorEmoteState,
  type RpgActorSpriteView,
} from "@bardcast/domain";
import { useEffect, useState, type CSSProperties } from "react";

export type SpriteDirection = "down" | "left" | "right" | "up";

const DIRECTION_ROW: Record<SpriteDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

/**
 * Renders an `actor.rpg.sprite` sheet (144×192 PNG, 3×4 grid, 48×48 frames)
 * using crisp pixel-art CSS positioning — adapted from `web-rpg-actor` CSS.
 *
 * Supports directional facing, walk cycles (`[0, 1, 2, 1]` at 150ms), and
 * `emotes.*.talkSheet` swapping so the same component works as a profile token
 * today and as a talking/walking party sprite along a podcast trail tomorrow.
 */
export function RpgActorSprite({
  sprite,
  size = 48,
  direction = "down",
  walking = false,
  emote,
  talking = false,
  alt = "rpg.actor character sprite",
  style,
}: {
  sprite: RpgActorSpriteView;
  size?: number;
  direction?: SpriteDirection;
  walking?: boolean;
  emote?: RpgActorEmoteState;
  talking?: boolean;
  alt?: string;
  style?: CSSProperties;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!walking) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % RPG_ACTOR_SPRITE_DEFAULTS.walkOrder.length);
    }, RPG_ACTOR_SPRITE_DEFAULTS.frameDurationMs);
    return () => window.clearInterval(timer);
  }, [walking]);

  const col = walking
    ? RPG_ACTOR_SPRITE_DEFAULTS.walkOrder[stepIndex]!
    : Math.min(RPG_ACTOR_SPRITE_DEFAULTS.idleFrame, sprite.columns - 1);
  const row = Math.min(DIRECTION_ROW[direction], sprite.rows - 1);

  const emoteEntry = emote ? sprite.emotes?.[emote] : undefined;
  const activeUrl =
    (talking && emoteEntry?.talkUrl) || emoteEntry?.emoteUrl || sprite.sheetUrl;

  const scale = size / sprite.frameHeight;
  const width = Math.round(sprite.frameWidth * scale);
  const height = Math.round(sprite.frameHeight * scale);
  const bgWidth = Math.round(sprite.frameWidth * sprite.columns * scale);
  const bgHeight = Math.round(sprite.frameHeight * sprite.rows * scale);

  return (
    <span
      role="img"
      aria-label={alt}
      style={{
        display: "inline-block",
        flex: "none",
        width,
        height,
        backgroundImage: `url(${activeUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${bgWidth}px ${bgHeight}px`,
        backgroundPosition: `${-col * width}px ${-row * height}px`,
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}
