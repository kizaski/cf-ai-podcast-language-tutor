import {
  Agent,
  getAgentByName,
  routeAgentRequest,
  type Schedule
} from "agents";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import {
  processToolCalls,
  cleanupMessages,
  base64ToUint8Array,
  getTranscriptKV,
  putTranscriptKV,
  type TranscriptKV,
  getAudioDuration,
  sendEvent,
  extractPhrases
} from "./utils";
import { tools, executions } from "./tools";
import { createWorkersAI } from "workers-ai-provider";
import { env } from "cloudflare:workers";
import type {
  Episode,
  EpisodeData,
  Insert,
  TranscriptSegment,
  Word
} from "./types/audio-types";

const workersai = createWorkersAI({ binding: env.AI });
const model = workersai("@cf/meta/llama-3.2-3b-instruct");

const PRIMER_GENERATION_PROMPT = `You are an educational audio assistant.

Your task is to take a FULL transcript and transform it into MULTIPLE learning “Priming Sandwich” units.

...
`; // TODO -- make & move to separate file

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools
      // ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks... 

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

export class Transcriber extends Agent<Env> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const audioKey = url.pathname.split("/")[3];
    if (!audioKey) {
      return new Response("Missing audioKey", { status: 400 });
    }

    const cached = await getTranscriptKV(env, audioKey);

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      if (cached?.status === "complete") {
        console.log("have cached transcript.");

        for (const segment of cached.segments) {
          await sendEvent(segment, writer, encoder);
        }
      }

      let accumulated: TranscriptSegment[] =
        cached?.status === "in_progress" ? cached.segments : [];

      try {
        await putTranscriptKV(env, audioKey, {
          status: "in_progress",
          segments: accumulated
        });

        // TODO -- fix transcription starting over instead of continuing
        for await (const whisper_output of this.transcribe(audioKey)) {
          const words = whisper_output.words ?? [];

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

            await sendEvent(segment, writer, encoder);
            accumulated.push(segment);
          }

          await putTranscriptKV(env, audioKey, {
            status: "in_progress",
            segments: accumulated
          });
        }

        // mark complete
        await putTranscriptKV(env, audioKey, {
          status: "complete",
          segments: accumulated
        });
      } catch (err: any) {
        await putTranscriptKV(env, audioKey, {
          status: "error",
          message: err.message ?? "transcription failed"
        });
        await sendEvent(
          { error: "[Error during transcription]" },
          writer,
          encoder
        );
      } finally {
        await writer.close();
      }
    })().catch((error) => {
      console.error("Unhandled error in Transcriber:", error);
    });

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache"
      }
    });
  }

  /**
   * Core transcription primitive.
   * Emits text chunks in order.
   */
  async *transcribe(
    audioKey: string
  ): AsyncGenerator<Ai_Cf_Openai_Whisper_Output, void, unknown> {
    const chunks = await this.getAudioChunks(audioKey);

    let timeOffset = 0;

    for (const chunk of chunks) {
      // Get exact duration of this chunk
      const durationSec = await getAudioDuration(chunk);

      // Transcribe this chunk
      const result = await this.transcribeChunk(chunk);

      // Normalize word timestamps using timeOffset
      if (result.words?.length) {
        result.words = result.words
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
      }

      // Yield normalized chunk
      yield result;

      // Increment timeOffset by this chunk’s duration
      timeOffset += durationSec;
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

    const res = await env.AI.run("@cf/openai/whisper", {
      audio: byteArray,
      task: "transcribe"
    });

    if (typeof res === "object" && "text" in res) {
      return res;
    }

    throw new Error("Transcription failed or invalid response format");
  }
}

export function getSessionId(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .map((c) => c.split("="));

  const session = cookies.find(([name]) => name === "session_id");
  if (!session) return null;

  const [, value] = session;
  return value ? decodeURIComponent(value) : null;
}

