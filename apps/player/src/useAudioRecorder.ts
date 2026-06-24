import { useCallback, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "recorded";

/**
 * Minimal MediaRecorder hook for capturing a reply. The voice-capture primitive
 * the whole product depends on — kept small and dependency-free.
 *
 * TODO(bardcast): handle permission denial UX, pick the best supported mimeType,
 * and cap duration.
 */
export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      setBlob(new Blob(chunksRef.current, { type: recorder.mimeType }));
      setDurationMs(Date.now() - startedAtRef.current);
      setState("recorded");
      stream.getTracks().forEach((t) => t.stop());
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start();
    setState("recording");
  }, []);

  const stop = useCallback(() => recorderRef.current?.stop(), []);

  const reset = useCallback(() => {
    setBlob(null);
    setDurationMs(0);
    setState("idle");
  }, []);

  return { state, durationMs, blob, start, stop, reset };
}
