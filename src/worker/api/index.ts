import { getSessionId } from "@/utils";
import { routeAgentRequest } from "agents";
import { handleAudioQuery, handleAudioUpload } from "./episodes";
import { handleR2Query } from "./r2";

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
