import { useState } from "react";

const MAX_DURATION_SECONDS = 2.5 * 60 * 60;

export function useAudioFile() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getAudioDuration = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";

      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };

      audio.onerror = () => reject(new Error("Invalid audio"));
      audio.src = URL.createObjectURL(file);
    });

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith("audio/")) {
      setError("Please upload an audio file.");
      return;
    }

    try {
      const audioDuration = await getAudioDuration(selected);

      if (audioDuration > MAX_DURATION_SECONDS) {
        setError("Audio exceeds 2 hours 30 minutes.");
        return;
      }

      setFile(selected);
      setDuration(audioDuration);
      setError(null);
    } catch {
      setError("Unable to read audio duration.");
    }
  };

  const reset = () => {
    setFile(null);
    setDuration(null);
    setError(null);
  };

  return {
    file,
    duration,
    error,
    onFileChange,
    reset
  };
}
