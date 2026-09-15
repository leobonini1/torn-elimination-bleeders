async function createSignature(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}


async function isAdmin(request, env) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader || !env.ADMIN_PASSWORD) {
    return false;
  }

  const match = cookieHeader.match(
    /(?:^|;\s*)admin_session=([^;]+)/
  );

  if (!match) {
    return false;
  }

  const parts = match[1].split(".");

  if (parts.length !== 2) {
    return false;
  }

  const timestamp = Number(parts[0]);
  const signature = parts[1];

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = Date.now();

  // Session expires after 8 hours
  if (now - timestamp > 8 * 60 * 60 * 1000) {
    return false;
  }

  // Reject timestamps from the future
  if (timestamp > now + 60 * 1000) {
    return false;
  }

  const expectedSignature = await createSignature(
    env.ADMIN_PASSWORD,
    `admin:${timestamp}`
  );

  return timingSafeEqual(
    signature,
    expectedSignature
  );
}


function unauthorizedResponse() {
  return Response.json(
    {
      success: false,
      error: "Admin login required"
    },
    {
      status: 401
    }
  );
}


export default {
  async fetch(request, env) {

    const url = new URL(request.url);


    // =========================================================
    // ADMIN LOGIN
    // =========================================================

    if (
      url.pathname === "/api/login" &&
      request.method === "POST"
    ) {

      try {

        const body = await request.json();

        const password = body.password;

        if (
          typeof password !== "string" ||
          !env.ADMIN_PASSWORD ||
          password !== env.ADMIN_PASSWORD
        ) {
          return Response.json(
            {
              success: false,
              error: "Invalid password"
            },
            {
              status: 401
            }
          );
        }

        const timestamp = Date.now();

        const signature = await createSignature(
          env.ADMIN_PASSWORD,
          `admin:${timestamp}`
        );

        const cookieValue =
          `${timestamp}.${signature}`;

        return new Response(
          JSON.stringify({
            success: true
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie":
                `admin_session=${cookieValue}; ` +
                `Path=/; ` +
                `HttpOnly; ` +
                `Secure; ` +
                `SameSite=Lax; ` +
                `Max-Age=28800`
            }
          }
        );

      } catch (error) {

        return Response.json(
          {
            success: false,
            error: "Invalid request"
          },
          {
            status: 400
          }
        );

      }

    }


    // =========================================================
    // AUTH STATUS
    // =========================================================

    if (url.pathname === "/api/auth-status") {

      const admin = await isAdmin(
        request,
        env
      );

      return Response.json({
        success: true,
        admin
      });

    }


    // =========================================================
    // LOGOUT
    // =========================================================

    if (
      url.pathname === "/api/logout" &&
      request.method === "POST"
    ) {

      return new Response(
        JSON.stringify({
          success: true
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie":
              "admin_session=; " +
              "Path=/; " +
              "HttpOnly; " +
              "Secure; " +
              "SameSite=Lax; " +
              "Max-Age=0"
          }
        }
      );

    }


    // =========================================================
    // TEST D1 CONNECTION
    // =========================================================

    if (url.pathname === "/api/test-db") {

      try {

        const result = await env.DB
          .prepare(
            "SELECT COUNT(*) AS count FROM players"
          )
          .first();

        return Response.json({
          success: true,
          players: result.count
        });

      } catch (error) {

        return Response.json({
          success: false,
          error: error.message
        }, {
          status: 500
        });

      }

    }


    // =========================================================
    // CHECK SECRET
    // =========================================================

    if (url.pathname === "/api/check-secret") {

      const key = env.TORN_API_KEY;

      return Response.json({
        secretExists: !!key,
        keyLength: key ? key.length : 0,
        validFormat: key
          ? /^[A-Za-z0-9]{16}$/.test(key)
          : false,
        envKeys: Object.keys(env)
      });

    }


    // =========================================================
    // TEST TORN API
    // =========================================================

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
        }, {
          status: 500
        });

      }

    }


    // =========================================================
    // TEST BOUNTIES
    // =========================================================

    if (
      url.pathname.startsWith(
        "/api/test-bounties/"
      )
    ) {

      try {

        const playerId =
          url.pathname.split("/").pop();

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
        }, {
          status: 500
        });

      }

    }


    // =========================================================
    // GET ALL SAVED PLAYERS
    // PUBLIC
    // =========================================================

    if (url.pathname === "/api/players") {

      try {

        const result = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              bounty,
              last_active,
              hospital_until,
              status,
              updated_at
            FROM players
            ORDER BY name ASC
          `)
          .all();

        return Response.json({
          success: true,
          players: result.results
        });

      } catch (error) {

        return Response.json({
          success: false,
          error: error.message
        }, {
          status: 500
        });

      }

    }


    // =========================================================
    // REFRESH ALL TRACKED PLAYERS
    // PUBLIC
    // =========================================================
    if (url.pathname === "/api/refresh-expired") {

      try {

        const now = Math.floor(Date.now() / 1000);

        const result = await env.DB
          .prepare(`
            SELECT
              id,
              hospital_until
            FROM players
            WHERE hospital_until IS NOT NULL
              AND CAST(hospital_until AS INTEGER) <= ?
          `)
          .bind(now)
          .all();

        const playerIds =
          result.results || [];

        const refreshResults =
          await Promise.all(

            playerIds.map(
              async (row) => {

                const playerId = row.id;

                try {

                  const response = await fetch(
                    "https://api.torn.com/v2/user/" +
                    encodeURIComponent(playerId) +
                    "?selections=profile,bounties&key=" +
                    encodeURIComponent(
                      env.TORN_API_KEY
                    )
                  );

                  const data =
                    await response.json();

                  if (data.error) {

                    return {
                      id: playerId,
                      success: false,
                      error: data.error
                    };

                  }

                  const profile =
                    data.profile || {};

                  let totalBounty = 0;

                  if (
                    Array.isArray(
                      data.bounties
                    )
                  ) {

                    totalBounty =
                      data.bounties.reduce(
                        (total, bounty) => {

                          return (
                            total +
                            Number(
                              bounty.reward || 0
                            )
                          );

                        },
                        0
                      );

                  }

                  /*
                   * IMPORTANT:
                   *
                   * If the player is currently in hospital,
                   * use the new hospital timestamp.
                   *
                   * If the player is NOT currently in hospital,
                   * keep the old timestamp so this player
                   * continues to be checked.
                   */

                  const newHospitalUntil =
                    profile.status?.state === "Hospital"
                      ? (
                          profile.status?.until ??
                          row.hospital_until
                        )
                      : row.hospital_until;


                  const player = {

                    id:
                      profile.id ??
                      Number(playerId),

                    name:
                      profile.name ??
                      "Unknown",

                    bounty:
                      totalBounty,

                    last_active:
                      profile.last_action
                        ?.relative ?? null,

                    status:
                      profile.status
                        ?.state ?? null,

                    hospital_until:
                      newHospitalUntil

                  };


                  await env.DB
                    .prepare(`
                      UPDATE players
                      SET
                        name = ?,
                        bounty = ?,
                        last_active = ?,
                        hospital_until = ?,
                        status = ?,
                        updated_at =
                          CURRENT_TIMESTAMP
                      WHERE id = ?
                    `)
                    .bind(
                      player.name,
                      player.bounty,
                      player.last_active,
                      player.hospital_until,
                      player.status,
                      player.id
                    )
                    .run();


                  return {

                    id:
                      player.id,

                    name:
                      player.name,

                    bounty:
                      player.bounty,

                    hospital_until:
                      player.hospital_until,

                    status:
                      player.status,

                    success:
                      true

                  };

                } catch (error) {

                  return {

                    id:
                      playerId,

                    success:
                      false,

                    error:
                      error.message

                  };

                }

              }
            )

          );


        return Response.json({

          success:
            true,

          checked:
            playerIds.length,

          results:
            refreshResults

        });

      } catch (error) {

        return Response.json({

          success:
            false,

          error:
            error.message

        }, {
          status: 500
        });

      }

    }
    if (url.pathname === "/api/refresh-players") {

      try {

        const result = await env.DB
          .prepare(
            "SELECT id FROM players"
          )
          .all();

        const playerIds =
          result.results || [];

        const refreshResults =
          await Promise.all(

            playerIds.map(
              async (row) => {

                const playerId = row.id;

                try {

                  const response = await fetch(
                    "https://api.torn.com/v2/user/" +
                    encodeURIComponent(playerId) +
                    "?selections=profile,bounties&key=" +
                    encodeURIComponent(
                      env.TORN_API_KEY
                    )
                  );

                  const data =
                    await response.json();

                  if (data.error) {

                    return {
                      id: playerId,
                      success: false,
                      error: data.error
                    };

                  }

                  const profile =
                    data.profile || {};

                  let totalBounty = 0;

                  if (
                    Array.isArray(
                      data.bounties
                    )
                  ) {

                    totalBounty =
                      data.bounties.reduce(
                        (total, bounty) => {

                          return (
                            total +
                            Number(
                              bounty.reward || 0
                            )
                          );

                        },
                        0
                      );

                  }

                  const player = {

                    id:
                      profile.id ??
                      Number(playerId),

                    name:
                      profile.name ??
                      "Unknown",

                    bounty:
                      totalBounty,

                    last_active:
                      profile.last_action
                        ?.relative ?? null,

                    last_active_status:
                      profile.last_action
                        ?.status ?? null,

                    last_active_timestamp:
                      profile.last_action
                        ?.timestamp ?? null,

                    status:
                      profile.status
                        ?.state ?? null,

                    status_description:
                      profile.status
                        ?.description ?? null,

                    hospital_until:
                      profile.status
                        ?.until ?? null

                  };


                  await env.DB
                    .prepare(`
                      UPDATE players
                      SET
                        name = ?,
                        bounty = ?,
                        last_active = ?,
                        hospital_until = ?,
                        status = ?,
                        updated_at =
                          CURRENT_TIMESTAMP
                      WHERE id = ?
                    `)
                    .bind(
                      player.name,
                      player.bounty,
                      player.last_active,
                      player.hospital_until,
                      player.status,
                      player.id
                    )
                    .run();


                  return {

                    id: player.id,
                    name: player.name,
                    bounty: player.bounty,
                    success: true

                  };

                } catch (error) {

                  return {

                    id: playerId,
                    success: false,
                    error:
                      error.message

                  };

                }

              }
            )

          );


        const successful =
          refreshResults.filter(
            result => result.success
          ).length;

        const failed =
          refreshResults.filter(
            result => !result.success
          ).length;


        return Response.json({

          success: true,
          refreshed: successful,
          failed: failed,
          results: refreshResults

        });

      } catch (error) {

        return Response.json({

          success: false,
          error: error.message

        }, {
          status: 500
        });

      }

    }


    // =========================================================
    // ADD / REFRESH PLAYER
    // ADMIN ONLY
    // =========================================================

    if (
      url.pathname.startsWith(
        "/api/player/"
      )
    ) {

      if (
        request.method !== "POST"
      ) {

        return Response.json(
          {
            success: false,
            error:
              "Method not allowed"
          },
          {
            status: 405
          }
        );

      }


      if (
        !(await isAdmin(request, env))
      ) {

        return unauthorizedResponse();

      }


      try {

        const playerId =
          url.pathname.split("/").pop();


        if (
          !/^\d+$/.test(playerId)
        ) {

          return Response.json(
            {
              success: false,
              error:
                "Invalid player ID"
            },
            {
              status: 400
            }
          );

        }


        const response = await fetch(
          "https://api.torn.com/v2/user/" +
          encodeURIComponent(playerId) +
          "?selections=profile,bounties&key=" +
          encodeURIComponent(
            env.TORN_API_KEY
          )
        );


        const data =
          await response.json();


        if (data.error) {

          return Response.json(
            {
              success: false,
              error: data.error
            },
            {
              status: 400
            }
          );

        }


        const profile =
          data.profile || {};


        let totalBounty = 0;


        if (
          Array.isArray(
            data.bounties
          )
        ) {

          totalBounty =
            data.bounties.reduce(
              (total, bounty) => {

                return (
                  total +
                  Number(
                    bounty.reward || 0
                  )
                );

              },
              0
            );

        }


        const player = {

          id:
            profile.id ??
            Number(playerId),

          name:
            profile.name ??
            "Unknown",

          level:
            profile.level ??
            null,

          bounty:
            totalBounty,

          last_active:
            profile.last_action
              ?.relative ?? null,

          last_active_status:
            profile.last_action
              ?.status ?? null,

          last_active_timestamp:
            profile.last_action
              ?.timestamp ?? null,

          status:
            profile.status
              ?.state ?? null,

          status_description:
            profile.status
              ?.description ?? null,

          hospital_until:
            profile.status
              ?.until ?? null,

          elimination:
            profile.competition
              ?.name === "Elimination"
              ? {
                  score:
                    profile.competition
                      .score ?? 0,

                  team:
                    profile.competition
                      .team ?? null,

                  attacks:
                    profile.competition
                      .attacks ?? 0
                }
              : null

        };


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
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              CURRENT_TIMESTAMP
            )

            ON CONFLICT(id)
            DO UPDATE SET
              name =
                excluded.name,

              bounty =
                excluded.bounty,

              last_active =
                excluded.last_active,

              hospital_until =
                excluded.hospital_until,

              status =
                excluded.status,

              updated_at =
                CURRENT_TIMESTAMP
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

        }, {
          status: 500
        });

      }

    }


    // =========================================================
    // REMOVE PLAYER
    // ADMIN ONLY
    // =========================================================

    if (
      url.pathname.startsWith(
        "/api/remove-player/"
      )
    ) {

      if (
        request.method !== "POST"
      ) {

        return Response.json(
          {
            success: false,
            error:
              "Method not allowed"
          },
          {
            status: 405
          }
        );

      }


      if (
        !(await isAdmin(request, env))
      ) {

        return unauthorizedResponse();

      }


      try {

        const playerId =
          url.pathname.split("/").pop();


        if (
          !/^\d+$/.test(playerId)
        ) {

          return Response.json(
            {
              success: false,
              error:
                "Invalid player ID"
            },
            {
              status: 400
            }
          );

        }


        await env.DB
          .prepare(
            "DELETE FROM players WHERE id = ?"
          )
          .bind(
            Number(playerId)
          )
          .run();


        return Response.json({

          success: true,
          id: Number(playerId)

        });


      } catch (error) {

        return Response.json({

          success: false,
          error: error.message

        }, {
          status: 500
        });

      }

    }


    // =========================================================
    // SERVE DASHBOARD
    // =========================================================

    return env.ASSETS.fetch(request);

  }
};
