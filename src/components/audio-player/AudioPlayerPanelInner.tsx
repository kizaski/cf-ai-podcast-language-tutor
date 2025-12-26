import { useEnhancedAudioPlayer } from "@/hooks/useAudioPlayer";
import type { AudioPlayerPanelProps } from "./AudioPlayerPanel";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { AudioLoadingState } from "./AudioLoadingState";
import { PlayerControls } from "./PlayerControls";
import { InsertsList } from "./InsertsList";
import { Transcript } from "./Transcript";
import { getInsertColor } from "@/lib/utils";

export const AudioPlayerPanelInner = ({
  episodeData,
  setEpisodeData
}: Required<AudioPlayerPanelProps>) => {
  const audioEngine = useAudioEngine({
    episodeData
    //
  });

  const {
    playbackState,
    hasLoaded,
    handlePlayPause,
    handleSeek,
    handleToggleInsert,
    handleSkipBackward,
    handleSkipForward,
    handleVolumeChange,
    handlePlaybackRateChange,
    handleToggleInserts,
    handleStop
  } = useEnhancedAudioPlayer(episodeData, setEpisodeData, audioEngine);

  return (
    <>
      <div className="flex-1 min-w-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
        {/* TODO -- bring back loading */}
        {false ? (
          <AudioLoadingState isLoading={false} hasLoaded={hasLoaded} />
        ) : (
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
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                      Real Audio Playback
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
                episode={episodeData.episode}
                playbackState={playbackState}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                onStop={handleStop}
                onSkipBackward={handleSkipBackward}
                onSkipForward={handleSkipForward}
                onVolumeChange={handleVolumeChange}
                onPlaybackRateChange={handlePlaybackRateChange}
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
                currentTime={playbackState.currentTime}
                onSeek={handleSeek}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
