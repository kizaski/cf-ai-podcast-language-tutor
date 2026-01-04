import { useState, useRef, useEffect, useCallback } from "react";
import { Howl } from "howler";
import type { Insert } from "@/types/audio-types";

/* ---------------- Types ---------------- */

export interface PodcastPlayerState {
  play: () => void;
  stop: () => void;
  seek: (time: number) => void;
  pause: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

/* ---------------- Hook ---------------- */

export function usePodcastWithInserts(
  podcastUrl: string | null,
  inserts: Insert[]
): PodcastPlayerState {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const podcastSoundRef = useRef<Howl | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInsertPlayingRef = useRef(false);
  const podcastPauseTimeRef = useRef(0);
  const activeInsertIdRef = useRef<string | null>(null);
  const volumeRef = useRef(1.0);

  // Store Howl instances for inserts
  const insertSoundsRef = useRef<Map<string, Howl>>(new Map());
  const insertHasPlayedRef = useRef<Map<string, boolean>>(new Map());

  // Initialize insert playback tracking
  useEffect(() => {
    insertHasPlayedRef.current = new Map();
    inserts.forEach((insert) => {
      insertHasPlayedRef.current.set(insert.id, false);
    });
  }, [inserts]);

  // Load insert sounds
  useEffect(() => {
    // Clean up previous insert sounds
    insertSoundsRef.current.forEach((sound) => {
      sound.unload();
    });
    insertSoundsRef.current.clear();

    // Load new insert sounds
    inserts.forEach((insert) => {
      if (!insert.audioUrl || !insert.enabled) return;

      const sound = new Howl({
        src: [`/api/r2/${insert.audioUrl}`],
        format: ["wav", "mp3", "ogg", "m4a"],
        preload: true,
        html5: true,
        volume: volumeRef.current,
        onload: () => {
          // Store the loaded sound
          insertSoundsRef.current.set(insert.id, sound);
        },
        onloaderror: (id, error) => {
          console.error(`Error loading insert ${insert.title}:`, error);
        }
      });
    });

    return () => {
      insertSoundsRef.current.forEach((sound) => {
        sound.unload();
      });
    };
  }, [inserts]);

  // Initialize podcast audio
  useEffect(() => {
    if (!podcastUrl) {
      if (podcastSoundRef.current) {
        podcastSoundRef.current.unload();
        podcastSoundRef.current = null;
      }
      return;
    }

    // Clean up previous sound
    if (podcastSoundRef.current) {
      podcastSoundRef.current.unload();
    }

    // Create new Howl instance
    const sound = new Howl({
      src: [podcastUrl],
      format: ["mp3", "wav", "ogg", "m4a"],
      preload: true,
      volume: volumeRef.current,
      html5: true,
      onload: () => {
        setDuration(sound.duration());
      },
      onplay: () => {
        setIsPlaying(true);
        isInsertPlayingRef.current = false;

        // Start time update interval
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
        updateIntervalRef.current = setInterval(() => {
          if (!isInsertPlayingRef.current && sound) {
            const seekTime = sound.seek() as number;
            setCurrentTime(seekTime);
            checkInsertTriggers(seekTime);
          }
        }, 100);
      },
      onpause: () => {
        if (!isInsertPlayingRef.current) {
          setIsPlaying(false);
        }

        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
      },
      onstop: () => {
        setIsPlaying(false);
        isInsertPlayingRef.current = false;
        setCurrentTime(0);

        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }

        // Reset insert playback flags
        insertHasPlayedRef.current.forEach((_, id) => {
          insertHasPlayedRef.current.set(id, false);
        });
      },
      onend: () => {
        setIsPlaying(false);
        isInsertPlayingRef.current = false;

        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
      },
      onseek: () => {
        const seekTime = sound.seek() as number;
        setCurrentTime(seekTime);

        // Reset insert playback flags when seeking
        insertHasPlayedRef.current.forEach((_, id) => {
          insertHasPlayedRef.current.set(id, false);
        });
      }
    });

    podcastSoundRef.current = sound;

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      if (sound) {
        sound.unload();
      }
    };
  }, [podcastUrl]);

  // Check for insert triggers
  const checkInsertTriggers = useCallback(
    (currentTime: number) => {
      // console.log(!isPlaying);

      // if (!isPlaying) return;

      inserts.forEach((insert) => {
        if (!insert.enabled || !insertSoundsRef.current.has(insert.id)) return;

        const sound = insertSoundsRef.current.get(insert.id)!;
        const hasPlayed = insertHasPlayedRef.current.get(insert.id) || false;
        const tolerance = 0;

        if (
          currentTime >= insert.startTime &&
          currentTime <= insert.startTime + tolerance &&
          !hasPlayed &&
          !isInsertPlayingRef.current
        ) {
          // Mark as played
          insertHasPlayedRef.current.set(insert.id, true);
          isInsertPlayingRef.current = true;

          // Store the current podcast time
          podcastPauseTimeRef.current = currentTime;

          // Pause the main podcast
          if (podcastSoundRef.current) {
            podcastSoundRef.current.pause();
            setIsPlaying(false);

            if (updateIntervalRef.current) {
              clearInterval(updateIntervalRef.current);
              updateIntervalRef.current = null;
            }
          }

          // Play the insert
          sound.play();
          activeInsertIdRef.current = insert.id;

          // Set up insert end listener
          sound.once("end", () => {
            resumePodcast();
          });

          sound.once("stop", () => {
            resumePodcast();
          });

          podcastPauseTimeRef.current = currentTime + tolerance;
        }

        // Reset hasPlayed if we rewind before the start time
        if (currentTime < insert.startTime - tolerance) {
          insertHasPlayedRef.current.set(insert.id, false);
        }
      });
    },
    [inserts, isPlaying]
  );

  // Resume podcast after insert finishes
  const resumePodcast = useCallback(() => {
    if (!isInsertPlayingRef.current) return;

    isInsertPlayingRef.current = false;

    if (podcastSoundRef.current) {
      // Resume podcast from where it left off
      podcastSoundRef.current.seek(podcastPauseTimeRef.current);
      podcastSoundRef.current.play();

      // Update state
      // setIsPlaying(true);
      updateIntervalRef.current = setInterval(() => {
        if (podcastSoundRef.current && !isInsertPlayingRef.current) {
          const seekTime = podcastSoundRef.current.seek() as number;
          setCurrentTime(seekTime);
          checkInsertTriggers(seekTime);
        }
      }, 100);
    }

    activeInsertIdRef.current = null;
  }, [checkInsertTriggers]);

  // Play function
  const play = useCallback(() => {
    if (podcastSoundRef.current && !isPlaying) {
      podcastSoundRef.current.play();
    }
  }, [isPlaying]);

  // Stop function
  const stop = useCallback(() => {
    if (podcastSoundRef.current) {
      // Stop any playing inserts first
      insertSoundsRef.current.forEach((sound) => {
        if (sound.playing()) {
          sound.stop();
        }
      });

      podcastSoundRef.current.stop();
      isInsertPlayingRef.current = false;
    }
  }, []);

  // Seek function
  const seek = useCallback((time: number) => {
    if (podcastSoundRef.current && !isInsertPlayingRef.current) {
      podcastSoundRef.current.seek(time);
    }
  }, []);

  // Pause function
  const pause = useCallback(() => {
    if (podcastSoundRef.current && isPlaying && !isInsertPlayingRef.current) {
      podcastSoundRef.current.pause();
    }
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }

      if (podcastSoundRef.current) {
        podcastSoundRef.current.unload();
      }

      insertSoundsRef.current.forEach((sound) => {
        sound.unload();
      });
    };
  }, []);

  return {
    play,
    stop,
    seek,
    pause,
    isPlaying,
    currentTime,
    duration
  };
}
