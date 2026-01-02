import type {
  TranscriptSegment,
  Word,
  Phrase,
  Insert
} from "@/types/audio-types";
import {
  extractPhrases,
  setupDatabase,
  base64ToArrayBuffer,
  getAudioDuration
} from "@/utils";
import { Agent, type Connection, type ConnectionContext } from "agents";
import { env } from "cloudflare:workers";

interface TranscriberState {
  audioKey: string;
}

// TODO -- rename
export class Transcriber extends Agent<Env, TranscriberState> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Initialize schema on startup
    setupDatabase(this.ctx.storage.sql);
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const urlStr = connection.url || ctx.request?.url;
    if (!urlStr) return connection.close(1008, "Connection URL missing");

    const url = new URL(urlStr);
    const audioKey = url.searchParams.get("audioKey");
    if (!audioKey) return connection.close(1008, "audioKey required");

    this.setState({ audioKey });

    // Acknowledge
    connection.send(
      JSON.stringify({
        type: "connected",
        audioKey,
        message: "Connection established"
      })
    );

    // Start transcription + inserts pipeline
    this.runPipeline(connection, audioKey);
  }

  async runPipeline(connection: Connection, audioKey: string) {
    const db = this.ctx.storage.sql;

    // 1️⃣ Transcription
    const rows: TranscriptSegment[] = [];

    // TODO -- connection send working...
    console.log("working on transcript...");

    for await (const chunk of this.transcribe(audioKey)) {
      const words = chunk.words ?? [];
      if (!words.length) continue;

      const phrases = extractPhrases(words as Word[]);

      for (const phrase of phrases) {
        const segment: TranscriptSegment = {
          text: phrase.text,
          startTime: phrase.start,
          endTime: phrase.end,
          id: phrase.id,
          speaker: ""
        };

        const segmentId = `${segment.id}_${crypto.randomUUID()}`;

        try {
          db.exec(
            "INSERT INTO segments (id, audioKey, text, startTime, endTime, speaker) VALUES (?, ?, ?, ?, ?, ?)",
            segmentId,
            audioKey,
            segment.text,
            segment.startTime,
            segment.endTime,
            segment.speaker
          );
        } catch (error) {
          console.error(error);
        }

        rows.push(segment);

        console.log(segment);

        // Stream transcript segment to frontend
        connection.send(
          JSON.stringify({ type: "transcript", transcript: segment })
        );
      }
    }

    db.exec(
      "UPDATE transcripts SET status='complete' WHERE audioKey=?",
      audioKey
    );

    // 2️⃣ Inserts generation (streamed)
    await this.generateInserts(connection, audioKey, rows);

    // 3️⃣ Notify completion
    connection.send(JSON.stringify({ type: "insert-complete" }));
  }

  private async generateInserts(
    connection: Connection,
    audioKey: string,
    segments: TranscriptSegment[]
  ) {
    const chunks = this.chunkTranscript(segments, 60, 5);

    for (const chunk of chunks) {
      console.log("CHUNK: ", chunk);
      const inserts = await this.generateInsertsForChunk(audioKey, chunk);

      for (const insert of inserts) {
        // Stream each insert to frontend
        connection.send(JSON.stringify({ type: "insert", insert }));
      }
    }
  }

  private chunkTranscript(
    segments: TranscriptSegment[],
    windowSeconds = 60,
    overlapSeconds = 5
  ): TranscriptSegment[] {
    if (!segments.length) return [];

    const chunks: TranscriptSegment[] = [];
    let buffer: TranscriptSegment[] = [];
    let windowStart = segments[0].startTime;

    for (const seg of segments) {
      buffer.push(seg);
      const windowEnd = seg.endTime;
      const duration = windowEnd - windowStart;

      if (duration >= windowSeconds) {
        chunks.push({
          startTime: windowStart,
          endTime: windowEnd,
          text: buffer.map((s) => s.text).join(" "),
          id: "",
          speaker: ""
        });

        const cutoff = windowEnd - overlapSeconds;
        buffer = buffer.filter((s) => s.endTime > cutoff);
        windowStart = buffer[0]?.startTime ?? windowEnd;
      }
    }

    if (buffer.length) {
      chunks.push({
        startTime: windowStart,
        endTime: buffer[buffer.length - 1].endTime,
        text: buffer.map((s) => s.text).join(" "),
        id: "",
        speaker: ""
      });
    }

    return chunks;
  }

  /**
   * Fetches transcript segments within a window relative to targetTime
   */
  async getTranscriptWindowText(
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

  private async generateInsertsForChunk(
    audioKey: string,
    chunk: TranscriptSegment
  ): Promise<Insert[]> {
    // 1️⃣ LLM generates insert plan
    const plan = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        {
          role: "system",
          content: "You are an audio editor. Create inserts for this chunk."
        },
        {
          role: "user",
          content: JSON.stringify({
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            transcript: chunk.text
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              atTime: { type: "number" },
              title: { type: "string" },
              content: { type: "string" }
            },
            required: ["type", "atTime", "title", "content"]
          }
        }
      }
    });

    if (!Array.isArray(plan.response) || !plan.response.length) return [];

    const inserts: Insert[] = [];

    for (const item of plan.response) {
      if (!item.content) continue;

      // 2️⃣ Generate TTS
      const { audio }: any = await env.AI.run("@cf/myshell-ai/melotts", {
        prompt: item.content,
        lang: "en"
      });
      const audioKeyInsert = `${audioKey}-${crypto.randomUUID()}.mp3`;
      await env.R2_AUDIO_BUCKET.put(audioKeyInsert, base64ToArrayBuffer(audio));
      const duration = await getAudioDuration(audio);

      inserts.push({
        id: crypto.randomUUID(),
        type: item.type,
        title: item.title,
        startTime: item.atTime,
        endTime: item.atTime + duration,
        duration,
        audioUrl: audioKeyInsert,
        enabled: true,
        metadata: { chunkStart: chunk.startTime, chunkEnd: chunk.endTime }
      });
    }

    return inserts;
  }

  /**
   * Core transcription primitive.
   * Emits text chunks in order.
   */
  async *transcribe(
    audioKey: string
  ): AsyncGenerator<Ai_Cf_Openai_Whisper_Output> {
    const chunks = await this.getAudioChunks(audioKey);

    let accumulatedSegments: Phrase[] = [];
    let timeOffset = 0;

    for (let i = 0; i < chunks.length; i++) {
      console.log("transcribing...");

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
