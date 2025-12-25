import { useState, useRef, useCallback, useEffect } from "react";
import { getAudioContext, decodeAudioBuffer } from "@/lib/utils";
import type { EpisodeData, Insert } from "@/types/audio-types";

interface UseAudioEngineProps {
  episodeData: EpisodeData;
  onTimeUpdate?: (currentTime: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

interface AudioNodeRefs {
  mainSource?: AudioBufferSourceNode;
  insertSource?: AudioBufferSourceNode;
  mainGain?: GainNode;
  insertGain?: GainNode;
}

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  playbackStartTime: number;
  pausedTime: number;
}

export const useAudioEngine = ({
  episodeData,
  onTimeUpdate,
  onPlayStateChange
}: UseAudioEngineProps) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AudioNodeRefs>({});
  const animationRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  // const isPlayingInsertRef = useRef(false);

  // Playback state tracking
  const playbackStateRef = useRef<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    playbackStartTime: 0,
    pausedTime: 0
  });

  // Track which inserts have been played
  const playedInsertsRef = useRef<Set<string>>(new Set());

  // Active inserts that should be played
  // const activeInsertsRef = useRef<Set<string>>(new Set(episodeData.inserts)); // -- bug fix?, on first seek no insert is played
  const activeInsertsRef = useRef<Set<string>>(new Set());

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = getAudioContext();

    return () => {
      // Cleanup on unmount
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      stopPlayback();
    };
  }, []);

  // Load all audio buffers
  const loadAllAudio = useCallback(async () => {
    if (!audioContextRef.current) return;

    setIsLoading(true);
    setLoadProgress(0);

    try {
      const totalToLoad = 1 + episodeData.inserts.length;
      let loadedCount = 0;

      // Load main episode
      const mainBuffer = await decodeAudioBuffer(episodeData.episode.audioUrl);
      loadedCount++;
      setLoadProgress((loadedCount / totalToLoad) * 100);

      // Load all inserts
      const loadedInserts = await Promise.all(
        episodeData.inserts.map(async (insert) => {
          try {
            const buffer = await decodeAudioBuffer(insert.audioUrl);
            loadedCount++;
            setLoadProgress((loadedCount / totalToLoad) * 100);
            return { ...insert, audioBuffer: buffer, hasLoaded: true };
          } catch (error) {
            console.error(`Failed to load insert ${insert.title}:`, error);
            return { ...insert, hasLoaded: false };
          }
        })
      );

      setHasLoaded(true);
      setIsLoading(false);

      return {
        episode: {
          ...episodeData.episode,
          audioBuffer: mainBuffer,
          hasLoaded: true
        },
        inserts: loadedInserts,
        transcript: episodeData.transcript
      };
    } catch (error) {
      console.error("Failed to load audio:", error);
      setIsLoading(false);
      return null;
    }
  }, [episodeData]);

  const startAnimationLoop = useCallback(() => {
    const updateTime = () => {
      if (!audioContextRef.current || !playbackStateRef.current.isPlaying) {
        return;
      }

      const audioContext = audioContextRef.current;
      const playbackState = playbackStateRef.current;

      // Calculate current time
      const currentTime =
        audioContext.currentTime - playbackState.playbackStartTime;
      playbackStateRef.current.currentTime = currentTime;

      // Trigger time update
      onTimeUpdate?.(currentTime);

      // Check for insert triggers
      if (episodeData.inserts && episodeData.episode.audioBuffer) {
        checkForInsertTriggers(currentTime);
      }

      // Continue animation loop
      animationRef.current = requestAnimationFrame(updateTime);
    };

    animationRef.current = requestAnimationFrame(updateTime);
  }, [episodeData.inserts, episodeData.episode.audioBuffer, onTimeUpdate]);

  const stopPlayback = useCallback(() => {
    // Only stop sources if we're actually stopping (not pausing)
    if (!playbackStateRef.current.isPlaying) return;

    // Stop main audio source
    if (nodesRef.current.mainSource) {
      nodesRef.current.mainSource.onended = null;
      try {
        nodesRef.current.mainSource.stop();
      } catch (e) {
        // Source might already be stopped
      }
      nodesRef.current.mainSource = undefined;
    }

    // Stop insert audio source
    if (nodesRef.current.insertSource) {
      nodesRef.current.insertSource.onended = null;
      try {
        nodesRef.current.insertSource.stop();
      } catch (e) {
        // Source might already be stopped
      }
      nodesRef.current.insertSource = undefined;
    }

    // Disconnect gain nodes
    if (nodesRef.current.mainGain) {
      nodesRef.current.mainGain.disconnect();
      nodesRef.current.mainGain = undefined;
    }

    if (nodesRef.current.insertGain) {
      nodesRef.current.insertGain.disconnect();
      nodesRef.current.insertGain = undefined;
    }

    // Stop animation loop
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Reset playback state
    playbackStateRef.current.isPlaying = false;

    onPlayStateChange?.(false);
  }, [onPlayStateChange]);

  // Core playback function
  const playFromTime = useCallback(
    async (startTime: number = 0, activeInsertIds: string[] = []) => {
      if (!audioContextRef.current || !episodeData?.episode?.audioBuffer) {
        console.log("Audio not loaded or context not ready");
        return;
      }

      const audioContext = audioContextRef.current;

      // If we're already playing, stop first
      if (playbackStateRef.current?.isPlaying) {
        stopPlayback();
      }

      // Reset insert tracking for this playback session
      playedInsertsRef.current.clear();
      activeInsertsRef.current = new Set(activeInsertIds || []);

      try {
        // Resume audio context if suspended - this must be the first user interaction
        if (audioContext.state === "suspended" && nodesRef.current.mainSource) {
          await audioContext.resume();

          playbackStateRef.current.isPlaying = true;
          playbackStateRef.current.playbackStartTime =
            audioContext.currentTime - playbackStateRef.current.pausedTime;

          startAnimationLoop();
          onPlayStateChange?.(true);
          return;
        }
        // Create main audio source
        const mainSource = audioContext.createBufferSource();
        const mainGain = audioContext.createGain();

        if (!episodeData.episode.audioBuffer) {
          console.error("Audio buffer is null or undefined");
          return;
        }

        mainSource.buffer = episodeData.episode.audioBuffer;
        mainSource.playbackRate.value = 1.0;

        // Connect audio nodes
        mainSource.connect(mainGain);
        mainGain.connect(audioContext.destination);
        mainGain.gain.value = 1.0;

        // Store references
        nodesRef.current.mainSource = mainSource;
        nodesRef.current.mainGain = mainGain;

        // Calculate actual start time
        const adjustedStartTime = Math.max(0, startTime || 0);

        // Validate start time doesn't exceed buffer duration
        const bufferDuration = episodeData.episode.audioBuffer.duration;
        if (adjustedStartTime >= bufferDuration) {
          console.error("Start time exceeds audio duration");
          return;
        }

        const now = audioContext.currentTime;

        // Start playback
        mainSource.start(0, adjustedStartTime || 0);

        // Update playback state
        playbackStateRef.current = {
          isPlaying: true,
          currentTime: adjustedStartTime,
          playbackStartTime: now - adjustedStartTime,
          pausedTime: 0
        };

        // Start animation loop
        onPlayStateChange?.(true);
        startAnimationLoop();

        // Setup ended handler
        mainSource.onended = () => {
          if (playbackStateRef.current) {
            playbackStateRef.current.isPlaying = false;
            // playbackStateRef.current.currentTime = bufferDuration;
          }

          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }

          // Clean up nodes
          if (nodesRef.current.mainSource) {
            nodesRef.current.mainSource.disconnect();
            nodesRef.current.mainSource = undefined;
          }
          if (nodesRef.current.mainGain) {
            nodesRef.current.mainGain.disconnect();
            nodesRef.current.mainGain = undefined;
          }

          onPlayStateChange?.(false);
        };

        return mainSource;
      } catch (error) {
        console.error("Error starting playback:", error);

        // Reset state on error
        if (playbackStateRef.current) {
          playbackStateRef.current.isPlaying = false;
        }

        onPlayStateChange?.(false);

        // Clean up any created nodes
        if (nodesRef.current.mainSource) {
          nodesRef.current.mainSource.disconnect();
          nodesRef.current.mainSource = undefined;
        }
        if (nodesRef.current.mainGain) {
          nodesRef.current.mainGain.disconnect();
          nodesRef.current.mainGain = undefined;
        }
      }
    },
    [
      episodeData.episode.audioBuffer,
      onPlayStateChange,
      startAnimationLoop,
      stopPlayback
    ]
  );

  const stop = useCallback(() => {
    if (!audioContextRef.current) return;

    // Suspend context first
    audioContextRef.current.suspend();

    // Stop all playback
    stopPlayback();

    // Reset all state
    playbackStateRef.current = {
      isPlaying: false,
      currentTime: 0,
      playbackStartTime: 0,
      pausedTime: 0
    };

    playedInsertsRef.current.clear();

    onTimeUpdate?.(0);
    onPlayStateChange?.(false);
  }, [audioContextRef, stopPlayback, onTimeUpdate, onPlayStateChange]);

  const checkForInsertTriggers = useCallback(
    (currentTime: number) => {
      if (!audioContextRef.current) return;

      // const audioContext = audioContextRef.current;
      const activeInserts = episodeData.inserts.filter(
        (insert) =>
          insert.enabled &&
          insert.audioBuffer &&
          activeInsertsRef.current.has(insert.id) &&
          !playedInsertsRef.current.has(insert.id)
      );

      for (const insert of activeInserts) {
        const timeDiff = Math.abs(currentTime - insert.startTime);

        // Trigger insert if we're within 0.1 seconds of its start time
        if (timeDiff < 0.1 && !playedInsertsRef.current.has(insert.id)) {
          playedInsertsRef.current.add(insert.id);
          playInsertNow(insert);
        }
      }
    },
    [episodeData.inserts]
  );

  const playInsertNow = useCallback((insert: Insert) => {
    if (
      !audioContextRef.current ||
      !insert.audioBuffer ||
      !nodesRef.current.mainGain
    ) {
      return;
    }

    const audioContext = audioContextRef.current;

    // Stop any existing insert
    if (nodesRef.current.insertSource) {
      try {
        nodesRef.current.insertSource.stop();
      } catch (e) {
        // Ignore errors
      }
    }

    // Create insert source
    const insertSource = audioContext.createBufferSource();
    const insertGain = audioContext.createGain();

    insertSource.buffer = insert.audioBuffer!;
    insertSource.connect(insertGain);
    insertGain.connect(audioContext.destination);

    // Set initial volume
    insertGain.gain.value = 1.0;

    // Duck main audio while insert plays
    const mainGain = nodesRef.current.mainGain;
    mainGain.gain.setValueAtTime(1.0, audioContext.currentTime);
    mainGain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.3);

    // Start insert
    insertSource.start();

    // Store references
    nodesRef.current.insertSource = insertSource;
    nodesRef.current.insertGain = insertGain;

    // When insert ends, fade main audio back in
    insertSource.onended = () => {
      if (mainGain && playbackStateRef.current.isPlaying) {
        mainGain.gain.setValueAtTime(0.3, audioContext.currentTime);
        mainGain.gain.linearRampToValueAtTime(
          1.0,
          audioContext.currentTime + 0.3
        );
      }

      // Cleanup insert nodes
      if (nodesRef.current.insertSource === insertSource) {
        nodesRef.current.insertSource = undefined;
        nodesRef.current.insertGain = undefined;
      }
    };
  }, []);

  const play = useCallback(
    async (startTime: number = 0, activeInsertIds: string[] = []) => {
      return playFromTime(startTime, activeInsertIds);
    },
    [playFromTime]
  );

  const pause = useCallback(() => {
    if (!audioContextRef.current || !playbackStateRef.current.isPlaying) return;

    const audioContext = audioContextRef.current;

    // Calculate current playback time
    const currentTime =
      audioContext.currentTime - playbackStateRef.current.playbackStartTime;
    playbackStateRef.current.pausedTime = currentTime;

    // Suspend context without stopping sources
    audioContext.suspend().then(() => {
      if (animationRef.current) {
        playbackStateRef.current.isPlaying = false;
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      onTimeUpdate?.(currentTime);
      onPlayStateChange?.(false);
    });
  }, [onTimeUpdate, onPlayStateChange]);

  const resume = useCallback(async () => {
    if (!audioContextRef.current || playbackStateRef.current.isPlaying) return;

    const audioContext = audioContextRef.current;

    // If main source still exists, just resume context
    if (nodesRef.current.mainSource) {
      console.log("resume");

      await audioContext.resume();

      playbackStateRef.current.isPlaying = true;
      playbackStateRef.current.playbackStartTime =
        audioContext.currentTime - playbackStateRef.current.pausedTime;

      startAnimationLoop();
      onPlayStateChange?.(true);
      return;
    }

    // Otherwise, recreate the source from pausedTime
    const pausedTime = playbackStateRef.current.pausedTime || 0;
    await playFromTime(pausedTime, Array.from(activeInsertsRef.current));
  }, [playFromTime, onPlayStateChange, startAnimationLoop]);

  const seek = useCallback(
    (time: number) => {
      if (!audioContextRef.current) return;

      const clampedTime = Math.max(
        0,
        Math.min(time, episodeData.episode.duration)
      );

      // Stop everything deterministically
      stopPlayback();

      // Reset insert tracking
      playedInsertsRef.current.clear();

      // Update state immediately (UI feels instant)
      playbackStateRef.current.pausedTime = clampedTime;
      playbackStateRef.current.currentTime = clampedTime;
      onTimeUpdate?.(clampedTime);

      // Always play after seek
      playFromTime(clampedTime, Array.from(activeInsertsRef.current));
    },
    [episodeData.episode.duration, stopPlayback, playFromTime, onTimeUpdate]
  );

  const toggleInsert = useCallback(
    (insertId: string) => {
      if (activeInsertsRef.current.has(insertId)) {
        activeInsertsRef.current.delete(insertId);
        // If this insert was already played, remove it from tracking
        playedInsertsRef.current.delete(insertId);
      } else {
        activeInsertsRef.current.add(insertId);
      }

      // If currently playing, we need to restart to apply the change
      if (playbackStateRef.current.isPlaying) {
        const currentTime = playbackStateRef.current.currentTime;
        pause();
        setTimeout(() => {
          playFromTime(currentTime, Array.from(activeInsertsRef.current));
        }, 100);
      }
    },
    [pause, playFromTime]
  );

  return {
    // State
    isLoading,
    loadProgress,
    hasLoaded,
    isPlaying: playbackStateRef.current.isPlaying,
    currentTime: playbackStateRef.current.currentTime,
    nodes: nodesRef.current,
    mainGain: nodesRef.current.mainGain!,

    // Controls
    loadAllAudio,
    play,
    pause,
    resume,
    stop,
    seek,
    toggleInsert,

    // Audio context access
    audioContext: audioContextRef.current,

    // Active inserts
    activeInserts: Array.from(activeInsertsRef.current)
  };
};
