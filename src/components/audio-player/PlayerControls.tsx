import type { PlaybackState, Insert, EpisodeData } from "@/types/audio-types";
import { formatTime } from "@/lib/utils";

interface PlayerControlsProps {
  episodeData: EpisodeData;
  playbackState: PlaybackState;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onStop?: () => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onVolumeChange: (value: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleInserts: () => void;
  inserts: any[];
  getInsertColor: (type: string) => string;
  isLoading?: boolean;
  hasLoaded?: boolean;
}

export const PlayerControls = ({
  episodeData,
  playbackState,
  onPlayPause,
  onSeek,
  onStop,
  onSkipBackward,
  onSkipForward,
  onVolumeChange,
  onPlaybackRateChange,
  onToggleInserts,
  inserts,
  getInsertColor,
  isLoading = false,
  hasLoaded = false
}: PlayerControlsProps) => {
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * playbackState.duration;
    onSeek(newTime);
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-6 mb-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap break-all">
            <h2 className="text-lg font-semibold flex-wrap wrap-break-word">
              {episodeData.episode.title}
            </h2>

            {hasLoaded && (
              <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                Loaded
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {formatTime(playbackState.currentTime)} /{" "}
            {formatTime(playbackState.duration)}
          </p>
          {isLoading && (
            <div className="mt-2">
              <div className="w-full bg-neutral-300 dark:bg-neutral-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: "50%" }} // TODO -- rm or impl
                />
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Loading audio...
              </p>
            </div>
          )}
          {!hasLoaded && !isLoading && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Audio not loaded. Try refreshing the page.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {onStop && (
            <button
              onClick={onStop}
              className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!playbackState.isPlaying || isLoading}
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar with Insert Markers */}
      <div className="space-y-4">
        <div
          className="relative h-2 bg-neutral-300 dark:bg-neutral-700 rounded-full cursor-pointer"
          onClick={handleProgressClick}
        >
          {/* Insert markers */}
          {inserts
            .filter((insert) => insert.enabled) // && insert.hasLoaded !== false)
            .map((insert: Insert, idx) => (
              <div
                key={`${insert.id}-${idx}-markers`}
                className="absolute top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full cursor-pointer hover:scale-125 transition-transform z-10"
                style={
                  {
                    left: `${(insert.startTime / playbackState.duration) * 100}%`,
                    backgroundColor: getInsertColor(insert.type),
                    boxShadow:
                      "0 0 0 2px white, 0 0 0 3px var(--tw-shadow-color)",
                    "--tw-shadow-color": getInsertColor(insert.type)
                  } as any
                }
                title={`${insert.title} (${insert.type}) - Click to seek`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(insert.startTime);
                }}
              />
            ))}

          {/* Progress fill */}
          <div
            className="absolute top-0 left-0 h-full bg-blue-600 rounded-full transition-all duration-100"
            style={{
              width: `${(playbackState.currentTime / playbackState.duration) * 100}%`
            }}
          />

          {/* Playhead */}
          <div
            className="absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-blue-600 rounded-full -ml-2 shadow-lg"
            style={{
              left: `${(playbackState.currentTime / playbackState.duration) * 100}%`
            }}
          />
        </div>

        <div className="flex justify-between text-sm">
          <span>{formatTime(playbackState.currentTime)}</span>
          <span>{formatTime(playbackState.duration)}</span>
        </div>

        {/* Audio Controls */}
        <div className="flex items-center justify-between">
          <div className="flex-1"></div>
          {/*<div className="flex items-center gap-2">
            <span></span>
            <span></span>

             <span className="text-sm">Speed:</span>
            <select
              value={playbackState.playbackRate}
              onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
              className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-sm disabled:opacity-50"
              disabled={isLoading}
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select> 
          </div>*/}

          <div className="flex gap-4">
            <button
              onClick={onSkipBackward}
              className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              ⏮
            </button>
            <button
              onClick={onPlayPause}
              className="p-4 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed min-w-14 flex items-center justify-center"
              disabled={isLoading}
            >
              {playbackState.isPlaying ? (
                <span className="inline-block">⏸</span>
              ) : (
                <span className="inline-block">▶</span>
              )}
            </button>
            <button
              onClick={onSkipForward}
              className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              ⏭
            </button>
          </div>

          <div className="flex flex-1 items-center gap-2 justify-end">
            <span className="text-sm">Volume:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={playbackState.volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-24 disabled:opacity-50"
              disabled={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
