import { useEffect, useRef, useState, useCallback } from "react";
import { Howl } from "howler";
import { usePodcastPlaybackState } from "@/stores/usePlaybackstate";
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
  // currentTranscriptSegments: TranscriptSegment[];
}

/* ---------------- Hook ---------------- */

export function usePodcastWithInserts(
  podcastUrl: string | null,
  inserts: Insert[] | null
): PodcastPlayerState {
  const podcastRef = useRef<Howl | null>(null);
  const insertRef = useRef<Howl | null>(null);
  const podcastIdRef = useRef<number | null>(null);

  const insertIndexRef = useRef(0);
  const monitorRef = useRef<number | null>(null);
  const pausedSeekRef = useRef(0);
  const insertPlayingRef = useRef(false);
  const sortedInsertsRef = useRef<Insert[]>([]);
  const playedInsertsTimeRef = useRef<Map<string, number> | null>(new Map());
  const insertQueueRef = useRef<Insert[]>([]);

  const podcastObjectUrlRef = useRef<string | null>(null);

  const [duration, setDuration] = useState(0);

  // Stores for additional Chat context
  const setIsPlaying = usePodcastPlaybackState((state) => state.setIsPlaying);
  const setCurrentTime = usePodcastPlaybackState(
    (state) => state.setCurrentTime
  );
  const currentTime = usePodcastPlaybackState((state) => state.currentTime);
  const isPlaying = usePodcastPlaybackState((state) => state.isPlaying);

  /* ---------------- Utils ---------------- */

  const getFormatFromMime = (mime: string | null): string[] =>
    mime ? [mime.split("/")[1]] : [];

  const syncInsertIndexToTime = (time: number) => {
    const sorted = sortedInsertsRef.current;

    // Find first insert that hasn't played yet
    const index = sorted.findIndex((insert) => insert.startTime > time);

    insertIndexRef.current = index === -1 ? sorted.length : index;
  };

  /* ---------------- Podcast Setup ---------------- */

  useEffect(() => {
    if (!podcastUrl) return;

    let cancelled = false;

    const load = async () => {
      cleanup();

      const res = await fetch(podcastUrl);
      const blob = await res.blob();
      if (cancelled) return;

      const objectUrl = URL.createObjectURL(blob);
      podcastObjectUrlRef.current = objectUrl;

      const howl = new Howl({
        src: [objectUrl],
        format: getFormatFromMime(blob.type),
        html5: true,
        onplay: () => setIsPlaying(true),
        onpause: () => setIsPlaying(false),
        onstop: () => setIsPlaying(false),
        onload: () => setDuration(howl.duration())
      });

      podcastRef.current = howl;
    };

    load();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [podcastUrl]);

  /* ---------------- Sorted inserts management ---------------- */

  useEffect(() => {
    if (!inserts || inserts.length === 0) {
      sortedInsertsRef.current = [];
      insertIndexRef.current = 0;
      playedInsertsTimeRef.current?.clear();
      return;
    }

    sortedInsertsRef.current = [...inserts].sort(
      (a, b) => a.startTime - b.startTime
    );

    console.log(sortedInsertsRef.current);

    // Reset index when inserts change
    insertIndexRef.current = 0;
    playedInsertsTimeRef.current?.clear();
  }, [inserts]);

  /* ---------------- Controls ---------------- */

  const play = useCallback(() => {
    const podcast = podcastRef.current;
    if (!podcast) return;

    insertIndexRef.current = 0;
    podcastIdRef.current = podcast.play();
    startMonitoring();
  }, [inserts]);

  const pause = useCallback(() => {
    const podcast = podcastRef.current;
    const insert = insertRef.current;

    if (insert?.playing()) {
      insert.pause();
    } else if (podcast && podcastIdRef.current !== null) {
      podcast.pause(podcastIdRef.current);
    }

    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    stopMonitoring();
    podcastRef.current?.stop();
    insertRef.current?.stop();
    insertPlayingRef.current = false;
  }, []);

  const seek = useCallback((time: number) => {
    const podcast = podcastRef.current;
    const id = podcastIdRef.current;
    if (!podcast || id === null) return;
    podcast.seek(Math.max(0, time), id);
  }, []);

  /* ---------------- Monitoring ---------------- */

  const startMonitoring = () => {
    stopMonitoring();

    monitorRef.current = window.setInterval(() => {
      const podcast = podcastRef.current;
      const id = podcastIdRef.current;

      if (!podcast || id === null || !podcast.playing(id)) return;

      const t = podcast.seek(id) as number;
      setCurrentTime(t);
      syncInsertIndexToTime(t);

      let next: Insert | null = null;

      if (sortedInsertsRef.current) {
        next = sortedInsertsRef.current[insertIndexRef.current - 1];
      }
      if (!next) return;

      const lastPlayedTime = playedInsertsTimeRef.current?.get(next.id) ?? -1;

      if (
        !insertPlayingRef.current &&
        t >= next.startTime &&
        t <= next.endTime &&
        lastPlayedTime < next.startTime
      ) {
        console.log(
          `[Insert Trigger] Playing insert: ${next.id}\n`,
          `Current time: ${t.toFixed(2)}\n`,
          `Insert start: ${next.startTime.toFixed(2)}, end: ${next.endTime.toFixed(2)}\n`,
          `Last played time: ${lastPlayedTime.toFixed(2)}\n`,
          `InsertPlaying: ${insertPlayingRef.current}\n`
        );

        playedInsertsTimeRef.current?.set(next.id, t); // mark as played at this time
        insertIndexRef.current++;
        playInsert(next);

        console.log(
          `[Insert Trigger] Insert ${next.id} marked as played at ${t.toFixed(2)}\n`
        );
      } else {
        console.log(
          `[Insert Skip] ${next.id}\n`,
          `Current time: ${t.toFixed(2)}\n`,
          `InsertPlaying: ${insertPlayingRef.current}\n`,
          `Last played: ${lastPlayedTime.toFixed(2)}\n`,
          `Insert window: ${next.startTime.toFixed(2)} - ${next.endTime.toFixed(2)}\n`,
          `Will play? ${!insertPlayingRef.current && t >= next.startTime && t <= next.endTime && lastPlayedTime < next.startTime}\n`
        );
      }
    }, 110);
  };

  const stopMonitoring = () => {
    if (monitorRef.current !== null) {
      clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  };

  /* ---------------- Insert ---------------- */

  const playInsert = async (insert: Insert) => {
    const podcast = podcastRef.current;
    const id = podcastIdRef.current;
    if (!podcast || id === null) return;

    pausedSeekRef.current = podcast.seek(id) as number;
    podcast.pause(id);

    insertRef.current?.unload();

    const res = await fetch(`/api/r2/${insert.audioUrl}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    insertRef.current = new Howl({
      src: [objectUrl],
      format: blob.type ? [blob.type.split("/")[1]] : [],
      html5: true,
      onend: () => {
        URL.revokeObjectURL(objectUrl);

        insertPlayingRef.current = false; // mark insert as finished
        podcast.seek(pausedSeekRef.current, id);
        podcast.play(id);

        // Play next insert in queue
        if (insertQueueRef.current.length > 0) {
          const nextInsert = insertQueueRef.current.shift()!;
          playInsert(nextInsert);
        }
      },
      onplay: () => {
        insertPlayingRef.current = true; // mark insert as playing
      }
    });

    insertRef.current.play();
  };

  /* ---------------- Cleanup ---------------- */

  const cleanup = () => {
    stopMonitoring();

    podcastRef.current?.unload();
    insertRef.current?.unload();

    if (podcastObjectUrlRef.current) {
      URL.revokeObjectURL(podcastObjectUrlRef.current);
      podcastObjectUrlRef.current = null;
    }

    podcastRef.current = null;
    insertRef.current = null;
    podcastIdRef.current = null;
    insertPlayingRef.current = false;
    playedInsertsTimeRef.current?.clear();
  };

  useEffect(() => cleanup, []);

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
