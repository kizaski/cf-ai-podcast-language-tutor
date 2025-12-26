import { useState, useRef, useCallback, useEffect } from "react";
import type { EpisodeData, Insert } from "@/types/audio-types";
import { API_BASE_URL } from "./useEpisode";

interface UseAudioEngineProps {
  episodeData: EpisodeData;
  onTimeUpdate?: (currentTime: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

interface AudioNodeRefs {
  insertSource?: MediaElementAudioSourceNode;
  mainGain?: GainNode;
  insertGain?: GainNode;
}

export const useAudioEngine = ({
  episodeData,
  onTimeUpdate,
  onPlayStateChange
}: UseAudioEngineProps) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const nodesRef = useRef<AudioNodeRefs>({});
  const animationRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio) return;

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStateChange?.(true);
    };

    const handleTimeUpdate = () => {
      const currentTime = Math.min(
        audio.currentTime,
        episodeData.episode.duration
      );
      setCurrentTime(currentTime);
      onTimeUpdate?.(currentTime);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [episodeData, onTimeUpdate, onPlayStateChange]);

  const playedInsertsRef = useRef<Set<string>>(new Set());
  const activeInsertsRef = useRef<Set<string>>(new Set());

  // Initialize AudioContext and main audio element
  useEffect(() => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const audioEl = new Audio(
      `${API_BASE_URL}/api/r2/${encodeURIComponent(episodeData.episode.audioUrl)}`
    );
    audioEl.crossOrigin = "anonymous";
    audioEl.preload = "auto";
    audioElRef.current = audioEl;

    // Create Web Audio node chain
    const source = ctx.createMediaElementSource(audioEl);
    const mainGain = ctx.createGain();
    source.connect(mainGain).connect(ctx.destination);
    nodesRef.current.mainGain = mainGain;

    audioEl.addEventListener("loadedmetadata", () => {
      episodeData.episode.duration = audioEl.duration;
      setHasLoaded(true);
    });

    audioEl.addEventListener("timeupdate", () => {
      setCurrentTime(audioEl.currentTime);
      onTimeUpdate?.(audioEl.currentTime);
      checkForInsertTriggers(audioEl.currentTime);
    });

    return () => {
      audioEl.pause();
      audioEl.src = "";
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      ctx.close();
    };
  }, [episodeData.episode.audioUrl, onTimeUpdate]);

  const checkForInsertTriggers = useCallback(
    (currentTime: number) => {
      const activeInserts = episodeData.inserts.filter(
        (insert) =>
          insert.enabled &&
          activeInsertsRef.current.has(insert.id) &&
          !playedInsertsRef.current.has(insert.id)
      );

      for (const insert of activeInserts) {
        if (Math.abs(currentTime - insert.startTime) < 0.1) {
          playedInsertsRef.current.add(insert.id);
          playInsert(insert);
        }
      }
    },
    [episodeData.inserts]
  );

  const playInsert = useCallback((insert: Insert) => {
    console.log("playing insert...");

    const ctx = audioContextRef.current;
    if (!ctx || !insert.audioUrl || !nodesRef.current.mainGain) return;
    console.log(insert);

    const insertEl = new Audio(
      `${API_BASE_URL}/api/r2/${encodeURIComponent(insert.audioUrl)}`
    );
    console.log(insertEl);

    insertEl.crossOrigin = "anonymous";
    insertEl.preload = "auto";
    const insertSource = ctx.createMediaElementSource(insertEl);
    const insertGain = ctx.createGain();

    insertSource.connect(insertGain).connect(ctx.destination);

    // Duck main audio
    const mainGain = nodesRef.current.mainGain;
    mainGain.gain.setValueAtTime(1, ctx.currentTime);
    mainGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.3);

    insertEl.play();

    insertEl.onended = () => {
      // Restore main audio
      mainGain.gain.setValueAtTime(0.3, ctx.currentTime);
      mainGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.3);
    };
  }, []);

  const play = useCallback(() => {
    const ctx = audioContextRef.current;
    const audioEl = audioElRef.current;
    if (!ctx || !audioEl) return;

    if (ctx.state === "suspended") ctx.resume();
    audioEl.play();
    setIsPlaying(true);
    onPlayStateChange?.(true);
  }, [onPlayStateChange]);

  const pause = useCallback(() => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;

    audioEl.pause();
    setIsPlaying(false);
    onPlayStateChange?.(false);
  }, [onPlayStateChange]);

  const seek = useCallback(
    (time: number) => {
      const audioEl = audioElRef.current;
      if (!audioEl) return;

      audioEl.currentTime = Math.min(time, audioEl.duration);
      setCurrentTime(audioEl.currentTime);
      onTimeUpdate?.(audioEl.currentTime);
    },
    [onTimeUpdate]
  );

  const toggleInsert = useCallback((insertId: string) => {
    if (activeInsertsRef.current.has(insertId)) {
      activeInsertsRef.current.delete(insertId);
      playedInsertsRef.current.delete(insertId);
    } else {
      activeInsertsRef.current.add(insertId);
    }
  }, []);

  return {
    // State
    hasLoaded,
    isPlaying: isPlaying,
    currentTime: currentTime,

    // Controls
    play,
    pause,
    seek,
    toggleInsert,

    // Active inserts
    activeInserts: Array.from(activeInsertsRef.current)
  };
};
