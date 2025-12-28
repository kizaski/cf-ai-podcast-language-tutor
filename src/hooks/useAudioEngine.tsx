import { useState, useRef, useCallback, useEffect } from "react";
import type { EpisodeData, Insert } from "@/types/audio-types";

type InsertMode = "overlap" | "pre";

interface UseAudioEngineProps {
  episodeData: EpisodeData;
  onTimeUpdate?: (currentTime: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  insertMode?: InsertMode;
}
interface InsertBuffer {
  buffer: AudioBuffer;
  insert: Insert;
}

// TODO -- on pause, pause current inserted clip audio as well (and on resume, resume it)
export const useAudioEngine = ({
  episodeData,
  onTimeUpdate,
  onPlayStateChange,
  insertMode = "overlap" // TODO -- fix "pre" - plays main audio in background
}: UseAudioEngineProps) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainGainRef = useRef<GainNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const [hasLoaded, setHasLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Store loaded AudioBuffers for inserts
  const insertBuffersRef = useRef<Map<string, InsertBuffer>>(new Map());

  // Currently playing insert source nodes
  const activeInsertSourcesRef = useRef<
    Map<
      string,
      {
        source: AudioBufferSourceNode;
        gain: GainNode;
        startedAt: number;
        duration: number;
      }
    >
  >(new Map());

  // Queue for sequential playback
  const insertQueueRef = useRef<
    Array<{ insertId: string; buffer: AudioBuffer }>
  >([]);

  // Track triggered inserts
  const triggeredInsertsRef = useRef<Set<string>>(new Set());

  /* ---------- INIT (ONCE) ---------- */
  useEffect(() => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";

    audio.addEventListener("loadedmetadata", () => {
      episodeData.episode.duration = audio.duration;
      setHasLoaded(true);
    });

    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = 1;

    source.connect(gain).connect(ctx.destination);

    audio.oncanplaythrough = () => setHasLoaded(true);

    mainAudioRef.current = audio;
    mainGainRef.current = gain;

    return () => {
      // Stop all insert sources
      activeInsertSourcesRef.current.forEach(({ source }) => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {
          // Source might already be stopped
        }
      });
      activeInsertSourcesRef.current.clear();

      // Cleanup main audio
      audio.pause();
      ctx.close();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  /* ---------- LOAD EPISODE ---------- */
  useEffect(() => {
    if (!mainAudioRef.current) return;

    setHasLoaded(false);
    mainAudioRef.current.src = `/api/r2/${episodeData.episode.audioUrl}`;
    mainAudioRef.current.load();

    // Reset triggered inserts when episode changes
    triggeredInsertsRef.current.clear();
    insertQueueRef.current = [];

    // Stop any playing inserts
    activeInsertSourcesRef.current.forEach(({ source }) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Ignore
      }
    });
    activeInsertSourcesRef.current.clear();
  }, [episodeData.episode.audioUrl]);

  /* ---------- PRELOAD INSERT BUFFERS ---------- */
  useEffect(() => {
    if (!audioContextRef.current) return;

    // Load inserts in background
    episodeData.inserts.forEach(async (insert) => {
      if (!insert.enabled || insertBuffersRef.current.has(insert.id)) return;

      try {
        const buffer = await loadAudioBuffer(insert.audioUrl);
        if (buffer) {
          insertBuffersRef.current.set(insert.id, {
            buffer,
            insert
          });
        }
      } catch (error) {
        console.error(`Failed to load insert ${insert.id}:`, error);
      }
    });

    // Clean up buffers for inserts no longer in episodeData
    const currentInsertIds = new Set(episodeData.inserts.map((i) => i.id));
    for (const [id] of insertBuffersRef.current) {
      if (!currentInsertIds.has(id)) {
        insertBuffersRef.current.delete(id);
      }
    }
  }, [episodeData.inserts]);

