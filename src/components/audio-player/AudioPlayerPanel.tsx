import type {
  EpisodeData,
  TranscriptSegment,
  Insert
} from "@/types/audio-types";
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

  useEffect(() => {
    if (!initialData?.episode.audioUrl || !setEpisodeData) return;

    let abort = false;

    const startStreams = async () => {
      // --- 1. Transcription stream ---
      const transcriptionRes = await fetch(
        `/api/episodes/${initialData.episode.id}/transcribe-stream`,
        { headers: { Accept: "text/event-stream" } }
      );
      if (!transcriptionRes.ok || !transcriptionRes.body) return;

      const transReader = transcriptionRes.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let transBuffer = "";

      const readTranscription = async () => {
        while (!abort) {
          const { done, value } = await transReader.read();
          if (done) break;

          transBuffer += decoder.decode(value, { stream: true });
          const lines = transBuffer.split("\n");
          transBuffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            const newSegment: TranscriptSegment = {
              text: line.trim(),
              id: Date.now().toString(),
              startTime: 0,
              endTime: 0,
              speaker: ""
            };

            setEpisodeData((prev) => {
              if (!prev) return prev;
              return { ...prev, transcript: [...prev.transcript, newSegment] };
            });
          }
        }
      };

      // --- 2. Inserts stream ---
      const insertsRes = await fetch(
        `/api/episodes/${initialData.episode.id}/inserts-stream`,
        { headers: { Accept: "text/event-stream" } }
      );
      if (!insertsRes.ok || !insertsRes.body) return;

      const insertsReader = insertsRes.body.getReader();
      let insertsBuffer = "";

      const readInserts = async () => {
        while (!abort) {
          const { done, value } = await insertsReader.read();
          if (done) break;

          insertsBuffer += decoder.decode(value, { stream: true });
          const chunks = insertsBuffer.split("\n");
          insertsBuffer = chunks.pop() || "";

          for (const chunk of chunks) {
            if (!chunk.trim()) continue;

            try {
              console.log(chunk);

              const newInsert: Insert = JSON.parse(chunk);
              setEpisodeData((prev) => {
                if (!prev) return prev;
                return { ...prev, inserts: [...prev.inserts, newInsert] };
              });
            } catch (err) {
              console.error("Failed to parse insert:", err);
            }
          }
        }
      };

      await Promise.all([readTranscription(), readInserts()]);
    };

    startStreams();

    return () => {
      abort = true;
    };
  }, [initialData?.episode.id, initialData?.episode.audioUrl, setEpisodeData]);

  return (
    <AudioPlayerPanelInner
      episodeData={initialData}
      setEpisodeData={setEpisodeData!}
    />
  );
};
