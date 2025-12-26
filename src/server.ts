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
// import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages, base64ToUint8Array } from "./utils";
import { tools, executions } from "./tools";
import { createWorkersAI } from "workers-ai-provider";
import { env } from "cloudflare:workers";
import type { Episode, EpisodeData, Insert } from "./types/audio-types";
import { parseBuffer } from "music-metadata";
// import { streamObject } from "ai";

const workersai = createWorkersAI({ binding: env.AI });
const model = workersai("@cf/meta/llama-3.2-3b-instruct");

const PRIMER_GENERATION_PROMPT = `You are an educational audio assistant.

Your task is to take a FULL transcript and transform it into MULTIPLE learning “Priming Sandwich” units.

Each unit consists of:
1. An INTRO (Priming)
2. The MAIN AUDIO (unchanged, not rewritten)
3. An OUTRO (Review)

────────────────────────
OBJECTIVE
────────────────────────

Instead of cutting every few seconds, you will:
- Group the transcript into logical “chapters” or “paragraphs”
- Each chapter should be ~30–60 seconds of spoken audio
- Chapters should follow natural topic or idea boundaries

────────────────────────
INPUTS YOU WILL RECEIVE
────────────────────────

1. Target Audience:
   - Language level (e.g., beginner / intermediate / advanced)
   - Learning goal (e.g., vocabulary, listening comprehension)

2. Full Transcript:
   - Contains timestamps and subtitles for the entire audio
   - Use timestamps ONLY to help segment the content
   - Do NOT reference timestamps in the output

────────────────────────
YOUR TASK (STEP BY STEP)
────────────────────────

Step 1: Segment the Transcript
- Divide the full transcript into 30–60 second chapters
- Each chapter should cover one main idea or subtopic
- Do NOT split mid-sentence or mid-idea

Step 2: For EACH Chapter, Generate:
- An INTRO (Priming)
- An OUTRO (Review)

────────────────────────
INTRO (PRIMING) RULES
────────────────────────

For each chapter, generate an INTRO that:
- Is 1–2 spoken sentences
- Briefly explains what the listener is about to hear
- Directs attention to:
  - 1–3 key ideas OR
  - 1–3 important words or concepts
- Does NOT summarize or spoil the content
- Uses simple, spoken language

Example:
“In this next part, you’ll hear about how the village prepares for the autumn festival. Listen for the words ‘harvest’ and ‘tradition.’”

────────────────────────
OUTRO (REVIEW) RULES – **LONGER VERSION**
────────────────────────

For each chapter, generate an OUTRO that:
- Is 3–5 spoken sentences
- Summarizes the key points clearly and in the listener’s own words
- Reinforces learning by:
  - Restating key vocabulary in context (1–3 words per chapter), AND/OR
  - Asking 1–2 comprehension or reflective questions
- Encourages the listener to think about the content
- Does NOT introduce any new information
- Uses friendly, spoken, and encouraging language

Example:
“So, the farmer explained that harvest work is hard, but machines make it faster today. We also learned that ‘tradition’ plays an important role in community life. Can you remember the word used for ‘machine’? Why do you think traditions are important for villages like this one?”

────────────────────────
OUTPUT FORMAT (STRICT)
────────────────────────

Return the result as a numbered list of chapters.

For EACH chapter, output:

Chapter X  
Topic: <short inferred topic>

INTRO:  
<spoken intro text (1-2 sentences)>

────────────────────────
STYLE GUIDELINES
────────────────────────

- Friendly, natural, and spoken
- No meta-commentary (do not mention subtitles, timestamps, or)
- Assume the listener only hears audio
- Keep intros concise, but outros detailed
- Match difficulty to the target audience

────────────────────────
NOW PROCESS THE FOLLOWING FULL TRANSCRIPT:
────────────────────────
`;

// const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

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
    const parts = url.pathname.split("/");
    const audioKey = parts[3];

    if (!audioKey) {
      return new Response("Missing audioKey", { status: 400 });
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      let accumulatedTranscript = "";
      try {
        for await (const text of this.transcribe(audioKey)) {
          accumulatedTranscript += text + "\n";

          // 1. Stream the chunk to the client immediately
          await writer.write(encoder.encode(text + "\n"));

          // 2. Incrementally update KV so other agents (like InsertsStreamer)
          // can see partial progress
          await env.KV.put(`transcript:${audioKey}`, accumulatedTranscript);
        }
      } catch (err) {
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
    const cached = await env.KV.get(`transcript:${audioKey}`);
    if (cached) return cached;

    let fullTranscript = "";

    for await (const text of this.transcribe(audioKey)) {
      fullTranscript += text + "\n";
    }

    await env.KV.put(`transcript:${audioKey}`, fullTranscript);
    return fullTranscript;
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
  // check in cache
  const cached = await env.KV.get(`transcript:${episodeId}`);
  if (cached) return cached;

  // 1. Transcribe full audio
  const transcriber = await getAgentByName<Env, Transcriber>(
    env.Transcriber,
    sessionId
  );
  const transcript = await transcriber.transcribeAudio(episodeId);

  // 2. Persist transcript
  await env.KV.put(`transcript:${episodeId}`, transcript);

  // 3. Generate primer + summary text
  const inserts = await generatePrimerAndSummary(env, episodeId, transcript);

  // 4. Persist inserts (this is what frontend reads)
  await env.KV.put(`inserts:${episodeId}`, JSON.stringify(inserts));

  console.log("Background processing complete:", episodeId);
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

      if (
        request.method === "GET" &&
        parts.length === 5 &&
        lastPart === "inserts-stream"
      ) {
        const streamer = await getAgentByName<Env, InsertsStreamer>(
          env.InsertsStreamer,
          sessionId
        );
        return streamer.fetch(new Request(request.url, { method: "POST" }));
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
