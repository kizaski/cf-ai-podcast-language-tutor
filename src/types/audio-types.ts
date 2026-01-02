import { z } from "zod";

export interface Insert {
  id: string;
  type: "primer_intro" | "primer_outro" | "ad" | "transition";
  title: string;
  audioUrl: string;
  duration: number;
  startTime: number;
  endTime: number;
  audioBuffer?: AudioBuffer;
  text: string;
  // hasLoaded: boolean;
  enabled: boolean;
  metadata: Record<string, any>;
}

export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker: string;
}

export const TranscriptSegmentSchema: z.ZodType<TranscriptSegment> = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  speaker: z.string()
});

export interface Episode {
  id: string;
  title: string;
  duration: number;
  audioUrl: string;
  publishedDate: string;
  description: string;
  audioBuffer?: AudioBuffer;
}

export interface EpisodeData {
  episode: Episode;
  inserts: Insert[];
  transcript: TranscriptSegment[];
}

export interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  duration: number;
  activeInserts: Insert[];
  playbackStartTime?: number;
  lastPauseTime?: number;
  currentTranscriptSegments?: TranscriptSegment[];
}

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface Phrase {
  id: string;
  text: string;
  start: number;
  end: number;
  wordCount: number;
  words: Word[];
}
