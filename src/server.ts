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
  type TranscriptKV
} from "./utils";
import { tools, executions } from "./tools";
import { createWorkersAI } from "workers-ai-provider";
import { env } from "cloudflare:workers";
import type { Episode, EpisodeData, Insert } from "./types/audio-types";
import { parseBuffer } from "music-metadata";

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

    if (cached?.status === "complete") {
      return new Response(cached.text, {
        headers: { "Content-Type": "text/plain" }
      });
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      let accumulatedTranscript =
        cached?.status === "in_progress" ? cached.text : "";

      try {
        await putTranscriptKV(env, audioKey, {
          status: "in_progress",
          text: accumulatedTranscript
        });

        for await (const text of this.transcribe(audioKey)) {
          accumulatedTranscript += text + "\n";

          // Stream the chunk to the client immediately
          await writer.write(encoder.encode(text + "\n"));

          // incremental KV update
          await putTranscriptKV(env, audioKey, {
            status: "in_progress",
            text: accumulatedTranscript
          });
        }

        // mark complete
        await putTranscriptKV(env, audioKey, {
          status: "complete",
          text: accumulatedTranscript
        });
      } catch (err: any) {
        await putTranscriptKV(env, audioKey, {
          status: "error",
          message: err.message ?? "transcription failed"
        });
        await writer.write(encoder.encode("[Error during transcription]\n"));
      } finally {
        await writer.close();
      }
    })();

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
  async *transcribe(audioKey: string): AsyncGenerator<string, void, unknown> {
    const chunks = await this.getAudioChunks(audioKey);

    for (const chunk of chunks) {
      const result = await this.transcribeChunk(chunk);
      yield result.text;
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

  /** Transcribe full audio and return text */
  async transcribeAudio(audioKey: string): Promise<string> {
    const cached = await getTranscriptKV(env, audioKey);
    if (cached?.status === "complete") {
      return cached.text;
    }

    if (cached?.status === "in_progress") {
      // wait until another worker finishes
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const retry = await getTranscriptKV(env, audioKey);
        if (retry?.status === "complete") return retry.text;
      }
      throw new Error("Transcript stuck in progress");
    }

    let full = "";
    await putTranscriptKV(env, audioKey, {
      status: "in_progress",
      text: ""
    });

    for await (const text of this.transcribe(audioKey)) {
      full += text + "\n";
      await putTranscriptKV(env, audioKey, {
        status: "in_progress",
        text: full
      });
    }

    await putTranscriptKV(env, audioKey, {
      status: "complete",
      text: full
    });

    return full;
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

    ctx.waitUntil(processEpisodeInBackground(env, file.name, sessionId));

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

async function processEpisodeInBackground(
  env: Env,
  episodeId: string,
  sessionId: string
) {
  const cached = await getTranscriptKV(env, episodeId);

  if (cached?.status === "complete") {
    console.log("Transcript cache hit:", episodeId);
  } else {
    const transcriber = await getAgentByName<Env, Transcriber>(
      env.Transcriber,
      sessionId
    );
    await transcriber.transcribeAudio(episodeId);
  }

  let finalTranscript = "";
  const transcriptKV = (await getTranscriptKV(env, episodeId)) as TranscriptKV;

  if (transcriptKV.status === "error") {
    console.error(transcriptKV.message);
    return;
  } else {
    finalTranscript = transcriptKV.text;
  }

  const inserts = await generatePrimerAndSummary(
    env,
    episodeId,
    finalTranscript
  );

  await env.KV.put(`inserts:${episodeId}`, JSON.stringify(inserts));
}

async function generatePrimerAndSummary(
  env: Env,
  episodeId: string,
  transcript: string
): Promise<Insert[]> {
  // 1. Generate primer text
  const primer = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    messages: [
      {
        role: "system",
        content: PRIMER_GENERATION_PROMPT
      },
      {
        role: "user",
        content: transcript
      }
    ]
  });

  const primerText = primer.response;

  if (!primerText) return [];

  // 2. Convert primer to audio
  // TODO -- use chatterbox
  const { audio }: any = await env.AI.run("@cf/myshell-ai/melotts", {
    prompt: primerText.trim(),
    lang: "en"
  });
  // const expl_audio: any = await replicate.run(
  //   "chatterbox/",
  //   { input: { language: "EN", text: item.trim() } }
  // );

  // 3. Store in R2
  const audioKey = `${episodeId}-intro.mp3`;

  await env.R2_AUDIO_BUCKET.put(audioKey, base64ToUint8Array(audio));

  // 4. Return an Insert
  return [
    {
      id: crypto.randomUUID(),
      type: "primer_intro",
      audioUrl: audioKey,
      startTime: 0, // TODO
      title: "",
      duration: 0,
      endTime: 0,
      enabled: false,
      metadata: {}
    }
  ];
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

export class InsertsStreamer extends Agent<Env> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/");
    const episodeId = parts[3];

    if (!episodeId) {
      return new Response("Missing episodeId", { status: 400 });
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        let transcript = "";
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds timeout

        // 1. Poll KV for the transcript (wait for Transcriber to start)
        while (!transcript && attempts < maxAttempts) {
          transcript = (await env.KV.get(`transcript:${episodeId}`)) || "";

          if (!transcript) {
            // Optional: send a heartbeat or "waiting" status to the client
            await writer.write(encoder.encode(": keep-alive\n\n"));
            await new Promise((resolve) => setTimeout(resolve, 2000));
            attempts++;
          }
        }

        if (!transcript) {
          await writer.write(
            encoder.encode("[Timeout: Transcript not found]\n")
          );
          return;
        }

        // 2. Generate inserts based on the (potentially partial) transcript
        // Note: You could add logic here to wait until the transcript is
        // a certain length before generating.
        const inserts: Insert[] = await this.generateInserts(
          episodeId,
          transcript
        );

        for (const insert of inserts) {
          await writer.write(encoder.encode(JSON.stringify(insert) + "\n"));
        }

        // 3. Save the generated inserts back to KV for persistence
        await env.KV.put(`inserts:${episodeId}`, JSON.stringify(inserts));
      } catch (err) {
        console.error("Error generating inserts:", err);
        await writer.write(encoder.encode("[Error generating inserts]\n"));
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  }

  async generateInserts(
    episodeId: string,
    transcript: string
  ): Promise<Insert[]> {
    return await generatePrimerAndSummary(env, episodeId, transcript);
  }
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
        const newRequest = new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });

        return transcriber.fetch(newRequest);
      }

      // GET /api/episodes/:id/inserts-stream
      if (
        request.method === "GET" &&
        parts.length === 5 &&
        parts[4] === "inserts-stream"
      ) {
        const episodeId = parts[3];

        // Create a streaming response
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        const encoder = new TextEncoder();

        ctx.waitUntil(
          new Promise(async () => {
            try {
              // Check if we already have inserts
              const cachedInserts = await env.KV.get(`inserts:${episodeId}`);

              if (cachedInserts) {
                // Stream cached inserts
                const inserts = JSON.parse(cachedInserts);
                for (const insert of inserts) {
                  writer.write(encoder.encode(JSON.stringify(insert) + "\n"));
                }
              } else {
                // Wait for transcript first
                let transcript = "";
                let attempts = 0;
                const maxAttempts = 60; // Wait up to 2 minutes

                while (!transcript && attempts < maxAttempts) {
                  transcript =
                    (await env.KV.get(`transcript:${episodeId}`)) || "";
                  if (!transcript) {
                    // Send keep-alive
                    writer.write(
                      encoder.encode(": waiting-for-transcript\n\n")
                    );
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    attempts++;
                  }
                }

                if (!transcript) {
                  writer.write(
                    encoder.encode("[Error: Transcript not available]\n")
                  );
                  writer.close();
                  return;
                }

                // Generate inserts
                const streamer = await getAgentByName<Env, InsertsStreamer>(
                  env.InsertsStreamer,
                  sessionId!
                );
                const inserts = await streamer.generateInserts(
                  episodeId,
                  transcript
                );

                // Stream inserts
                for (const insert of inserts) {
                  writer.write(encoder.encode(JSON.stringify(insert) + "\n"));
                }

                // Cache inserts
                await env.KV.put(
                  `inserts:${episodeId}`,
                  JSON.stringify(inserts)
                );
              }
            } catch (error: any) {
              console.error("Inserts stream error:", error);
              writer.write(encoder.encode(`[Error: ${error.message}]\n`));
            } finally {
              writer.close();
            }
          })
        );

        return new Response(stream.readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
          }
        });
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
