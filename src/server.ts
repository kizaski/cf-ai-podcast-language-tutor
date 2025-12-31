import { routeAgentRequest } from "agents";
import { getSessionId } from "./utils";
import {
  handleAudioUpload,
  handleAudioQuery
  // handleInsertsStream
} from "./worker/api/episodes";
import { handleR2Query } from "./worker/api/r2";
import { Chat } from "./worker/agents/chat";
import { Transcriber } from "./worker/agents/transcriber";

// Needed re-exports (or script_name in wrangler)
export { Chat };
export { Transcriber };

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    let sessionId = getSessionId(request);
    let isNewSession = false;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      isNewSession = true;
    }

    console.log(url.pathname);

    if (url.pathname === "/api/auth/session") {
      return Response.json(
        { sessionId },
        {
          headers: isNewSession
            ? { "Set-Cookie": `session_id=${sessionId}; HttpOnly; Path=/` }
            : {}
        }
      );
    }

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

      // GET /api/episodes/:id/inserts-stream
      if (
        request.method === "GET" &&
        parts.length === 5 &&
        parts[4] === "inserts-stream"
      ) {
        const episodeId = parts[3];
        return new Response("Unimplemented", { status: 405 });
        // return handleInsertsStream(request, env, episodeId);
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

    let response =
      (await routeAgentRequest(request, env)) ??
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
