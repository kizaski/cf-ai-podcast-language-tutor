import type { EpisodeData, TranscriptSegment } from "@/types/audio-types";
import { EmptyAudioPlayer } from "./EmptyAudioPlayer";
import { AudioPlayerPanelInner } from "./AudioPlayerPanelInner";
import { useEffect, type Dispatch, type SetStateAction } from "react";

export interface AudioPlayerPanelProps {
  episodeData?: EpisodeData;
  setEpisodeData?: Dispatch<SetStateAction<EpisodeData | null>>;
}

export const AudioPlayerPanel = ({
  episodeData: initialData,
  setEpisodeData
}: AudioPlayerPanelProps) => {
  if (!initialData) return <EmptyAudioPlayer />;

  // Start transcription when episode is loaded
  useEffect(() => {
    console.log(initialData);

    if (!initialData?.episode.audioUrl) return;

    const startTranscription = async () => {
      try {
        console.log("starting transcirption...");

        const response = await fetch(
          `/api/episodes/${initialData.episode.id}/transcribe-stream`,
          {
            headers: {
              Accept: "text/event-stream"
            }
          }
        );
        console.log(response);

        if (!response.ok) {
          throw new Error(`Failed to start transcription: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No readable stream available");
        }

        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();

          if (!setEpisodeData) {
            console.error("no setEpisodeData");

            break;
          }

          console.log("working...");

          if (done) {
            console.log("Done");

            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              const newSegment: TranscriptSegment = {
                text: line.trim(),
                id: Date.now().toString(),
                startTime: 0,
                endTime: 0,
                speaker: ""
              };
              console.log(newSegment);

              setEpisodeData((prev) => {
                if (!prev) return prev;
                const updated: EpisodeData | null = {
                  ...prev,
                  transcript: [...prev.transcript, newSegment]
                };
                return updated;
              });
            }
          }
        }
      } catch (error) {
        console.error("Transcription error:", error);
      }
    };

    startTranscription();

    return () => {};
  }, [initialData?.episode.id, initialData?.episode.audioUrl]);

  return (
    <AudioPlayerPanelInner
      episodeData={initialData}
      setEpisodeData={setEpisodeData!}
    />
  );
};
