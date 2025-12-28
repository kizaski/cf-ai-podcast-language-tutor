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

  // TODO -- move, add buttons
  useEffect(() => {
    if (!initialData?.episode.audioUrl || !setEpisodeData) return;

    let abort = false;
    const decoder = new TextDecoder();
    let transcriptionES: EventSource | null = null;
    let insertStreamController: AbortController | null = null;

    const startStreams = async () => {
      try {
        // --- 1. Transcription stream using EventSource ---
        transcriptionES = new EventSource(
          `/api/episodes/${initialData.episode.id}/transcribe-stream`
        );

        transcriptionES.onmessage = (event) => {
          if (abort) return;

          try {
            const data = JSON.parse(event.data);

            console.log("incoming: ", data);

            // Handle different response types
            if (typeof data === "string") {
              // String message (error or info)
              if (data.includes("Error") || data.includes("Timeout")) {
                console.error("Transcription error:", data);
                return;
              }
              console.log("Transcription info:", data);
              return;
            }

            // Process transcript segment
            if (data.text !== undefined) {
              const newSegment: TranscriptSegment = {
                text: data.text,
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                startTime: data.startTime || 0,
                endTime: data.endTime || 0,
                speaker: data.speaker || ""
              };

              setEpisodeData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  transcript: [...prev.transcript, newSegment]
                };
              });
            }
          } catch (error) {
            // If JSON parse fails, treat as plain text transcript
            if (event.data && typeof event.data === "string") {
              const newSegment: TranscriptSegment = {
                text: event.data.trim(),
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                startTime: 0,
                endTime: 0,
                speaker: ""
              };

              setEpisodeData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  transcript: [...prev.transcript, newSegment]
                };
              });
            } else {
              console.error("Error parsing transcription data:", error);
            }
          }
        };

        transcriptionES.onerror = (error) => {
          if (abort) return;
          console.error("Transcription stream error:", error);
        };

        // --- 2. Inserts stream using Fetch API ---
        insertStreamController = new AbortController();

        const insertsRes = await fetch(
          `/api/episodes/${initialData.episode.id}/inserts-stream`,
          {
            headers: {
              Accept: "text/event-stream"
            },
            signal: insertStreamController.signal
          }
        );

        if (!insertsRes.ok || !insertsRes.body) {
          console.error("Failed to start inserts stream");
          return;
        }

        const insertsReader = insertsRes.body.getReader();
        let insertsBuffer = "";

        const readInserts = async () => {
          try {
            while (!abort) {
              const { done, value } = await insertsReader.read();
              if (done) break;

              insertsBuffer += decoder.decode(value, { stream: true });

              // Split by double newlines (SSE format)
              const messages = insertsBuffer.split("\n\n");
              insertsBuffer = messages.pop() || "";

              for (const message of messages) {
                if (!message.trim()) continue;

                try {
                  // Parse SSE message
                  const lines = message.split("\n");
                  let dataLine = "";

                  for (const line of lines) {
                    if (line.startsWith("data: ")) {
                      dataLine = line.slice(6);
                      break;
                    } else if (line.trim() && !line.includes(":")) {
                      // Handle non-standard SSE format
                      dataLine = line.trim();
                      break;
                    }
                  }

                  if (!dataLine) continue;

                  const newInsert: Insert = JSON.parse(dataLine);

                  // Set default values if needed
                  if (newInsert.endTime === 0) newInsert.endTime = 10;

                  console.log("New insert received:", newInsert);

                  setEpisodeData((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      inserts: [...prev.inserts, newInsert]
                    };
                  });
                } catch (err) {
                  console.error(
                    "Failed to parse insert message:",
                    err,
                    "Raw:",
                    message
                  );
                }
              }
            }
          } catch (error: any) {
            if (error.name === "AbortError") {
              console.log("Inserts stream aborted");
            } else {
              console.error("Error reading inserts stream:", error);
            }
          } finally {
            await insertsReader.cancel?.();
          }
        };

        // Start reading inserts stream
        await readInserts();
      } catch (error) {
        console.error("Error starting streams:", error);
      }
    };

    startStreams();

    return () => {
      abort = true;

      // Clean up transcription EventSource
      if (transcriptionES) {
        transcriptionES.close();
        transcriptionES = null;
      }

      // Clean up inserts stream
      if (insertStreamController) {
        insertStreamController.abort();
        insertStreamController = null;
      }
    };
  }, [initialData?.episode.id, initialData?.episode.audioUrl, setEpisodeData]);

  return (
    <AudioPlayerPanelInner
      episodeData={initialData}
      setEpisodeData={setEpisodeData!}
    />
  );
};
