export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Test D1 connection
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

    // Diagnose Cloudflare secret
    if (url.pathname === "/api/check-secret") {
      const key = env.TORN_API_KEY;

      return Response.json({
        secretExists: !!key,
        keyLength: key ? key.length : 0,
        validFormat: key ? /^[A-Za-z0-9]{16}$/.test(key) : false,
        envKeys: Object.keys(env)
      });
    }

    // Test TORN API
    if (url.pathname === "/api/test-torn") {
      try {
        const response = await fetch(
          "https://api.torn.com/user/?selections=basic&key=" +
          encodeURIComponent(env.TORN_API_KEY)
        );

        const data = await response.json();

        return Response.json(data);
      } catch (error) {
        return Response.json({
          success: false,
          error: error.message
        }, { status: 500 });
      }
    }

    // Serve dashboard
    return env.ASSETS.fetch(request);
  }
};
