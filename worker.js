export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Test D1
    if (url.pathname === "/api/test-db") {
      try {
        const result = await env.DB
          .prepare("SELECT COUNT(*) AS count FROM players")
          .first();

        return Response.json({
          success: true,
          players: result.count
        });
      } catch (error) {
        return Response.json({
          success: false,
          error: error.message
        }, { status: 500 });
      }
    }

  if (url.pathname === "/api/test-torn") {
  return Response.json({
    secretExists: !!env.TORN_API_KEY,
    keyLength: env.TORN_API_KEY ? env.TORN_API_KEY.length : 0,
    keyFormat: env.TORN_API_KEY
      ? /^[A-Za-z0-9]{16}$/.test(env.TORN_API_KEY)
      : false
  });
}
