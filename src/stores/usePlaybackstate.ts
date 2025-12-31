import { create } from "zustand";
import type { TranscriptSegment } from "@/types/audio-types";

interface PodcastPlaybackState {
  currentTime: number;
  isPlaying: boolean;
  currentTranscriptSegments: TranscriptSegment[];
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
}

export const usePodcastPlaybackState = create<PodcastPlaybackState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  currentTranscriptSegments: [],
  setCurrentTime: (time) =>
    set((state) => {
      return { currentTime: time };
    }),
  setIsPlaying: (playing) => set({ isPlaying: playing })
}));
