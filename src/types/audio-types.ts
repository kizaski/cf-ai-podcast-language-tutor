export interface Insert {
  id: string;
  type: "primer_intro" | "primer_outro" | "ad" | "transition";
  title: string;
  audioUrl: string;
  duration: number;
  startTime: number;
  endTime: number;
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

export interface Episode {
  id: string;
  title: string;
  duration: number;
  audioUrl: string;
  publishedDate: string;
  description: string;
}

export interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  activeInserts: string[];
}

export interface EpisodeData {
  episode: Episode;
  inserts: Insert[];
  transcript: TranscriptSegment[];
}
