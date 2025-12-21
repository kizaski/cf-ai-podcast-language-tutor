import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { PlayerControls } from "./PlayerControls";
import { InsertsList } from "./InsertsList";
import { Transcript } from "./Transcript";
import type { EpisodeData } from "@/types/audio-types";
import { getInsertColor } from "@/lib/utils";

interface AudioPlayerPanelProps {
  initialData?: EpisodeData;
}

export const AudioPlayerPanel = ({ initialData }: AudioPlayerPanelProps) => {
  const {
    episodeData,
    playbackState,
    handlePlayPause,
    handleSeek,
    handleToggleInsert,
    handleSkipBackward,
    handleSkipForward,
    handleVolumeChange,
    handlePlaybackRateChange,
    handleToggleInserts,
    handleAddInsert,
    handleAddInsertAtTime
  } = useAudioPlayer(initialData || DEFAULT_EPISODE_DATA);

  return (
    <div className="flex-1 min-w-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Header with toggle button */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">
                {episodeData.episode.title}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                {episodeData.episode.description}
              </p>
            </div>
            <button
              onClick={handleToggleInserts}
              className={`px-3 py-2 rounded-lg transition ${
                playbackState.activeInserts.length > 0
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
              }`}
            >
              {playbackState.activeInserts.length > 0
                ? "Inserts On"
                : "Inserts Off"}
            </button>
          </div>

          <PlayerControls
            episode={episodeData.episode}
            playbackState={playbackState}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onSkipBackward={handleSkipBackward}
            onSkipForward={handleSkipForward}
            onVolumeChange={handleVolumeChange}
            onPlaybackRateChange={handlePlaybackRateChange}
            inserts={episodeData.inserts}
            getInsertColor={getInsertColor}
          />

          <InsertsList
            inserts={episodeData.inserts}
            onToggleInsert={handleToggleInsert}
            onSeek={handleSeek}
            onAddInsert={() =>
              handleAddInsert({
                id: `insert_${Date.now()}`,
                type: "primer_intro",
                title: "New Insert",
                audioUrl: "https://example.com/inserts/new_insert.mp3",
                duration: 60,
                startTime: playbackState.currentTime,
                endTime: playbackState.currentTime + 60,
                enabled: true,
                metadata: {}
              })
            }
          />

          <Transcript
            segments={episodeData.transcript}
            inserts={episodeData.inserts}
            currentTime={playbackState.currentTime}
            onSeek={handleSeek}
            onAddInsertAtTime={handleAddInsertAtTime}
          />
        </div>
      </div>
    </div>
  );
};

// Default data (can be moved to a separate file)
const DEFAULT_EPISODE_DATA: EpisodeData = {
  episode: {
    id: "ep_123",
    title: "Podcast player",
    duration: 2723,
    audioUrl: "https://example.com/audio/episode123.mp3",
    publishedDate: "2024-01-15",
    description: ""
  },
  inserts: [
    {
      id: "insert_1",
      type: "primer_intro",
      title: "Welcome Primer",
      audioUrl: "https://example.com/inserts/welcome_primer.mp3",
      duration: 75,
      startTime: 0,
      endTime: 75,
      enabled: true,
      metadata: {
        category: "branding",
        version: "v2",
        creator: "studio_team"
      }
    },
    {
      id: "insert_2",
      type: "primer_outro",
      title: "Closing Remarks",
      audioUrl: "https://example.com/inserts/closing_reminder.mp3",
      duration: 90,
      startTime: 2633,
      endTime: 2723,
      enabled: true,
      metadata: {
        category: "cta",
        version: "v1",
        creator: "host"
      }
    },
    {
      id: "insert_3",
      type: "ad",
      title: "Sponsor Message",
      audioUrl: "https://example.com/inserts/sponsor_ad.mp3",
      duration: 60,
      startTime: 900,
      endTime: 960,
      enabled: true,
      metadata: {
        category: "monetization",
        sponsor: "TechCorp",
        campaign: "Q1_2024"
      }
    }
  ],
  transcript: [
    {
      id: "transcript_1",
      startTime: 0,
      endTime: 300,
      text: "Welcome to today's episode about AI in podcasting. This technology is revolutionizing how we create and consume audio content.",
      speaker: "host"
    },
    {
      id: "transcript_2",
      startTime: 300,
      endTime: 600,
      text: "One of the most exciting developments is AI-powered editing tools that can automatically remove filler words and enhance audio quality.",
      speaker: "host"
    }
  ]
};
