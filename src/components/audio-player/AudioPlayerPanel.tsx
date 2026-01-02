import type { EpisodeData } from "@/types/audio-types";
import { EmptyAudioPlayer } from "./EmptyAudioPlayer";
import { AudioPlayerPanelInner } from "./AudioPlayerPanelInner";
import { type Dispatch, type SetStateAction } from "react";
import { useAgent } from "agents/react";
import { useSession } from "@/providers/SessionProvider";

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
  useAgent({
    agent: "transcriber",
    name: sessionId,
    query: { audioKey: initialData.episode.id },
    onMessage: (message) => {
      const data = JSON.parse(message.data);
      setEpisodeData!((prev) => {
        if (!prev) return prev;

        if (data.type === "transcript") {
          return { ...prev, transcript: [...prev.transcript, data.transcript] };
        }
        if (data.type === "insert") {
          return { ...prev, inserts: [...prev.inserts, data.insert] };
        }
        if (data.type === "insert-complete") {
          console.log("All inserts generated");
        }
        return prev;
      });
    },
    onOpen: () => console.log("WS connected [transcriber]"),
    onClose: () => console.log("WS closed [transcriber]")
  });

  return (
    <AudioPlayerPanelInner
      episodeData={initialData}
      setEpisodeData={setEpisodeData!}
    />
  );
};
