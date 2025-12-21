import type { PlaybackState, Episode } from "@/types/audio-types";
import { formatTime } from "@/lib/utils";

interface PlayerControlsProps {
  episode: Episode;
  playbackState: PlaybackState;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onVolumeChange: (value: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  inserts: any[];
  getInsertColor: (type: string) => string;
}

export const PlayerControls = ({
  episode,
  playbackState,
  onPlayPause,
  onSeek,
  onSkipBackward,
  onSkipForward,
  onVolumeChange,
  onPlaybackRateChange,
  inserts,
  getInsertColor
}: PlayerControlsProps) => {
  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Current Playback</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {formatTime(playbackState.currentTime)} /{" "}
            {formatTime(episode.duration)}
          </p>
        </div>
      </div>

      {/* Progress Bar with Insert Markers */}
      <div className="space-y-4">
        <div className="relative h-2 bg-neutral-300 dark:bg-neutral-700 rounded-full">
          {/* Insert markers */}
          {inserts
            .filter((insert) => insert.enabled)
            .map((insert) => (
              <div
                key={insert.id}
                className="absolute top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full cursor-pointer"
                style={{
                  left: `${(insert.startTime / episode.duration) * 100}%`,
                  backgroundColor: getInsertColor(insert.type)
                }}
                title={`${insert.title} (${insert.type})`}
                onClick={() => onSeek(insert.startTime)}
              />
            ))}

          {/* Progress fill */}
          <div
            className="absolute top-0 left-0 h-full bg-blue-600 rounded-full"
            style={{
              width: `${(playbackState.currentTime / episode.duration) * 100}%`
            }}
          />
        </div>

        <div className="flex justify-between text-sm">
          <span>{formatTime(playbackState.currentTime)}</span>
          <span>{formatTime(episode.duration)}</span>
        </div>

        {/* Audio Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">Speed:</span>
            <select
              value={playbackState.playbackRate}
              onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
              className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-sm"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onSkipBackward}
              className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
            >
              ⏮
            </button>
            <button
              onClick={onPlayPause}
              className="p-4 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              {playbackState.isPlaying ? "⏸" : "▶"}
            </button>
            <button
              onClick={onSkipForward}
              className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
            >
              ⏭
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Volume:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={playbackState.volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-24"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
