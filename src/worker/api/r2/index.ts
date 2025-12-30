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