  /* ---------- LOAD AUDIO BUFFER UTILITY ---------- */
  const loadAudioBuffer = useCallback(
    async (audioUrl: string): Promise<AudioBuffer | null> => {
      if (!audioContextRef.current || !audioUrl) return null;

      try {
        const response = await fetch(`/api/r2/${audioUrl}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        return await audioContextRef.current.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.error(`Failed to load audio ${audioUrl}:`, error);
        return null;
      }
    },
    []
  );

  /* ---------- TIME LOOP ---------- */
  const startAnimationLoop = useCallback(() => {
    const loop = () => {
      if (mainAudioRef.current && isPlaying) {
        const currentTime = mainAudioRef.current.currentTime;
        setCurrentTime(currentTime);
        onTimeUpdate?.(currentTime);

        // Check for inserts to trigger
        episodeData.inserts.forEach((insert) => {
          const bufferData = insertBuffersRef.current.get(insert.id);

          if (
            insert.enabled &&
            bufferData &&
            !triggeredInsertsRef.current.has(insert.id) &&
            !activeInsertSourcesRef.current.has(insert.id) &&
            currentTime >= insert.startTime &&
            currentTime < insert.endTime
          ) {
            // Mark as triggered
            triggeredInsertsRef.current.add(insert.id);

            // Add to queue for sequential playback
            insertQueueRef.current.push({
              insertId: insert.id,
              buffer: bufferData.buffer
            });

            // If no insert is currently playing, start playing from queue
            if (activeInsertSourcesRef.current.size === 0) {
              playNextInsertInQueue();
            }
          }

          // Reset triggered state if we've passed the insert
          if (currentTime < insert.startTime) {
            triggeredInsertsRef.current.delete(insert.id);

            // Also remove from queue if it hasn't played yet
            insertQueueRef.current = insertQueueRef.current.filter(
              (item) => item.insertId !== insert.id
            );
          }
        });

        animationRef.current = requestAnimationFrame(loop);
      }
    };

    // Clear any existing loop
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    animationRef.current = requestAnimationFrame(loop);
  }, [isPlaying, onTimeUpdate, episodeData.inserts]);

  /* ---------- QUEUE MANAGEMENT ---------- */
  const playNextInsertInQueue = useCallback(async () => {
    if (!audioContextRef.current || !mainGainRef.current) return;

    const ctx = audioContextRef.current;

    // Get next insert from queue
    const nextItem = insertQueueRef.current.shift();
    if (!nextItem) return;

    const { insertId, buffer } = nextItem;
    const insert = episodeData.inserts.find((i) => i.id === insertId);

    if (!insert || activeInsertSourcesRef.current.has(insertId)) {
      // Try next in queue
      playNextInsertInQueue();
      return;
    }

    // Duck main audio
    const mainGain = mainGainRef.current;
    const now = ctx.currentTime;

    mainGain.gain.cancelScheduledValues(now);
    mainGain.gain.setValueAtTime(1, now);
    mainGain.gain.linearRampToValueAtTime(0.3, now + 0.1);

    // Create insert source
    const source = ctx.createBufferSource();
    const insertGain = ctx.createGain();
    insertGain.gain.value = 1;

    source.buffer = buffer;
    source.connect(insertGain).connect(ctx.destination);

    // Store reference
    activeInsertSourcesRef.current.set(insertId, {
      source,
      gain: insertGain,
      startedAt: now,
      duration: buffer.duration
    });

    // Start playback
    source.start();

    // Set up onended handler
    source.onended = () => {
      // Remove from active sources
      activeInsertSourcesRef.current.delete(insertId);

      // Restore main audio volume
      if (mainGain) {
        const endTime = ctx.currentTime;
        mainGain.gain.cancelScheduledValues(endTime);
        mainGain.gain.setValueAtTime(0.3, endTime);
        mainGain.gain.linearRampToValueAtTime(1, endTime + 0.3);
      }

      // Clean up nodes
      source.disconnect();
      insertGain.disconnect();

      // Play next in queue
      playNextInsertInQueue();
    };
  }, [episodeData.inserts]);

  /* ---------- INSERT CONTROLS ---------- */
  const playInsertNow = useCallback(
    (insertId: string) => {
      if (!audioContextRef.current || !mainGainRef.current) return;

      const bufferData = insertBuffersRef.current.get(insertId);
      const insert = episodeData.inserts.find((i) => i.id === insertId);

      if (
        !bufferData ||
        !insert?.enabled ||
        activeInsertSourcesRef.current.has(insertId)
      ) {
        return;
      }

      const ctx = audioContextRef.current;

      // Duck main audio
      const mainGain = mainGainRef.current;
      const now = ctx.currentTime;

      mainGain.gain.cancelScheduledValues(now);
      mainGain.gain.setValueAtTime(1, now);
      mainGain.gain.linearRampToValueAtTime(0.3, now + 0.1);

      // Create insert source
      const source = ctx.createBufferSource();
      const insertGain = ctx.createGain();
      insertGain.gain.value = 1;

      source.buffer = bufferData.buffer;
      source.connect(insertGain).connect(ctx.destination);

      // Store reference
      activeInsertSourcesRef.current.set(insertId, {
        source,
        gain: insertGain,
        startedAt: now,
        duration: bufferData.buffer.duration
      });

      // Start playback
      source.start();

      // Set up onended handler
      source.onended = () => {
        activeInsertSourcesRef.current.delete(insertId);

        // Restore main audio
        if (mainGain) {
          const endTime = ctx.currentTime;
          mainGain.gain.cancelScheduledValues(endTime);
          mainGain.gain.setValueAtTime(0.3, endTime);
          mainGain.gain.linearRampToValueAtTime(1, endTime + 0.3);
        }

        // Clean up nodes
        source.disconnect();
        insertGain.disconnect();
      };
    },
    [episodeData.inserts]
  );

  const playWithInsertPauses = useCallback(async () => {
    if (!mainAudioRef.current || !audioContextRef.current) return;

    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    const inserts = episodeData.inserts
      .filter((i) => i.enabled)
      .sort((a, b) => a.startTime - b.startTime); // ensure chronological order

    let lastTime = 0;

    for (const insert of inserts) {
      const waitTime = insert.startTime - lastTime;
      if (waitTime > 0) {
        // Play main audio for the interval until next insert
        mainAudioRef.current.currentTime = lastTime;
        await mainAudioRef.current.play();

        // Wait until insert start time
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            mainAudioRef.current?.pause();
            resolve();
          }, waitTime * 1000);
        });
      }

      // Play insert
      let bufferData: InsertBuffer | undefined;

      await new Promise<void>((resolve) => {
        playInsertNow(insert.id);

        const data = insertBuffersRef.current.get(insert.id);
        if (data) {
          bufferData = data as InsertBuffer;
          setTimeout(resolve, bufferData.buffer.duration * 1000);
        } else {
          resolve();
        }
      });

      lastTime = insert.startTime + (bufferData?.buffer.duration ?? 0);
    }

    // Resume main audio after last insert
    mainAudioRef.current.currentTime = lastTime;
    await mainAudioRef.current.play();
  }, [episodeData.inserts, playInsertNow]);

  const stopAllInserts = useCallback(() => {
    // Stop all active insert sources
    activeInsertSourcesRef.current.forEach(({ source }) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Ignore
      }
    });
    activeInsertSourcesRef.current.clear();

    // Clear queue
    insertQueueRef.current = [];

    // Restore main audio volume
    if (mainGainRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      mainGainRef.current.gain.cancelScheduledValues(now);
      mainGainRef.current.gain.setValueAtTime(1, now);
    }
  }, []);

  // Sync audio context with main audio play state
  useEffect(() => {
    if (isPlaying && audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, [isPlaying]);

  // Update animation loop when isPlaying changes
  useEffect(() => {
    if (isPlaying) {
      startAnimationLoop();
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, [isPlaying, startAnimationLoop]);

  /* ---------- CONTROLS ---------- */
  const play = useCallback(async () => {
    if (!mainAudioRef.current || !audioContextRef.current) return;

    const ctx = audioContextRef.current;

    if (ctx.state === "suspended") await ctx.resume();

    if (insertMode === "pre") {
      await playWithInsertPauses();
      return; // main audio will already play inside playWithInsertPauses
    }

    // Play main audio
    await mainAudioRef.current.play();
    setIsPlaying(true);
    onPlayStateChange?.(true);

    if (insertMode === "overlap") {
      startAnimationLoop();
    }
  }, [
    episodeData.inserts,
    insertMode,
    playInsertNow,
    onPlayStateChange,
    startAnimationLoop
  ]);

  const pause = useCallback(() => {
    // Pause main audio
    mainAudioRef.current?.pause();
    setIsPlaying(false);
    onPlayStateChange?.(false);

    // Pause inserts
    activeInsertSourcesRef.current.forEach(({ source }) => {
      try {
        source.stop();
      } catch (e) {}
    });

    // Stop animation loop
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, [onPlayStateChange]);

  const seek = useCallback(
    (time: number) => {
      if (!mainAudioRef.current) return;

      const wasPlaying = isPlaying;

      // Pause everything
      pause();

      // Seek main audio
      mainAudioRef.current.currentTime = time;
      setCurrentTime(time);

      // Reset triggered inserts
      triggeredInsertsRef.current.clear();
      insertQueueRef.current = [];

      // Stop all insert sources (they can't be seeked, must be recreated)
      activeInsertSourcesRef.current.forEach(({ source }) => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {
          // Ignore
        }
      });
      activeInsertSourcesRef.current.clear();

      // Restore main audio volume
      if (mainGainRef.current && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        mainGainRef.current.gain.cancelScheduledValues(now);
        mainGainRef.current.gain.setValueAtTime(1, now);
      }

      // Resume if was playing
      if (wasPlaying) {
        setTimeout(() => play(), 50);
      }
    },
    [isPlaying, pause, play]
  );

  return {
    hasLoaded,
    isPlaying,
    currentTime,
    play,
    pause,
    seek,
    playInsertNow,
    stopAllInserts,

    // Additional controls
    loadInsertBuffer: async (insertId: string) => {
      const insert = episodeData.inserts.find((i) => i.id === insertId);
      if (!insert) return null;

      const buffer = await loadAudioBuffer(insert.audioUrl);
      if (buffer) {
        insertBuffersRef.current.set(insertId, { buffer, insert });
      }
      return buffer;
    },

    // State accessors
    getInsertBuffer: (insertId: string) =>
      insertBuffersRef.current.get(insertId),
    isInsertPlaying: (insertId: string) =>
      activeInsertSourcesRef.current.has(insertId)
  };
};
