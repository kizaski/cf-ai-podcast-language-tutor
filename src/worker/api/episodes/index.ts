import type {
  TranscriptSegment,
  Insert,
  Episode,
  EpisodeData
} from "@/types/audio-types";
import {
  base64ToArrayBuffer,
  getAudioDuration,
  type TranscriptKV,
  getTranscriptKV,
  sendEvent
} from "@/utils";

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
    if (!item.content) continue;

    const { audio }: any = await env.AI.run("@cf/myshell-ai/melotts", {
      prompt: item.content,
      lang: "en"
    });

    const audioKey = `${episodeId}-${crypto.randomUUID()}.mp3`;

    await env.R2_AUDIO_BUCKET.put(audioKey, base64ToArrayBuffer(audio));

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
    const fileName = file.name;
    const lastDotIndex = fileName.lastIndexOf(".");
    const fileNameNoExt =
      lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);

    await env.R2_AUDIO_BUCKET.put(fileNameNoExt, arrayBuffer, {
      httpMetadata: {
        contentType: file.type
      }
    });

    // Create episode object
    const episode: Episode = {
      id: fileNameNoExt,
      title: fileNameNoExt,
      duration: 0, // can be calculated later
      audioUrl: "/api/r2/" + fileNameNoExt,
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

// TODO -- put inside agent
export async function handleInsertsStream(
  request: Request,
  env: Env,
  episodeId: string
): Promise<Response> {
  return new Response("Inserts stream temporarily off", { status: 405 });
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
