import type {
  EpisodeData,
  TranscriptSegment,
  Insert
} from "@/types/audio-types";
import { EmptyAudioPlayer } from "./EmptyAudioPlayer";
import { AudioPlayerPanelInner } from "./AudioPlayerPanelInner";
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useAgent } from "agents/react";
import Cookies from "js-cookie";

export interface AudioPlayerPanelProps {
  episodeData?: EpisodeData;
  setEpisodeData?: Dispatch<SetStateAction<EpisodeData | null>>;
}

export const AudioPlayerPanel = ({
  episodeData: initialData,
  setEpisodeData
}: AudioPlayerPanelProps) => {
  if (!initialData) return <EmptyAudioPlayer />;

  // TODO -- move, add buttons
  const transcriber = useAgent({
    agent: "transcriber",
    name: Cookies.get("session_id"),
    query: {
      audioKey: initialData.episode.id
    },
    onMessage: (message: any) => {
      console.log(message);

      setEpisodeData!((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          transcript: [...prev.transcript, JSON.parse(message.data)]
        };
      });
    },
    onOpen: () => console.log("Connection established"),
    onClose: () => console.log("Connection closed")
  });

  return (
    <AudioPlayerPanelInner
      episodeData={initialData}
      setEpisodeData={setEpisodeData!}
    />
  );
};
