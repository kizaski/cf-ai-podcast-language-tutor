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

  useAgent({
    agent: "transcriber",
    name: `${initialData.episode.id}`,
    query: { audioKey: initialData.episode.id }, // TODO -- rm
    onMessage: (message) => {
      const data = JSON.parse(message.data);
      switch (data.type) {
        case "transcript":
          setEpisodeData!((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              transcript: [...prev.transcript, data.transcript]
            };
          });
          break;
        case "transcript-status":
          // TODO -- UI
          console.log(data.progress);
          break;

        case "insert":
          setEpisodeData!((prev) => {
            if (!prev) return prev;
            return { ...prev, inserts: [...prev.inserts, data.insert] };
          });
          break;
        case "insert-complete":
          console.log("All inserts generated");
          break;
        case "error":
          // TODO -- UI
          console.warn(`Error received from backend: ${data.message}`);
          break;
        default:
          break;
      }
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
