import { create } from "zustand";
import type { TranscriptSegment } from "@/types/audio-types";

interface PodcastPlaybackState {
  currentTime: number;
  isPlaying: boolean;
  currentTranscriptSegments: TranscriptSegment[];
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTranscriptSegments: (
    episodeTranscript?: TranscriptSegment[]
  ) => void;
}

export const usePodcastPlaybackState = create<PodcastPlaybackState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  currentTranscriptSegments: [],
  setCurrentTime: (time) =>
    set((state) => {
      return { currentTime: time };
    }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTranscriptSegments: (fullTranscript) => {
    set((state) => {
      const time = state.currentTime;

      console.log("time in zustand: ", time);

      let segments: TranscriptSegment[] = [];

      if (fullTranscript) {
        const windowSec = 10;
        segments = fullTranscript.filter(
          (phrase) =>
            time >= phrase.startTime - windowSec &&
            time <= phrase.endTime + windowSec
        );
      }

      return { currentTranscriptSegments: segments };
    });
  }
}));
