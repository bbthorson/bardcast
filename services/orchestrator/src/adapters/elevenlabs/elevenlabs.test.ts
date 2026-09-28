import { describe, expect, it } from "vitest";
import { ElevenLabsVoiceCloner } from "./voice-cloner.js";
import { ElevenLabsAudioRenderer } from "./audio-renderer.js";

describe("ElevenLabs Adapters", () => {
  describe("ElevenLabsVoiceCloner", () => {
    it("creates an instant voice clone via POST /v1/voices/add", async () => {
      let requestedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      const mockFetch: typeof fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        if (url.includes("sample-audio.webm")) {
          return new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: { "content-type": "audio/webm" },
          });
        }
        if (url.endsWith("/v1/voices/add")) {
          requestedUrl = url;
          capturedHeaders = (init?.headers as Record<string, string>) || {};
          capturedBody = init?.body;
          return new Response(JSON.stringify({ voice_id: "el_ivc_voice_999" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      };

      const cloner = new ElevenLabsVoiceCloner({
        apiKey: "test_xi_api_key_123",
        fetchImpl: mockFetch,
      });

      const voiceId = await cloner.createIvc({
        characterId: "gawain",
        sampleAudioUrls: ["https://example.com/sample-audio.webm"],
      });

      expect(voiceId).toBe("el_ivc_voice_999");
      expect(requestedUrl).toBe("https://api.elevenlabs.io/v1/voices/add");
      expect(capturedHeaders["xi-api-key"]).toBe("test_xi_api_key_123");
      expect(capturedBody).not.toBeNull();
      expect(capturedBody?.get("name")).toBe("bardcast-gawain");
    });

    it("links a shared PVC via sharing URL", async () => {
      let requestedUrl = "";
      let capturedHeaders: Record<string, string> = {};

      const mockFetch: typeof fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        if (url.includes("/v1/voices/add/user_pub_456/voice_pvc_789")) {
          requestedUrl = url;
          capturedHeaders = (init?.headers as Record<string, string>) || {};
          return new Response(JSON.stringify({ voice_id: "voice_pvc_789" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      };

      const cloner = new ElevenLabsVoiceCloner({
        apiKey: "test_xi_api_key_123",
        fetchImpl: mockFetch,
      });

      const voiceId = await cloner.linkSharedPvc({
        sharingLink: "https://elevenlabs.io/app/voice-lab/share/user_pub_456/voice_pvc_789",
      });

      expect(voiceId).toBe("voice_pvc_789");
      expect(requestedUrl).toBe("https://api.elevenlabs.io/v1/voices/add/user_pub_456/voice_pvc_789");
      expect(capturedHeaders["xi-api-key"]).toBe("test_xi_api_key_123");
    });

    it("revokes a voice model via DELETE /v1/voices/{voice_id}", async () => {
      let deletedUrl = "";

      const mockFetch: typeof fetch = async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        if (url.includes("/v1/voices/voice_pvc_789")) {
          deletedUrl = url;
          return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      };

      const cloner = new ElevenLabsVoiceCloner({
        apiKey: "test_xi_api_key_123",
        fetchImpl: mockFetch,
      });

      await cloner.revoke("elevenlabs-voice:voice_pvc_789");
      expect(deletedUrl).toBe("https://api.elevenlabs.io/v1/voices/voice_pvc_789");
    });
  });

  describe("ElevenLabsAudioRenderer", () => {
    it("renders multi-voice dialogue and stitches audio chunks into audioRef", async () => {
      const calls: Array<{ url: string; body: any; headers: any }> = [];

      const mockFetch: typeof fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const body = init?.body ? JSON.parse(init.body as string) : null;
        calls.push({ url, body, headers: init?.headers });

        // Return a mock audio mp3 chunk
        const chunk = new Uint8Array([0xff, 0xfb, 0x90, 0x64]); // MPEG header prefix
        return new Response(chunk, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      };

      const storedAudio: Array<{ key: string; length: number; contentType: string }> = [];
      const mockStorage = {
        async storeAudio(key: string, buffer: Uint8Array, contentType: string) {
          storedAudio.push({ key, length: buffer.length, contentType });
          return `https://r2.bardcast.dev/${key}`;
        },
      };

      const renderer = new ElevenLabsAudioRenderer({
        apiKey: "test_xi_api_key_123",
        defaultNarratorVoiceId: "narrator_voice_default",
        storage: mockStorage,
        fetchImpl: mockFetch,
      });

      const result = await renderer.render({
        transcript: "The road stretches on. Gawain speaks.",
        script: [
          { speaker: "narrator", text: "The tavern was warm." },
          { speaker: "gawain", text: "I must ride north." },
          { speaker: "narrator", text: "And he departed." },
        ],
        voices: {
          gawain: "voice_gawain_cloned",
        },
      });

      expect(calls).toHaveLength(3);
      // Line 1: narrator voice
      expect(calls[0]?.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/narrator_voice_default");
      expect(calls[0]?.body.text).toBe("The tavern was warm.");
      // Line 2: gawain cloned voice
      expect(calls[1]?.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice_gawain_cloned");
      expect(calls[1]?.body.text).toBe("I must ride north.");
      // Line 3: narrator voice
      expect(calls[2]?.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/narrator_voice_default");

      // Verify stored audio
      expect(storedAudio).toHaveLength(1);
      expect(storedAudio[0]?.length).toBe(12); // 3 chunks * 4 bytes each = 12 bytes stitched
      expect(storedAudio[0]?.contentType).toBe("audio/mpeg");
      expect(result.audioRef).toMatch(/^https:\/\/r2\.bardcast\.dev\/chapters\/chapter-/);
      expect(result.durationSeconds).toBeGreaterThan(0);
    });

    it("falls back to base64 data URI when storage is not configured", async () => {
      const mockFetch: typeof fetch = async () => {
        const chunk = new Uint8Array([10, 20, 30]);
        return new Response(chunk, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      };

      const renderer = new ElevenLabsAudioRenderer({
        apiKey: "test_xi_api_key_123",
        fetchImpl: mockFetch,
      });

      const result = await renderer.render({
        transcript: "Simple narrative line.",
        voices: {},
      });

      expect(result.audioRef).toMatch(/^data:audio\/mpeg;base64,/);
    });
  });
});
