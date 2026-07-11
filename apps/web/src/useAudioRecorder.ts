import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "recorded";

/**
 * Minimal MediaRecorder hook for capturing a voice-clone sample. Same shape as
 * the player app's recorder — the front door reuses the pattern rather than
 * inventing a second one. Kept small and dependency-free.
 *
 * TODO(bardcast): share one recorder hook across apps once there's a home for
 * shared browser utilities; handle permission-denial UX and cap duration.
 */
export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType }));
        setDurationMs(Date.now() - startedAtRef.current);
        setState("recorded");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");
    } catch {
      setError("We couldn't reach your microphone. Check the browser's permission and try again.");
    }
  }, []);

  const stop = useCallback(() => recorderRef.current?.stop(), []);

  // Stop the mic if we unmount mid-recording — otherwise the browser's
  // recording indicator stays lit and the stream leaks.
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        try {
          recorderRef.current.stop();
        } catch {
          /* already stopped */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setDurationMs(0);
    setState("idle");
    setError(null);
  }, []);

  return { state, durationMs, blob, error, start, stop, reset };
}
