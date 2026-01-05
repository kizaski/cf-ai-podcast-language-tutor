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
    () => episodeData.inserts.filter((i) => i.enabled),
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
        <div className="flex-1 overflow-y-visible">
          <div className="p-6">
            <PlayerControls
              episodeData={episodeData}
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
              playbackState={playbackState}
              inserts={episodeData.inserts}
              onToggleInsert={handleToggleInsert}
              onToggleInserts={handleToggleInserts}
              isLoading={false}
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