export async function handleAudioQuery(
  request: Request,
  env: Env,
  episodeId: string
) {
  try {
    // Check if the audio file exists in R2
    const object = await env.R2_AUDIO_BUCKET.head(episodeId);

    if (!object) {
      return new Response(JSON.stringify({ error: "Episode not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build episode metadata
    const episode: Episode = {
      id: episodeId,
      title: episodeId,
      duration: 0, // can be calculated
      audioUrl: episodeId,
      publishedDate: new Date().toISOString(),
      description: ""
    };

    // Full EpisodeData structure
    const episodeData: EpisodeData = {
      episode,
      inserts: [], // No inserts by default
      transcript: [] // No transcript by default
    };

    return new Response(JSON.stringify(episodeData), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Query error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch episode." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function handleAudioUpload(
  request: Request,
  env: Env,
  sessionId: string,
  ctx: ExecutionContext
) {
  try {
    const formData = await request.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No audio file provided." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check file type
    if (!file.type.startsWith("audio/")) {
      return new Response(
        JSON.stringify({ error: "Invalid audio file type." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check size
    const MAX_SIZE = 150 * 1024 * 1024; // 150MB
    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "Audio file too large." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Store file in R2
    const arrayBuffer = await file.arrayBuffer();
    // const timestamp = Date.now();
    // const fileNameExtended = `audio-${timestamp}-${file.name}`;

    await env.R2_AUDIO_BUCKET.put(file.name, arrayBuffer, {
      httpMetadata: {
        contentType: file.type
      }
    });

    // Create episode object
    const episode: Episode = {
      id: file.name,
      title: file.name,
      duration: 0, // can be calculated later
      audioUrl: "/api/r2/" + file.name,
      publishedDate: new Date().toISOString(),
      description: ""
    };

    return new Response(
      JSON.stringify({
        message: "Audio uploaded successfully",
        fileName: file.name,
        size: file.size,
        episode
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Upload error:", err);
    return new Response(JSON.stringify({ error: "Upload failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function handleR2Query(request: Request, env: Env, key: string) {
  try {
    const object = await env.R2_AUDIO_BUCKET.get(key);
    if (!object) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType || "application/octet-stream",
        "Content-Length": object.size.toString()
      }
    });
  } catch (err) {
    console.error(err);
    return new Response("Failed to fetch R2 object", { status: 500 });
  }
}

export function chunkTranscript(
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

      // Slide window forward with overlap
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

export async function generateInsertsForChunk(
  env: Env,
  episodeId: string,
  chunk: TranscriptSegment
): Promise<Insert[]> {
  const plan = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    messages: [
      {
        role: "system",
        content: `
You are an audio editor.

You are given a transcript chunk with a start and end time.
Create inserts ONLY if they belong within this time window.

If no insert is needed, return an empty JSON array.
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
            atTime: { type: "number" },
            title: { type: "string" },
            content: { type: "string" }
          },
          required: ["type", "atTime", "title", "content"]
        }
      }
    }
  });

  if (!Array.isArray(plan.response) || !plan.response.length) {
    return [];
  }

  const inserts: Insert[] = [];

  for (const item of plan.response) {
    const { audio }: any = await env.AI.run("@cf/myshell-ai/melotts", {
      prompt: item.content,
      lang: "en"
    });

    const audioKey = `${episodeId}-${crypto.randomUUID()}.mp3`;

    await env.R2_AUDIO_BUCKET.put(audioKey, base64ToUint8Array(audio));

    const duration = await getAudioDuration(audio);

    inserts.push({
      id: crypto.randomUUID(),
      type: item.type,
      title: item.title,
      startTime: item.atTime,
      endTime: duration + item.atTime,
      duration: duration,
      audioUrl: audioKey,
      enabled: true,
      metadata: {
        chunkStart: chunk.startTime,
        chunkEnd: chunk.endTime
      }
    });
  }

  return inserts;
}

export async function waitForTranscript(
  env: Env,
  episodeId: string,
  timeoutMs = 90_000
): Promise<TranscriptKV> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const transcript = await getTranscriptKV(env, episodeId);

    if (transcript?.status === "complete") {
      return transcript;
    }

    if (transcript?.status === "error") {
      throw new Error("Transcript failed");
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Transcript timeout");
}

export async function handleInsertsStream(
  request: Request,
  env: Env,
  episodeId: string
): Promise<Response> {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const transcript = await waitForTranscript(env, episodeId);

      if (transcript.status !== "complete") {
        throw new Error("Transcript not complete");
      }

      const chunks = chunkTranscript(
        transcript.segments,
        60, // seconds per chunk
        5 // overlap
      );

      const allInserts: Insert[] = [];

      for (const chunk of chunks) {
        const inserts = await generateInsertsForChunk(env, episodeId, chunk);

        for (const insert of inserts) {
          allInserts.push(insert);
          await sendEvent(insert, writer, encoder);
        }
      }

      await env.KV.put(`inserts:${episodeId}`, JSON.stringify(allInserts));

      await sendEvent({ type: "complete" }, writer, encoder);
    } catch (err: any) {
      console.error("Insert stream failed", err);
      await sendEvent(
        {
          type: "error",
          message: err.message || "Insert generation failed"
        },
        writer,
        encoder
      );
    } finally {
      await writer.close();
    }
  })().catch((err) => {
    console.error(err);
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Handle non-agent routes FIRST
    if (url.pathname === "/test") {
      return Response.json({ success: true });
    }

    // Get or create session
    let sessionId = getSessionId(request);
    let isNewSession = false;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      isNewSession = true;
    }

    // Rewrite URL for agent routing dynamically
    const agentUrl = new URL(request.url);
    const originalPath = agentUrl.pathname.replace(/^\/+/, ""); // remove leading slash

    // Extract segments from path
    const segments = originalPath.split("/");

    // Assume the first segment is the agent type and the last segment is the action
    const agentType = segments[1] ?? "default"; // fallback if missing
    const lastSegment = segments.pop() ?? ""; // last segment of the path

    // Build new path dynamically
    agentUrl.pathname = `/agents/${agentType}/${sessionId}/${lastSegment}`;

    if (url.pathname.startsWith("/api/episodes/")) {
      const parts = url.pathname.split("/"); // ["", "api", "episodes", ...]
      const lastPart = decodeURIComponent(parts[parts.length - 1]);

      // POST /api/episodes/upload-audio
      if (request.method === "POST" && lastPart === "upload-audio") {
        return handleAudioUpload(request, env, sessionId, ctx);
      }

      // GET /api/episodes/:id
      if (request.method === "GET" && parts.length === 4) {
        // const episodeId = parts[3];
        return handleAudioQuery(request, env, lastPart);
      }

      if (
        request.method === "GET" &&
        parts.length === 5 &&
        lastPart === "transcribe-stream"
      ) {
        const transcriber = await getAgentByName<Env, Transcriber>(
          env.Transcriber,
          sessionId
        );

        return transcriber.fetch(request);
      }

      // GET /api/episodes/:id/inserts-stream
      if (
        request.method === "GET" &&
        parts.length === 5 &&
        parts[4] === "inserts-stream"
      ) {
        const episodeId = parts[3];
        return handleInsertsStream(request, env, episodeId);
      }
    }

    if (url.pathname.startsWith("/api/r2/")) {
      const parts = url.pathname.split("/");

      // GET /api/r2/:key
      if (request.method === "GET" && parts.length === 4) {
        const key = parts[3];
        return handleR2Query(request, env, key);
      }
    }

    const agentRequest = new Request(agentUrl.toString(), request);

    let response =
      (await routeAgentRequest(agentRequest, env)) ??
      (await env.ASSETS.fetch(request)) ??
      new Response("Not found", { status: 404 });

    // Persist session via cookie
    if (isNewSession) {
      response = new Response(response.body, response);
      response.headers.set(
        "Set-Cookie",
        `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
      );
    }

    return response;
  }
} satisfies ExportedHandler<Env>;
