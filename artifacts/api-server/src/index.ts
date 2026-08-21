import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function clearDiscordCommands() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.info("Discord command cleanup skipped: DISCORD_BOT_TOKEN is not configured");
    return;
  }

  try {
    const identityResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!identityResponse.ok) {
      logger.warn({ status: identityResponse.status }, "Discord command cleanup skipped: token verification failed");
      return;
    }

    const identity = (await identityResponse.json()) as { id?: string };
    if (!identity.id) {
      logger.warn("Discord command cleanup skipped: Discord returned no application id");
      return;
    }

    const headers = {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    };
    const globalResponse = await fetch(
      `https://discord.com/api/v10/applications/${identity.id}/commands`,
      { method: "PUT", headers, body: "[]" },
    );
    logger.info(
      { status: globalResponse.status, scope: "global" },
      globalResponse.ok ? "Discord slash commands cleared" : "Discord global slash command cleanup failed",
    );

    const guildId = process.env.DISCORD_GUILD_ID;
    if (guildId) {
      const guildResponse = await fetch(
        `https://discord.com/api/v10/applications/${identity.id}/guilds/${guildId}/commands`,
        { method: "PUT", headers, body: "[]" },
      );
      logger.info(
        { status: guildResponse.status, scope: "guild" },
        guildResponse.ok ? "Discord guild slash commands cleared" : "Discord guild slash command cleanup failed",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Discord command cleanup failed; continuing server startup");
  }
}

async function start() {
  await clearDiscordCommands();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start();
