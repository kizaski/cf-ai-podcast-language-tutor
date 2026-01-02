import { useMemo } from "react";
import type { AudioPlayerPanelProps } from "./AudioPlayerPanel";

import { PlayerControls } from "./PlayerControls";
import { InsertsList } from "./InsertsList";
import { Transcript } from "./Transcript";
import { AudioLoadingState } from "./AudioLoadingState";
import { getInsertColor } from "@/lib/utils";

import { usePodcastWithInserts } from "@/hooks/usePodcastWithInserts";
import type { PlaybackState } from "@/types/audio-types";

export const AudioPlayerPanelInner = ({
  episodeData,
  setEpisodeData
}: Required<AudioPlayerPanelProps>) => {
  /**
   * Prepare inserts for Howler hook
   * (only enabled inserts should be scheduled)
   */
  const enabledInserts = useMemo(
    () =>
      episodeData.inserts
        .filter((i) => i.enabled)
        .map((i) => ({
          id: i.id,
          startTime: i.startTime,
          audioUrl: i.audioUrl
        })),
    [episodeData.inserts]
  );

  const { play, stop, seek, pause, isPlaying, currentTime, duration } =
    usePodcastWithInserts(
      `/api/r2/${episodeData.episode.audioUrl}`,
      enabledInserts
    );

  /* ---------------- Playback state adapter ---------------- */

  const playbackState: PlaybackState = {
    isPlaying,
    currentTime,
    volume: 1,
    playbackRate: 1,
    duration,
    activeInserts: episodeData.inserts.filter((i) => i.enabled)
  };

  /* ---------------- Handlers ---------------- */

  const handlePlayPause = () => {
    isPlaying ? pause() : play();
  };

  const handleSeek = (time: number) => {
    seek(time);
  };

  const handleStop = () => {
    stop();
  };

  const handleToggleInsert = (id: string) => {
    setEpisodeData((prev) => {
      if (!prev) {
        return null;
      }
      return {
        ...prev,
        inserts: prev.inserts.map((i) =>
          i.id === id ? { ...i, enabled: !i.enabled } : i
        )
      };
    });
  };

  const handleToggleInserts = () => {
    setEpisodeData((prev) => {
      if (!prev) return null;

      const anyEnabled = prev.inserts.some((i) => i.enabled);

      return {
        ...prev,
        inserts: prev.inserts.map((i) => ({
          ...i,
          enabled: !anyEnabled // toggle all based on current state
        }))
      };
    });
  };

  /* ---------------- Render ---------------- */

  const hasLoaded = Boolean(episodeData.episode.audioUrl);

  return (
    <div className="flex-1 min-w-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
      {!hasLoaded ? (
        <AudioLoadingState isLoading={false} hasLoaded={false} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">
                  {episodeData.episode.title}
                </h1>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {episodeData.episode.description}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                    Howler Playback
                  </span>
                  {hasLoaded && (
                    <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                      Loaded
                    </span>
                  )}
                </div>
              </div>
            </div>

            <PlayerControls
              playbackState={playbackState}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onStop={handleStop}
              onSkipBackward={() => seek(currentTime - 15)}
              onSkipForward={() => seek(currentTime + 30)}
              onVolumeChange={() => {}}
              onPlaybackRateChange={() => {}}
              onToggleInserts={handleToggleInserts}
              inserts={episodeData.inserts}
              getInsertColor={getInsertColor}
              isLoading={false}
              hasLoaded={hasLoaded}
            />

            <InsertsList
              inserts={episodeData.inserts}
              onToggleInsert={handleToggleInsert}
              onSeek={handleSeek}
            />

            <Transcript
              segments={episodeData.transcript}
              inserts={episodeData.inserts}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </div>
        </div>
      )}
    </div>
  );
};
