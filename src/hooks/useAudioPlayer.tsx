import { useState, useCallback, useEffect } from "react";
import type { EpisodeData, PlaybackState } from "@/types/audio-types";
import type { useAudioEngine } from "./useAudioEngine";

export const useEnhancedAudioPlayer = (
  initialData: EpisodeData,
  setEpisodeData: (ep: EpisodeData) => void,
  audioEngine: ReturnType<typeof useAudioEngine>
) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    currentTime: 0,
    isPlaying: false,
    volume: 0.8,
    playbackRate: 1.0,
    activeInserts:
      initialData?.inserts.filter((i) => i.enabled).map((i) => i.id) || []
  });

  // Sync with audioEngine state
  useEffect(() => {
    setPlaybackState((prev) => ({
      ...prev,
      isPlaying: audioEngine.isPlaying,
      currentTime: audioEngine.currentTime
    }));
  }, [audioEngine.isPlaying, audioEngine.currentTime]);

  const handlePlayPause = useCallback(() => {
    console.log(audioEngine.hasLoaded);

    if (!audioEngine.hasLoaded) return;

    if (playbackState.isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  }, [audioEngine, playbackState.isPlaying]);

  const handleSeek = useCallback(
    (time: number) => {
      if (!audioEngine.hasLoaded) return;
      audioEngine.seek(Math.min(time, initialData.episode.duration));
    },
    [audioEngine, initialData.episode.duration]
  );

  const handleToggleInsert = useCallback(
    (insertId: string) => {
      const updatedInserts = initialData.inserts.map((insert) =>
        insert.id === insertId
          ? { ...insert, enabled: !insert.enabled }
          : insert
      );
      setEpisodeData({ ...initialData, inserts: updatedInserts });

      setPlaybackState((prev) => {
        const isActive = prev.activeInserts.includes(insertId);
        const newActiveInserts = isActive
          ? prev.activeInserts.filter((id) => id !== insertId)
          : [...prev.activeInserts, insertId];
        return { ...prev, activeInserts: newActiveInserts };
      });
    },
    [audioEngine, initialData, setEpisodeData]
  );

  const handleSkipBackward = useCallback(() => {
    handleSeek(Math.max(0, playbackState.currentTime - 10));
  }, [playbackState.currentTime, handleSeek]);

  const handleSkipForward = useCallback(() => {
    handleSeek(
      Math.min(initialData.episode.duration, playbackState.currentTime + 30)
    );
  }, [playbackState.currentTime, initialData.episode.duration, handleSeek]);

  const handleVolumeChange = useCallback(
    (value: number) => setPlaybackState((prev) => ({ ...prev, volume: value })),
    []
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) =>
      setPlaybackState((prev) => ({ ...prev, playbackRate: rate })),
    []
  );

  const handleToggleInserts = useCallback(() => {
    const allEnabled = initialData.inserts.every((i) => i.enabled);
    const newEnabled = !allEnabled;

    const updatedInserts = initialData.inserts.map((i) => ({
      ...i,
      enabled: newEnabled
    }));

    setEpisodeData({ ...initialData, inserts: updatedInserts });

    const newActiveInserts = newEnabled ? updatedInserts.map((i) => i.id) : [];
    setPlaybackState((prev) => ({ ...prev, activeInserts: newActiveInserts }));
  }, [audioEngine, initialData, setEpisodeData]);

  const handleStop = useCallback(() => {
    audioEngine.pause();
    audioEngine.seek(0);
    setPlaybackState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, [audioEngine]);

  return {
    // State
    episodeData: initialData,
    playbackState,
    hasLoaded: audioEngine.hasLoaded,
    isPlaying: audioEngine.isPlaying,
    currentTime: audioEngine.currentTime,

    // Setters
    setPlaybackState,
    setEpisode: setEpisodeData,

    // Handlers
    handlePlayPause,
    handleSeek,
    handleToggleInsert,
    handleSkipBackward,
    handleSkipForward,
    handleVolumeChange,
    handlePlaybackRateChange,
    handleToggleInserts,
    handleStop,

    // Audio engine access
    audioEngine
    // activeInserts: audioEngine.activeInserts
  };
};
