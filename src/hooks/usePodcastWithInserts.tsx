import { useState, useEffect, useRef, useCallback } from "react";
import { Howl } from "howler";
import type { Insert } from "@/types/audio-types";
import { usePodcastPlaybackState } from "@/stores/usePlaybackstate";

export const usePodcastWithInserts = (
  podcastUrl: string,
  inserts: Insert[]
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const setCurrentTimeStore = usePodcastPlaybackState(
    (state) => state.setCurrentTime
  );
  const setIsPlayingStore = usePodcastPlaybackState(
    (state) => state.setIsPlaying
  );

  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(1);

  const podcastSoundRef = useRef<Howl | null>(null);
  const insertSoundsRef = useRef<Map<string, Howl>>(new Map());
  const insertHasPlayedRef = useRef<Map<string, boolean>>(new Map());
  const activeInsertIdRef = useRef<string | null>(null);
  const isInsertPlayingRef = useRef(false);
  const isSeekingRef = useRef(false);

  useEffect(() => {
    setCurrentTimeStore(currentTime);
    setIsPlayingStore(isPlaying);
    return () => {};
  }, [currentTime, isPlaying]);

  // Initialize podcast Howl
  useEffect(() => {
    if (!podcastUrl) return;

    const podcastSound = new Howl({
      src: [podcastUrl],
      preload: true,
      html5: true,
      autoplay: false,
      onload: () => {
        setDuration(podcastSound.duration());
      },
      volume
    });

    podcastSoundRef.current = podcastSound;

    return () => {
      podcastSound.unload();
    };
  }, [podcastUrl]);

  // Update volume for both podcast and active insert
  useEffect(() => {
    podcastSoundRef.current?.volume(volume);
    if (activeInsertIdRef.current) {
      insertSoundsRef.current.get(activeInsertIdRef.current)?.volume(volume);
    }
  }, [volume]);

  const resumePodcast = useCallback(() => {
    isInsertPlayingRef.current = false;
    activeInsertIdRef.current = null;
    podcastSoundRef.current?.play();
    setIsPlaying(true);
  }, []);

  // Lazy-load insert Howl only when needed
  const checkInsertTriggers = useCallback(
    (time: number) => {
      inserts.forEach((insert) => {
        if (!insert.enabled) return;

        const hasPlayed = insertHasPlayedRef.current.get(insert.id) || false;
        const tolerance = 0.3;

        if (
          // isSeekingRef.current && // skip during manual seek
          time >= insert.startTime &&
          time <= insert.startTime + tolerance &&
          !hasPlayed &&
          !isInsertPlayingRef.current
        ) {
          // Load Howl if not already loaded
          if (!insertSoundsRef.current.has(insert.id)) {
            const sound = new Howl({
              src: [`/api/r2/${insert.audioUrl}`],
              preload: true,
              html5: true,
              volume
            });
            insertSoundsRef.current.set(insert.id, sound);
          }

          const sound = insertSoundsRef.current.get(insert.id);
          if (!sound) return;

          // Mark insert as played
          insertHasPlayedRef.current.set(insert.id, true);

          isInsertPlayingRef.current = true;
          activeInsertIdRef.current = insert.id;

          // Pause podcast and play insert
          podcastSoundRef.current?.pause();
          setIsPlaying(false);

          sound.play();

          // Resume podcast when insert ends
          sound.once("end", () => {
            resumePodcast();
            sound.unload();
            insertSoundsRef.current.delete(insert.id);
          });
          sound.once("stop", () => {
            resumePodcast();
            sound.unload();
            insertSoundsRef.current.delete(insert.id);
          });
        }
      });
    },
    [inserts, resumePodcast, volume]
  );

  // Throttle insert checks (4x per second)
  useEffect(() => {
    const interval = setInterval(() => {
      if (podcastSoundRef.current && !isInsertPlayingRef.current) {
        const time = podcastSoundRef.current.seek() as number;
        setCurrentTime((prev) => (prev !== time ? time : prev));
        checkInsertTriggers(time);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [checkInsertTriggers]);

  // Play/pause handlers
  const play = () => {
    if (!podcastSoundRef.current) return;
    podcastSoundRef.current.play();
    setIsPlaying(true);
  };

  const pause = () => {
    podcastSoundRef.current?.pause();
    setIsPlaying(false);
  };

  const seek = (time: number) => {
    if (!podcastSoundRef.current) return;

    isSeekingRef.current = true;
    podcastSoundRef.current.seek(time);
    setCurrentTime(time);

    // Reset inserts that are after the new time
    inserts.forEach((insert) => {
      if (insert.startTime >= time) {
        insertHasPlayedRef.current.set(insert.id, false);
      }
    });

    // Resume after short delay to prevent insert from instantly triggering
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 100);
  };

  const stop = () => {
    podcastSoundRef.current?.stop();
    setIsPlaying(false);
    insertSoundsRef.current.forEach((sound) => sound.stop());
    insertSoundsRef.current.clear();
    activeInsertIdRef.current = null;
    isInsertPlayingRef.current = false;
  };

  return {
    play,
    stop,
    seek,
    pause,
    setVolume,
    volume,
    isPlaying,
    currentTime,
    duration
  };
};
