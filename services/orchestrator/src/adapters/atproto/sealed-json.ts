/**
 * Seals JSON with AES-GCM before it is written to a database.
 *
 * The AT-Proto OAuth stores hold DPoP private keys and refresh tokens. D1 is
 * encrypted at rest by Cloudflare, but anything that can read rows (a backup, a
 * console query, a leaked API token) would otherwise read those keys in the
 * clear. Sealing them under a Worker secret means a database dump alone is not
 * enough to act as a player.
 *
 * Format: `v1.<iv>.<ciphertext>`, both base64url. The key is SHA-256 of the
 * secret, so any long random string works as `SESSION_SECRET`.
 */
export class SealedJson {
  private readonly key: Promise<Awaited<ReturnType<typeof crypto.subtle.importKey>>>;

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters");
    }
    this.key = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  }

  async seal(value: unknown): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await this.key, plaintext);
    return `v1.${toB64url(iv)}.${toB64url(new Uint8Array(ciphertext))}`;
  }

  /** Returns undefined for anything that does not decrypt: wrong key, tampered, or not sealed. */
  async open<T>(sealed: string): Promise<T | undefined> {
    const [version, iv, body] = sealed.split(".");
    if (version !== "v1" || !iv || !body) return undefined;
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromB64url(iv) },
        await this.key,
        fromB64url(body),
      );
      return JSON.parse(new TextDecoder().decode(plaintext)) as T;
    } catch {
      return undefined;
    }
  }
}

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
