import type { EpisodeData } from "@/types/audio-types";
import { EmptyAudioPlayer } from "./EmptyAudioPlayer";
import { AudioPlayerPanelInner } from "./AudioPlayerPanelInner";
import { type Dispatch, type SetStateAction } from "react";
import { useAgent } from "agents/react";
import { useSession } from "@/providers/SessionProvider";
import { usePodcastPlaybackState } from "@/stores/usePlaybackstate";

export interface AudioPlayerPanelProps {
  episodeData?: EpisodeData;
  setEpisodeData?: Dispatch<SetStateAction<EpisodeData | null>>;
}

export const AudioPlayerPanel = ({
  episodeData: initialData,
  setEpisodeData
}: AudioPlayerPanelProps) => {
  if (!initialData) return <EmptyAudioPlayer />;

  const { sessionId } = useSession();

  const setCurrentTranscriptSegments = usePodcastPlaybackState(
    (state) => state.setCurrentTranscriptSegments
  );

  useAgent({
    agent: "transcriber",
    name: sessionId,
    query: {
      audioKey: initialData.episode.id
    },
    onMessage: (message: any) => {
      setEpisodeData!((prev) => {
        if (!prev) return prev;
        setCurrentTranscriptSegments([
          ...prev.transcript,
          JSON.parse(message.data)
        ]);
        return {
          ...prev,
          transcript: [...prev.transcript, JSON.parse(message.data)]
        };
      });
    },
    onOpen: () => console.log("Connection established"),
    onClose: (e) => console.log("Connection closed" + JSON.stringify(e))
  });

  return (
    <AudioPlayerPanelInner
      episodeData={initialData}
      setEpisodeData={setEpisodeData!}
    />
  );
};
