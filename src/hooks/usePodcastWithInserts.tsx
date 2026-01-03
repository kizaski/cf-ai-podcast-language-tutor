import { useEffect, useRef, useState, useCallback } from "react";
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
  const podcastRef = useRef<Howl | null>(null);
  const insertRef = useRef<Howl | null>(null);
  const podcastIdRef = useRef<number | null>(null);

  const insertIndexRef = useRef(0);
  const monitorRef = useRef<number | null>(null);
  const pausedSeekRef = useRef(0);

  const podcastObjectUrlRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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

    const sorted = [...inserts].sort((a, b) => a.startTime - b.startTime);

    monitorRef.current = window.setInterval(() => {
      const podcast = podcastRef.current;
      const id = podcastIdRef.current;

      if (!podcast || id === null || !podcast.playing(id)) return;

      const t = podcast.seek(id) as number;
      setCurrentTime(t);

      const next = sorted[insertIndexRef.current];
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
