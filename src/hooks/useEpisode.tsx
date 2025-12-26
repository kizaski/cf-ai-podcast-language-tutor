import { useState, useEffect, useCallback } from "react";
import type { EpisodeData } from "@/types/audio-types";
import { useNavigate } from "react-router";

export const API_BASE_URL = import.meta.env.NEXT_PUBLIC_API_BASE_URL || "";

type UseEpisodeParams = {
  episodeId?: string;
  initialData?: EpisodeData;
};

export const useEpisode = ({
  episodeId,
  initialData
}: UseEpisodeParams = {}) => {
  const [episode, setEpisode] = useState<EpisodeData | null>(
    initialData ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();

  const fetchEpisode = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const resEp = await fetch(
        `${API_BASE_URL}/api/episodes/${encodeURIComponent(id)}`
      );
      if (!resEp.ok) {
        throw new Error(`Failed to fetch episode: ${resEp.statusText}`);
      }

      const data: EpisodeData = await resEp.json();
      setEpisode(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load episode");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData || !episodeId) return;
    fetchEpisode(episodeId);
  }, [episodeId, initialData, fetchEpisode]);

  /** Upload first, create episode, and return new episodeId */
  const uploadAndCreateEpisode = useCallback(
    async (
      file: File,
      durationSeconds: number,
      onProgress?: (percent: number) => void
    ) => {
      setIsLoading(true);
      setError(null);

      return new Promise<string>((resolve, reject) => {
        const formData = new FormData();
        formData.append("audio", file);
        formData.append("durationSeconds", durationSeconds.toString());

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE_URL}/api/episodes/upload-audio`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
            setProgress(percent);
          }
        };

        xhr.onload = () => {
          setIsLoading(false);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              const newEpisodeId = res.episode.id;
              if (newEpisodeId) navigate(`/episodes/${newEpisodeId}`);
              resolve(newEpisodeId);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => {
          setIsLoading(false);
          reject(new Error("Upload failed"));
        };

        xhr.send(formData);
      });
    },
    []
  );

  return {
    episode,
    setEpisode,
    isLoading,
    error,
    fetchEpisode,
    progress,
    uploadAndCreateEpisode
  };
};
