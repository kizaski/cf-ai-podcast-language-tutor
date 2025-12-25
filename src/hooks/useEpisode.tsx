import { useState, useEffect, useCallback } from "react";
import type { Episode, EpisodeData, Insert } from "@/types/audio-types";

// not yet used ...

const API_BASE_URL = import.meta.env.NEXT_PUBLIC_API_BASE_URL || "";

type UseEpisodeParams = {
  episodeId?: string;
  initialData?: EpisodeData;
};

export const useEpisode = ({ episodeId, initialData }: UseEpisodeParams) => {
  const [episode, setEpisode] = useState<EpisodeData | null>(
    initialData ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEpisode = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/episodes/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch episode: ${res.statusText}`);
      }

      const data: EpisodeData = await res.json();
      setEpisode(data);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load episode";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData || !episodeId) return;
    fetchEpisode(episodeId);
  }, [episodeId, initialData, fetchEpisode]);

  const saveEpisode = useCallback(
    async (data: EpisodeData) => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE_URL}/api/episodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });

        if (!res.ok) {
          throw new Error("Failed to save episode");
        }

        const result: Episode = await res.json();

        if (result.id) {
          await fetchEpisode(result.id);
        }

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save episode";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchEpisode]
  );

  const updateInsert = useCallback(
    async (insertId: string, updates: Partial<Insert>) => {
      if (!episode) return;

      setError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/episodes/${episode.episode.id}/inserts/${insertId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates)
          }
        );

        if (!res.ok) {
          throw new Error("Failed to update insert");
        }

        const result: any = await res.json();

        // Server is source of truth, but we can safely patch locally
        if (result.success) {
          setEpisode((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              inserts: prev.inserts.map((insert) =>
                insert.id === insertId ? { ...insert, ...updates } : insert
              )
            };
          });
        }

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update insert";
        setError(message);
        throw err;
      }
    },
    [episode]
  );

  const addInsert = useCallback(
    async (newInsert: Insert) => {
      if (!episode) return;

      setError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/episodes/${episode.episode.id}/inserts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newInsert)
          }
        );

        if (!res.ok) {
          throw new Error("Failed to add insert");
        }

        const savedInsert: Insert = await res.json();

        setEpisode((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            inserts: [...prev.inserts, savedInsert]
          };
        });

        return savedInsert;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to add insert";
        setError(message);
        throw err;
      }
    },
    [episode]
  );

  const listEpisodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/episodes`);
      if (!res.ok) {
        throw new Error(`Failed to list episodes: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      throw err;
    }
  }, []);

  return {
    episode,
    setEpisode,
    isLoading,
    error,

    fetchEpisode,
    saveEpisode,
    updateInsert,
    addInsert,
    listEpisodes
  };
};
