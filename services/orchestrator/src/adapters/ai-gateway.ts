/**
 * Cloudflare AI Gateway: a pass-through in front of an AI provider's own API
 * that adds logging, caching, rate limits and retries, and puts the spend in
 * the Cloudflare dashboard next to Workers AI. Requests keep the provider's
 * paths and auth; only the base URL changes.
 */
export interface AiGatewayConfig {
  accountId: string;
  gatewayId: string;
  /** Only for an authenticated gateway: sent as `cf-aig-authorization`. */
  token?: string;
}

/** The gateway's base URL for one provider, e.g. `elevenlabs`. Append the provider's own path. */
export function aiGatewayBaseUrl(gateway: AiGatewayConfig, provider: string): string {
  return `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(gateway.accountId)}/${encodeURIComponent(gateway.gatewayId)}/${provider}`;
}

/** Headers the gateway itself reads. Empty for an open gateway. */
export function aiGatewayHeaders(gateway: Pick<AiGatewayConfig, "token"> | undefined): Record<string, string> {
  return gateway?.token ? { "cf-aig-authorization": `Bearer ${gateway.token}` } : {};
}
