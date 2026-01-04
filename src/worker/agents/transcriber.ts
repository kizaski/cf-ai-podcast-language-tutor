import {
  type TranscriptSegment,
  type Word,
  type Insert,
  type Phrase
} from "@/types/audio-types";
import {
  extractPhrases,
  setupDatabase,
  base64ToArrayBuffer,
  getAudioDuration
} from "@/utils";
import { Agent, type Connection, type ConnectionContext } from "agents";
import { env } from "cloudflare:workers";
import { parseBuffer } from "music-metadata";

interface TranscriberState {
  audioKey: string;
}

// TODO -- resume (inserts and transcript generation)

// TODO -- rename
export class Transcriber extends Agent<Env, TranscriberState> {
  private activeInsertTasks = new Set<Promise<void>>();
  // doesnt work in Chat tool, use Chat agent in-memory vars for its tools and this for this agent's tools
  isPlayingPodcast = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    console.log("Transcriber initialized");
    setupDatabase(this.ctx.storage.sql);
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    console.log("Client connected:", connection.url);
    const url = new URL(connection.url || ctx.request?.url || "");
    const audioKey = url.searchParams.get("audioKey");

    if (!audioKey) {
      console.warn("audioKey missing, closing connection");
      return connection.close(1008, "audioKey required");
    }

    console.log("Setting state audioKey:", audioKey);
    this.setState({ audioKey });
    connection.send(JSON.stringify({ type: "connected", audioKey }));

