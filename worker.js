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
  try {
    const response = await fetch(
      "https://api.torn.com/user/?selections=basic",
      {
        headers: {
          "Authorization": `ApiKey ${env.TORN_API_KEY}`
        }
      }
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
