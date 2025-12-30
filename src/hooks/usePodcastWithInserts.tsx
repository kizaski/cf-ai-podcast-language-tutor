import { useEffect, useRef, useState, useCallback } from "react";
import { Howl } from "howler";
import { usePodcastPlaybackState } from "@/stores/usePlaybackstate";

/* ---------------- Types ---------------- */

interface ScheduledInsert {
  id: string;
  startTime: number;
  audioUrl: string;
}

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
  inserts: ScheduledInsert[] | null
): PodcastPlayerState {
  const podcastRef = useRef<Howl | null>(null);
  const insertRef = useRef<Howl | null>(null);
  const podcastIdRef = useRef<number | null>(null);

  const insertIndexRef = useRef(0);
  const monitorRef = useRef<number | null>(null);
  const pausedSeekRef = useRef(0);

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

    let sorted: ScheduledInsert[] = [];
    if (inserts) {
      sorted = [...inserts].sort((a, b) => a.startTime - b.startTime);
    }

    monitorRef.current = window.setInterval(() => {
      const podcast = podcastRef.current;
      const id = podcastIdRef.current;

      if (!podcast || id === null || !podcast.playing(id)) return;

      const t = podcast.seek(id) as number;
      setCurrentTime(t);

      let next: ScheduledInsert | null = null;
      if (inserts) {
        next = sorted[insertIndexRef.current];
      }
      if (!next) return;

      if (t >= next.startTime) {
        playInsert(next);
        insertIndexRef.current++;
      }
    }, 200);
  };

  const stopMonitoring = () => {
    if (monitorRef.current !== null) {
      clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  };

  /* ---------------- Insert ---------------- */

  const playInsert = async (insert: ScheduledInsert) => {
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
        podcast.seek(pausedSeekRef.current, id);
        podcast.play(id);
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
