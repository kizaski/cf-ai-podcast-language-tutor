import { useState, useCallback } from "react";
import type { Insert, EpisodeData, PlaybackState } from "@/types/audio-types";

const INITIAL_PLAYBACK_STATE: PlaybackState = {
  currentTime: 0,
  isPlaying: false,
  volume: 0.8,
  playbackRate: 1.0,
  activeInserts: []
};

export const useAudioPlayer = (initialData: EpisodeData) => {
  const [episodeData, setEpisodeData] = useState<EpisodeData>(initialData);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    ...INITIAL_PLAYBACK_STATE,
    activeInserts: initialData.inserts.filter((i) => i.enabled).map((i) => i.id)
  });

  const handlePlayPause = useCallback(() => {
    setPlaybackState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const handleSeek = useCallback((time: number) => {
    setPlaybackState((prev) => ({ ...prev, currentTime: time }));
  }, []);

  const handleToggleInsert = useCallback((insertId: string) => {
    setEpisodeData((prev) => ({
      ...prev,
      inserts: prev.inserts.map((insert) =>
        insert.id === insertId
          ? { ...insert, enabled: !insert.enabled }
          : insert
      )
    }));

    setPlaybackState((prev) => {
      const isCurrentlyActive = prev.activeInserts.includes(insertId);
      if (isCurrentlyActive) {
        return {
          ...prev,
          activeInserts: prev.activeInserts.filter((id) => id !== insertId)
        };
      } else {
        return {
          ...prev,
          activeInserts: [...prev.activeInserts, insertId]
        };
      }
    });
  }, []);

  const handleSkipBackward = useCallback(() => {
    setPlaybackState((prev) => ({
      ...prev,
      currentTime: Math.max(0, prev.currentTime - 10)
    }));
  }, []);

  const handleSkipForward = useCallback(() => {
    setPlaybackState((prev) => ({
      ...prev,
      currentTime: Math.min(episodeData.episode.duration, prev.currentTime + 30)
    }));
  }, [episodeData.episode.duration]);

  const handleVolumeChange = useCallback((value: number) => {
    setPlaybackState((prev) => ({
      ...prev,
      volume: value
    }));
  }, []);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackState((prev) => ({
      ...prev,
      playbackRate: rate
    }));
  }, []);

  const handleToggleInserts = useCallback(() => {
    const allEnabled = episodeData.inserts.every((insert) => insert.enabled);

    setEpisodeData((prev) => ({
      ...prev,
      inserts: prev.inserts.map((insert) => ({
        ...insert,
        enabled: !allEnabled
      }))
    }));

    setPlaybackState((prev) => ({
      ...prev,
      activeInserts: !allEnabled
        ? episodeData.inserts.map((insert) => insert.id)
        : []
    }));
  }, [episodeData.inserts]);

  const handleAddInsert = useCallback((newInsert: Insert) => {
    setEpisodeData((prev) => ({
      ...prev,
      inserts: [...prev.inserts, newInsert]
    }));

    setPlaybackState((prev) => ({
      ...prev,
      activeInserts: [...prev.activeInserts, newInsert.id]
    }));
  }, []);

  const handleAddInsertAtTime = useCallback(
    (time: number) => {
      // In a real app, this would open a form or modal
      // For now, create a dummy insert
      const newInsert: Insert = {
        id: `insert_${Date.now()}`,
        type: "primer_intro",
        title: "New Insert",
        audioUrl: "https://example.com/inserts/new_insert.mp3",
        duration: 60,
        startTime: time,
        endTime: time + 60,
        enabled: true,
        metadata: {
          category: "custom",
          created: new Date().toISOString()
        }
      };

      handleAddInsert(newInsert);
    },
    [handleAddInsert]
  );

  return {
    episodeData,
    playbackState,
    setEpisodeData,
    setPlaybackState,
    handlePlayPause,
    handleSeek,
    handleToggleInsert,
    handleSkipBackward,
    handleSkipForward,
    handleVolumeChange,
    handlePlaybackRateChange,
    handleToggleInserts,
    handleAddInsert,
    handleAddInsertAtTime
  };
};