    // Start transcription + inserts pipeline
    console.log("Starting pipeline for audioKey:", audioKey);
    await this.runPipeline(connection, audioKey);
  }

  onError(connection: Connection, error?: any) {
    console.error(error);
    // connection.send(JSON.stringify({ type: "error", error: error }));
  }

  onException(connection: Connection, error?: any) {
    console.error(error);
    // connection.send(JSON.stringify({ type: "error", error: error }));
  }

  private sendError(connection: Connection, message: string, details?: any) {
    console.error(message, details);
    connection.send(
      JSON.stringify({ type: "error", message, details: details?.toString() })
    );
  }

  async runPipeline(connection: Connection, audioKey: string) {
    const db = this.ctx.storage.sql;
    let existing;
    try {
      existing = db
        .exec("SELECT status FROM transcripts WHERE audioKey = ?", audioKey)
        .one() as { status: string } | undefined;
    } catch (error) {
      console.log(error);
    }

    console.log("Existing transcript status:", existing?.status);
    if (existing?.status === "complete") {
      console.log("Streaming cached data for audioKey:", audioKey);
      return this.streamCachedData(connection, audioKey).catch((err) => {
        this.sendError(connection, "Transcription pipeline failed", err);
      });
    }

    console.log("Processing new transcription for audioKey:", audioKey);
    this.processNewTranscription(connection, audioKey).catch((err) => {
      this.sendError(connection, "Transcription pipeline failed", err);
    });
  }

  private async streamCachedData(connection: Connection, audioKey: string) {
    console.log("Fetching segments from DB for audioKey:", audioKey);
    const segments = this.sql<TranscriptSegment>`
      SELECT text, startTime, endTime, id, speaker 
      FROM segments WHERE audioKey = ${audioKey} ORDER BY startTime ASC`;

    console.log(`Streaming ${segments.length} cached segments`);
    for (const segment of segments) {
      connection.send(
        JSON.stringify({ type: "transcript", transcript: segment })
      );
    }

    const chunks = this.chunkTranscript(segments);
    console.log(`Streaming inserts in ${chunks.length} chunks`);
    for (const chunk of chunks) {
      const inserts = await this.getOrGenerateInserts(audioKey, chunk);
      inserts.forEach((insert) => {
        console.log("Streaming cached insert:", insert.id);
        connection.send(JSON.stringify({ type: "insert", insert }));
      });
    }

    console.log("All inserts streamed");
    connection.send(JSON.stringify({ type: "insert-complete" }));
  }

  private async processNewTranscription(
    connection: Connection,
    audioKey: string
  ) {
    console.log("Inserting in_progress transcript record for:", audioKey);
    const db = this.ctx.storage.sql;
    db.exec(
      "INSERT OR IGNORE INTO transcripts (audioKey, status) VALUES (?, 'in_progress')",
      audioKey
    );

    let currentBuffer: TranscriptSegment[] = [];
    let currentWordCount = 0;

    for await (const result of this.transcribe(audioKey)) {
      if (!result) return;

      if ("error" in result) {
        this.sendError(connection, "Transcription chunk error", result.error);
        continue;
      }

      console.log("Transcription chunk received:", result.text?.slice(0, 50));
      const phrases = extractPhrases(result.words as Word[]);

      for (const phrase of phrases) {
        const segment = this.mapPhraseToSegment(phrase);
        console.log("Saving segment:", segment.id);
        this.saveSegment(audioKey, segment);

        connection.send(
          JSON.stringify({ type: "transcript", transcript: segment })
        );

        currentBuffer.push(segment);
        currentWordCount += segment.text.length;

        // TODO -- make this (120 * 7) dynamic
        if (currentWordCount > 120 * 7) {
          console.log("Triggering background insert for buffered segments");
          this.triggerBackgroundInsert(connection, audioKey, [
            ...currentBuffer
          ]);
          currentBuffer = [];
          currentWordCount = 0;
        }
      }
    }

    if (currentBuffer.length > 0) {
      console.log("Triggering final background insert for leftover segments");
      this.triggerBackgroundInsert(connection, audioKey, currentBuffer);
    }

    await Promise.all(this.activeInsertTasks);
    console.log("All insert tasks complete, marking transcript complete");
    db.exec(
      "UPDATE transcripts SET status='complete' WHERE audioKey=?",
      audioKey
    );
    connection.send(JSON.stringify({ type: "insert-complete" }));
  }

  private triggerBackgroundInsert(
    connection: Connection,
    audioKey: string,
    segments: TranscriptSegment[]
  ) {
    console.log(
      "Creating background insert task for segments:",
      segments.map((s) => s.id)
    );
    const chunk = {
      startTime: segments[0].startTime,
      endTime: segments[segments.length - 1].endTime,
      text: segments.map((s) => s.text).join(" "),
      id: crypto.randomUUID(),
      speaker: ""
    };

    const task = this.getOrGenerateInserts(audioKey, chunk)
      .then((inserts) => {
        inserts.forEach((insert) => {
          console.log("Streaming generated insert:", insert.id);
          connection.send(JSON.stringify({ type: "insert", insert }));
        });
      })
      .catch((err) => {
        console.error("Background insert task finished with error:", err);
        this.sendError(connection, "Background insert failed", err);
      })
      .finally(() => {
        console.log("Background insert task complete for chunk:", chunk.id);
        this.activeInsertTasks.delete(task);
      });

    this.activeInsertTasks.add(task);
  }

  private mapPhraseToSegment(phrase: Phrase): TranscriptSegment {
    return {
      text: phrase.text,
      startTime: phrase.start,
      endTime: phrase.end,
      id: phrase.id,
      speaker: ""
    };
  }

  private saveSegment(audioKey: string, s: TranscriptSegment) {
    try {
      console.log("DB insert segment:", s.id);
      this.ctx.storage.sql.exec(
        "INSERT INTO segments (id, audioKey, text, startTime, endTime, speaker) VALUES (?, ?, ?, ?, ?, ?)",
        `${s.id}_${crypto.randomUUID()}`,
        audioKey,
        s.text,
        s.startTime,
        s.endTime,
        s.speaker
      );
    } catch (e) {
      console.error("DB Insert Error", e);
    }
  }

  private async getOrGenerateInserts(
    audioKey: string,
    chunk: TranscriptSegment
  ): Promise<Insert[]> {
    console.log(
      "Checking cached inserts for chunk:",
      chunk.startTime,
      chunk.endTime
    );
    const cached = this.getCachedInserts(audioKey, chunk);
    if (cached.length > 0) {
      console.log(
        "Found cached inserts:",
        cached.map((i) => i.id)
      );
      return cached;
    }
    console.log("No cached inserts, generating new inserts for chunk");
    return this.generateInsertsForChunk(audioKey, chunk);
  }

  private chunkTranscript(
    segments: TranscriptSegment[],
    windowSeconds = 60,
    overlapSeconds = 5
  ): TranscriptSegment[] {
    console.log("Chunking transcript segments");
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

    console.log(`Transcript chunked into ${chunks.length} chunks`);
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

  private getCachedInserts(
    audioKey: string,
    chunk: TranscriptSegment
  ): Insert[] {
    const cachedInserts = this.sql<Insert>`
        SELECT * FROM inserts 
        WHERE audioKey = ${audioKey}
          AND startTime >= ${chunk.startTime} 
          AND startTime < ${chunk.endTime}
        ORDER BY startTime ASC
      `;
    return cachedInserts ?? [];
  }

  private async generateInsertsForChunk(
    audioKey: string,
    chunk: TranscriptSegment
  ): Promise<Insert[]> {
    const cachedInserts = this.getCachedInserts(audioKey, chunk);
    if (cachedInserts.length > 0) {
      console.log(
        `Using cached inserts for chunk ${chunk.startTime}-${chunk.endTime}`
      );
      console.log(cachedInserts[0]);

      return cachedInserts;
    }

    // TODO -- let agent decide where to place the insert in the audio
    const plan = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `
You are an AI assistant creating language-learning primers for podcast audio. 
For this 60-second transcript segment, generate exactly TWO inserts:

1. Intro (before the podcast audio): 
   - 2-3 sentences max
   - Summarize or explain the key content of this chunk for a language learner
2. Outro (after the podcast audio):
   - 2-3 sentences max
   - Recap the main takeaway from this chunk

Constraints:
- IMPORTANT: ONLY reply in English, NO words in the target language
- ONLY one intro and one outro per chunk
- Do NOT reference content outside this chunk
- Tone: friendly, conversational, learner-focused
        `
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
              title: { type: "string" },
              content: { type: "string" }
            },
            required: ["type", "title", "content"]
          }
        }
      }
    });

    console.log("inserts gen llm resp:", plan);

    if (!Array.isArray(plan.response) || !plan.response.length) return [];

    const inserts: Insert[] = [];

    for (const item of plan.response) {
      if (!item.content) continue;

      const { audio }: any = await env.AI.run("@cf/myshell-ai/melotts", {
        prompt: item.content,
        lang: "en"
      });
      const audioKeyInsert = `${audioKey}-${crypto.randomUUID()}.mp3`;
      await env.R2_AUDIO_BUCKET.put(audioKeyInsert, base64ToArrayBuffer(audio));
      const audioBuffer = base64ToArrayBuffer(audio);
      const duration = await getAudioDuration(audioBuffer, "audio/wav");

      console.log("INSERT AUDIO DURATION:", duration, {
        start: item.type === "intro" ? chunk.startTime : chunk.endTime,
        type: item.type
      });

      const insert = {
        id: crypto.randomUUID(),
        type: item.type,
        title: item.title,
        startTime: item.type === "intro" ? chunk.startTime : chunk.endTime,
        endTime: chunk.endTime + duration,
        duration,
        text: item.content,
        audioUrl: audioKeyInsert,
        enabled: true,
        metadata: {}
      };

      inserts.push(insert);

      // Save to DB for caching
      console.log(
        `Saving insert to cache: id: ${insert.id} startTime: ${insert.startTime} endTime: ${insert.endTime}`
      );
      try {
        this
          .sql`INSERT INTO inserts (id, audioKey, startTime, endTime, type, title, text, audioUrl, duration, enabled)
         VALUES (${insert.id}, ${audioKey}, ${insert.startTime}, ${insert.endTime}, ${insert.type}, ${insert.title}, ${item.content}, ${insert.audioUrl}, ${insert.duration}, ${1})`;
      } catch (error) {
        console.error(error);
      }
    }

    return inserts;
  }

  /**
   * Core transcription primitive.
   * Emits text chunks in order.
   */
  async *transcribe(
    audioKey: string
  ): AsyncGenerator<Ai_Cf_Openai_Whisper_Output | undefined | { error: any }> {
    const chunks = await this.getAudioChunks(audioKey);

    let accumulatedSegments: Phrase[] = [];
    let timeOffset = 0;

    for (let i = 0; i < chunks.length; i++) {
      console.log(`Transcribing chunk ${i + 1}/${chunks.length}`);
      const chunk = chunks[i];

      let lastWordTimestamp = 0;
      let result;
      try {
        result = await this.transcribeChunk(chunk);
      } catch (err) {
        yield { error: err };
        continue;
      }

      if (result && "words" in result && result.words?.length) {
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

      yield result ?? undefined;
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
  ): Promise<Ai_Cf_Openai_Whisper_Output | undefined | { error: any }> {
    console.log(
      "Transcribing raw audio chunk of size:",
      chunkBuffer.byteLength
    );
    const byteArray = Array.from(new Uint8Array(chunkBuffer));

    if (byteArray.length === 0) {
      console.warn("Skipping empty audio chunk");
      return { text: "[Empty chunk]" };
    }

    try {
      // console.log(await parseBuffer(new Uint8Array(chunkBuffer)));
      return await env.AI.run("@cf/openai/whisper", {
        audio: byteArray,
        task: "transcribe"
      });
    } catch (error) {
      console.error(error);
      console.log(typeof error);

      return { error: error };
    }
  }
}
