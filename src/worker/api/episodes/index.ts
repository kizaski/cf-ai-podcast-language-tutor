import type { Episode, EpisodeData } from "@/types/audio-types";

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

// TODO -- Rewrite
// export async function handleInsertsStream(
//   request: Request,
//   env: Env,
//   episodeId: string
// ): Promise<Response> {
//   return new Response("Inserts stream temporarily off", { status: 405 });
//   const stream = new TransformStream();
//   const writer = stream.writable.getWriter();
//   const encoder = new TextEncoder();

//   (async () => {
//     try {
//       const transcript = await waitForTranscript(env, episodeId);

//       if (transcript.status !== "complete") {
//         throw new Error("Transcript not complete");
//       }

//       const chunks = chunkTranscript(
//         transcript.segments,
//         60, // seconds per chunk
//         5 // overlap
//       );

//       const allInserts: Insert[] = [];

//       for (const chunk of chunks) {
//         const inserts = await generateInsertsForChunk(env, episodeId, chunk);

//         for (const insert of inserts) {
//           allInserts.push(insert);
//           await sendEvent(insert, writer, encoder);
//         }
//       }

//       await env.KV.put(`inserts:${episodeId}`, JSON.stringify(allInserts));

//       await sendEvent({ type: "complete" }, writer, encoder);
//     } catch (err: any) {
//       console.error("Insert stream failed", err);
//       await sendEvent(
//         {
//           type: "error",
//           message: err.message || "Insert generation failed"
//         },
//         writer,
//         encoder
//       );
//     } finally {
//       await writer.close();
//     }
//   })().catch((err) => {
//     console.error(err);
//   });

//   return new Response(stream.readable, {
//     headers: {
//       "Content-Type": "text/event-stream",
//       "Cache-Control": "no-cache",
//       Connection: "keep-alive"
//     }
//   });
// }
