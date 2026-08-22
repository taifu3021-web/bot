import {
  Client,
  ChatInputCommandInteraction,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { logger } from "./lib/logger";

type ConvenienceInvoice = {
  id: string;
  customer: string;
  amount: number;
  code: string;
  expiresAt: Date;
  note?: string;
  status: "pending" | "paid" | "expired";
};

const invoices = new Map<string, ConvenienceInvoice>();

const commands = [
  new SlashCommandBuilder()
    .setName("paycode")
    .setDescription("建立超商代碼繳費單")
    .addStringOption((option) =>
      option.setName("customer").setDescription("使用者名稱").setRequired(true),
    )
    .addNumberOption((option) =>
      option.setName("amount").setDescription("繳費金額").setMinValue(1).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("code").setDescription("超商繳費代碼").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("expires").setDescription("幾小時後到期").setMinValue(1).setMaxValue(720).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("note").setDescription("繳費備註").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("paid")
    .setDescription("標記繳費單已付款")
    .addStringOption((option) =>
      option.setName("invoice").setDescription("繳費單編號").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("pending")
    .setDescription("查看待繳費單"),
].map((command) => command.toJSON());

function isAdmin(interaction: ChatInputCommandInteraction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function formatInvoice(invoice: ConvenienceInvoice) {
  return [
    `**超商代碼繳費單｜${invoice.id}**`,
    `使用者：${invoice.customer}`,
    `金額：**NT$ ${invoice.amount.toLocaleString("zh-TW")}**`,
    `繳費代碼：\`${invoice.code}\``,
    `繳費期限：${invoice.expiresAt.toLocaleString("zh-TW")}`,
    invoice.note ? `備註：${invoice.note}` : "",
    `狀態：${invoice.status === "paid" ? "已付款" : "待付款"}`,
  ].filter(Boolean).join("\n");
}

async function registerCommands(token: string, applicationId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(applicationId), { body: [] });
  await rest.put(Routes.applicationCommands(applicationId), { body: commands });
  logger.info("Previous Discord slash commands cleared and current commands registered");
}

export async function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.warn("Discord bot disabled: DISCORD_BOT_TOKEN is not configured");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("clientReady", async (readyClient) => {
    try {
      await registerCommands(token, readyClient.user.id);
      logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
    } catch (err) {
      logger.error({ err }, "Discord slash command registration failed");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: "只有具備管理伺服器權限的管理員可以使用此指令。", ephemeral: true });
      return;
    }

    if (interaction.commandName === "paycode") {
      const customer = interaction.options.getString("customer", true);
      const amount = interaction.options.getNumber("amount", true);
      const code = interaction.options.getString("code", true);
      const expires = interaction.options.getInteger("expires", true);
      const note = interaction.options.getString("note") ?? undefined;
      const id = `PC-${Date.now().toString(36).toUpperCase()}`;
      const invoice: ConvenienceInvoice = {
        id,
        customer,
        amount,
        code,
        note,
        expiresAt: new Date(Date.now() + expires * 60 * 60 * 1000),
        status: "pending",
      };
      invoices.set(id, invoice);
      await interaction.reply(formatInvoice(invoice));
      return;
    }

    if (interaction.commandName === "paid") {
      const id = interaction.options.getString("invoice", true).toUpperCase();
      const invoice = invoices.get(id);
      if (!invoice) {
        await interaction.reply({ content: `找不到繳費單 \`${id}\`。`, ephemeral: true });
        return;
      }
      invoice.status = "paid";
      await interaction.reply(`已標記為已付款：\n${formatInvoice(invoice)}`);
      return;
    }

    if (interaction.commandName === "pending") {
      const pending = [...invoices.values()].filter((invoice) => {
        if (invoice.status === "pending" && invoice.expiresAt.getTime() < Date.now()) invoice.status = "expired";
        return invoice.status === "pending";
      });
      await interaction.reply(
        pending.length
          ? pending.map(formatInvoice).join("\n\n")
          : "目前沒有待付款的超商代碼繳費單。",
      );
    }
  });

  client.on("error", (err) => logger.error({ err }, "Discord client error"));
  try {
    await client.login(token);
  } catch (err) {
    logger.error({ err }, "Discord bot login failed; server will continue without the bot");
  }
}