import type { EpisodeData } from "@/types/audio-types";
import { EmptyAudioPlayer } from "./EmptyAudioPlayer";
import { AudioPlayerPanelInner } from "./AudioPlayerPanelInner";
import { type Dispatch, type SetStateAction } from "react";
import { useAgent } from "agents/react";

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

            const newInserts = [...prev.inserts, data.insert];

            newInserts.sort((a, b) => {
              // First, sort by startTime
              if (a.startTime !== b.startTime) {
                return a.startTime - b.startTime;
              }

              // Normalize type: treat primer_intro same as intro, primer_outro same as outro
              const normalizeType = (type: any): "intro" | "outro" => {
                if (type.includes("intro")) return "intro";
                if (type.includes("outro")) return "outro";
                return type; // fallback if something else appears
              };

              const typeOrder = { intro: 1, outro: 0 };

              return (
                typeOrder[normalizeType(a.type)] -
                typeOrder[normalizeType(b.type)]
              );
            });

            return { ...prev, inserts: newInserts };
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
