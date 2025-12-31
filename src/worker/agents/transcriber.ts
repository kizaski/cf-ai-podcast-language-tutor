import type { TranscriptSegment, Word, Phrase } from "@/types/audio-types";
import { extractPhrases, setupDatabase } from "@/utils";
import {
  Agent,
  type Connection,
  type ConnectionContext,
  type WSMessage
} from "agents";
import { env } from "cloudflare:workers";

interface TranscriberState {
  audioKey: string;
}

export class Transcriber extends Agent<Env, TranscriberState> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Initialize schema on startup
    setupDatabase(this.ctx.storage.sql);
  }

  async onRequest(request: Request): Promise<Response> {
    return new Response("Method not allowed", { status: 405 });
  }

  async runTranscriptionTask(connection: Connection, audioKey: string) {
    const db = this.ctx.storage.sql;

    // 1. Check current status
    let transcript;
    try {
      transcript = db
        .exec("SELECT status FROM transcripts WHERE audioKey = ?", audioKey)
        .one() as { status: string } | undefined;
    } catch (error) {
      console.log(error);
    }

    if (transcript?.status === "complete") {
      const segments = db
        .exec(
          "SELECT text, startTime, endTime, id, speaker FROM segments WHERE audioKey = ? ORDER BY startTime ASC",
          audioKey
        )
        .toArray();

      for (const segment of segments) {
        connection.send(JSON.stringify(segment));
      }
      return;
    }

    try {
      // 2. Initialize or Update status to in_progress
      db.exec(
        "INSERT INTO transcripts (audioKey, status) VALUES (?, 'in_progress') ON CONFLICT(audioKey) DO UPDATE SET status='in_progress'",
        audioKey
      );

      for await (const whisper_output of this.transcribe(audioKey)) {
        const words = whisper_output.words ?? [];
        if (!words.length) continue;

        const phrases = extractPhrases(words as Word[]);

        // Use a transaction for batch inserting segments
        for (const phrase of phrases) {
          const segment: TranscriptSegment = {
            text: phrase.text,
            startTime: phrase.start,
            endTime: phrase.end,
            id: phrase.id,
            speaker: ""
          };

          db.exec(
            "INSERT INTO segments (id, audioKey, text, startTime, endTime, speaker) VALUES (?, ?, ?, ?, ?, ?)",
            segment.id + crypto.randomUUID(),
            audioKey,
            segment.text,
            segment.startTime,
            segment.endTime,
            segment.speaker
          );

          connection.send(JSON.stringify(segment));
        }
      }

      db.exec(
        "UPDATE transcripts SET status = 'complete' WHERE audioKey = ?",
        audioKey
      );
    } catch (err: any) {
      console.error(err);
      db.exec(
        "UPDATE transcripts SET status = 'error', message = ? WHERE audioKey = ?",
        err.message ?? "failed",
        audioKey
      );
      connection.send(JSON.stringify({ error: `[Error: ${err.message}]` }));
    }
  }

  /**
   * Public RPC method that other Agents can call
   */
  async getFullTranscript(): Promise<string> {
    const audioKey = this.state.audioKey;
    if (!audioKey) return "No transcript available.";

    const segments = this.ctx.storage.sql
      .exec(
        "SELECT text FROM segments WHERE audioKey = ? ORDER BY startTime ASC",
        audioKey
      )
      .toArray() as { text: string }[];

    return segments.map((s) => s.text).join(" ");
  }

  /**
   * Fetches transcript segments within a window relative to targetTime
   */
  async getTranscriptWindow(
    targetTime: number | null,
    windowSeconds: number = 10
  ): Promise<string | null> {
    const audioKey = this.state.audioKey;
    if (!audioKey) return null;

    if (!targetTime) return null;

    const start = targetTime - windowSeconds;
    const end = targetTime + windowSeconds;

    // Fetch segments that overlap with our [start, end] window
    const segments = this.ctx.storage.sql
      .exec(
        `SELECT text, startTime FROM segments 
         WHERE audioKey = ? 
         AND endTime >= ? 
         AND startTime <= ? 
         ORDER BY startTime ASC`,
        audioKey,
        start,
        end
      )
      .toArray() as { text: string; startTime: number }[];

    if (segments.length === 0) return null;

    return segments
      .map((s) => `[${s.startTime.toFixed(1)}s]: ${s.text}`)
      .join("\n");
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    try {
      // The query parameters from useAgent should be in the connection URL
      const urlStr = connection.url || ctx.request?.url;

      if (!urlStr) {
        console.error("No URL available");
        connection.close(1008, "Connection URL missing");
        return;
      }

      console.log("Connection URL:", urlStr);
      const url = new URL(urlStr);

      // Extract query parameters sent by useAgent
      const audioKey = url.searchParams.get("audioKey");

      if (!audioKey) {
        console.error("No audioKey provided in query parameters");
        connection.close(1008, "audioKey query parameter is required");
        return;
      }

      // Store state
      this.setState({
        audioKey
      });

      // Send acknowledgment
      connection.send(
        JSON.stringify({
          type: "connected",
          message: "Transcription connection established",
          audioKey,
          timestamp: Date.now()
        })
      );

      // Start transcription process with the audioKey
      this.ctx.waitUntil(this.runTranscriptionTask(connection, audioKey));
    } catch (error: any) {
      console.error("Error in onConnect:", error);

      try {
        await connection.send(
          JSON.stringify({
            type: "error",
            error: "Failed to establish connection",
            details: error.message
          })
        );
        await connection.close(1011, "Internal server error");
      } catch (closeError) {
        console.error("Error closing connection:", closeError);
      }
    }
  }

  async onMessage(connection: Connection, message: WSMessage) {
    console.log("msg rcv: ", message);
  }

  async onError(error: unknown) {
    console.error(`WS error: ${error}`);
  }

  async onClose(
    connection: Connection,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    console.log(`WS closed: ${code} - ${reason} - wasClean: ${wasClean}`);
    connection.close();
  }

  /**
   * Core transcription primitive.
   * Emits text chunks in order.
   */
  async *transcribe(
    audioKey: string
  ): AsyncGenerator<Ai_Cf_Openai_Whisper_Output, void, unknown> {
    const chunks = await this.getAudioChunks(audioKey);

    let accumulatedSegments: Phrase[] = [];
    let timeOffset = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      let lastWordTimestamp = 0;

      // Transcribe this chunk
      const result = await this.transcribeChunk(chunk);

      // Normalize word timestamps using timeOffset
      if (result.words?.length) {
        const normalizedWords = result.words
          .filter(
            (w): w is Word =>
              typeof w.start === "number" &&
              typeof w.end === "number" &&
              typeof w.word === "string"
          )
          .map((w) => ({
            ...w,
            start: w.start + timeOffset,
            end: w.end + timeOffset
          }));
        lastWordTimestamp = Math.max(...normalizedWords.map((w) => w.end));
        result.words = normalizedWords;
        const phrases = extractPhrases(normalizedWords);
        accumulatedSegments.push(...phrases);
      }

      // Yield normalized chunk
      yield result;

      timeOffset = lastWordTimestamp;
    }
  }

  async getAudioChunks(audioKey: string): Promise<ArrayBuffer[]> {
    const object = await env.R2_AUDIO_BUCKET.get(audioKey);
    if (!object) {
      throw new Error(`Audio not found in R2: ${audioKey}`);
    }

    const arrayBuffer = await object.arrayBuffer();
    const chunkSize = 1024 * 1024; // 1MB
    const chunks: ArrayBuffer[] = [];
    for (let i = 0; i < arrayBuffer.byteLength; i += chunkSize) {
      chunks.push(arrayBuffer.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async transcribeChunk(
    chunkBuffer: ArrayBuffer
  ): Promise<Ai_Cf_Openai_Whisper_Output> {
    const byteArray = Array.from(new Uint8Array(chunkBuffer));

    if (byteArray.length === 0) {
      console.warn("Skipping empty audio chunk");
      return { text: "[Empty chunk]" };
    }

    return await env.AI.run("@cf/openai/whisper", {
      audio: byteArray,
      task: "transcribe"
    });
  }
}
