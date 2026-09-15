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

    // Check that the TORN API secret is available
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

    // Test bounties for a specific player
    if (url.pathname.startsWith("/api/test-bounties/")) {
      try {
        const playerId = url.pathname.split("/").pop();

        const response = await fetch(
          "https://api.torn.com/v2/user/" +
          encodeURIComponent(playerId) +
          "?selections=bounties&key=" +
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

    // Get information for a specific player
    if (url.pathname.startsWith("/api/player/")) {
      try {
        const playerId = url.pathname.split("/").pop();

        if (!/^\d+$/.test(playerId)) {
          return Response.json({
            success: false,
            error: "Invalid player ID"
          }, { status: 400 });
        }

        // Request profile and bounties together using API v2
        const response = await fetch(
          "https://api.torn.com/v2/user/" +
          encodeURIComponent(playerId) +
          "?selections=profile,bounties&key=" +
          encodeURIComponent(env.TORN_API_KEY)
        );

        const data = await response.json();

        if (data.error) {
          return Response.json({
            success: false,
            error: data.error
          }, { status: 400 });
        }

        // Calculate total bounty
        let totalBounty = 0;

        if (Array.isArray(data.bounties)) {
          totalBounty = data.bounties.reduce((total, bounty) => {
            return total + Number(bounty.amount || 0);
          }, 0);
        }

        const player = {
          id: data.player_id,
          name: data.name,
          level: data.level,

          bounty: totalBounty,

          last_active: data.last_action?.relative || null,
          last_active_status: data.last_action?.status || null,
          last_active_timestamp: data.last_action?.timestamp || null,

          status: data.status?.state || null,
          status_description: data.status?.description || null,
          hospital_until: data.status?.until || null,

          elimination: data.competition?.name === "Elimination"
            ? {
                score: data.competition.score || 0,
                team: data.competition.team || null,
                attacks: data.competition.attacks || 0
              }
            : null
        };

        // Save player to D1
        await env.DB
          .prepare(`
            INSERT INTO players (
              id,
              name,
              bounty,
              last_active,
              hospital_until,
              status,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              bounty = excluded.bounty,
              last_active = excluded.last_active,
              hospital_until = excluded.hospital_until,
              status = excluded.status,
              updated_at = CURRENT_TIMESTAMP
          `)
          .bind(
            player.id,
            player.name,
            player.bounty,
            player.last_active,
            player.hospital_until,
            player.status
          )
          .run();

        return Response.json({
          success: true,
          player: player
        });

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

