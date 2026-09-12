import {
  Client,
  ChatInputCommandInteraction,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
const REVIEW_BUTTON_ID = "buyer-review";
const REVIEW_MODAL_ID = "buyer-review-modal";

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
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("讓機器人代替你發佈訊息或公告")
    .addStringOption((option) =>
      option.setName("message").setDescription("要讓機器人說的內容").setMaxLength(4000).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("title").setDescription("選填：公告標題").setMaxLength(256).setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("側邊顏色，例如 #5865F2")
        .setMaxLength(7)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("footer").setDescription("公告頁尾文字").setMaxLength(2048).setRequired(false),
    ),
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

function reviewModal() {
  const modal = new ModalBuilder()
    .setCustomId(REVIEW_MODAL_ID)
    .setTitle("買家評價");
  const rating = new TextInputBuilder()
    .setCustomId("rating")
    .setLabel("評分（1 到 5 顆星）")
    .setPlaceholder("例如：5")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(1)
    .setRequired(true);
  const product = new TextInputBuilder()
    .setCustomId("product")
    .setLabel("購買商品")
    .setPlaceholder("例如：USDT 代購、商品名稱")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);
  const feedback = new TextInputBuilder()
    .setCustomId("feedback")
    .setLabel("評價內容")
    .setPlaceholder("請分享您的購買體驗")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(rating),
    new ActionRowBuilder<TextInputBuilder>().addComponents(product),
    new ActionRowBuilder<TextInputBuilder>().addComponents(feedback),
  );
  return modal;
}

async function registerCommands(token: string, applicationId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(applicationId), { body: [] });
  await rest.put(Routes.applicationCommands(applicationId), { body: commands });
  logger.info("Previous Discord slash commands cleared and current commands registered");
}

async function publishReviewButton(client: Client) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) {
    logger.warn("Buyer review button not published: DISCORD_CHANNEL_ID is not configured");
    return;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || !("send" in channel)) {
    logger.error({ channelId }, "Buyer review button could not be published: channel is not text-based");
    return;
  }

  const button = new ButtonBuilder()
    .setCustomId(REVIEW_BUTTON_ID)
    .setLabel("留下買家評價")
    .setEmoji("⭐")
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await channel.send({
    content: [
      "## 買家評價",
      "感謝您的購買！請點擊下方按鈕，填寫星級與使用心得。",
    ].join("\n"),
    components: [row],
  });
  logger.info({ channelId }, "Buyer review button published");
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
      try {
        await publishReviewButton(readyClient);
      } catch (err) {
        logger.error({ err }, "Buyer review button publication failed");
      }
      logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
    } catch (err) {
      logger.error({ err }, "Discord slash command registration failed");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton() && interaction.customId === REVIEW_BUTTON_ID) {
      await interaction.showModal(reviewModal());
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === REVIEW_MODAL_ID) {
      const rating = Number.parseInt(interaction.fields.getTextInputValue("rating"), 10);
      const feedback = interaction.fields.getTextInputValue("feedback").trim();
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !feedback) {
        await interaction.reply({
          content: "請輸入 1 到 5 的整數評分，以及不能空白的評價內容。",
          ephemeral: true,
        });
        return;
      }

      const stars = "⭐".repeat(rating) + "☆".repeat(5 - rating);
      const product = interaction.fields.getTextInputValue("product").trim();
      await interaction.reply({
        content: "感謝您的評價！",
        ephemeral: true,
      });
      await interaction.channel?.send({
        content: [
          "## 新買家評價",
          `買家：${interaction.user}`,
          `購買商品：${product}`,
          `評分：${stars}（${rating}/5）`,
          `評價：${feedback}`,
        ].join("\n"),
      });
      return;
    }

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
      return;
    }

    if (interaction.commandName === "say") {
      const message = interaction.options.getString("message", true);
      const title = interaction.options.getString("title")?.trim();
      const colorInput = interaction.options.getString("color")?.trim();
      const footer = interaction.options.getString("footer")?.trim();

      let color = 0x5865f2;
      if (colorInput) {
        if (!/^#[0-9a-fA-F]{6}$/.test(colorInput)) {
          await interaction.reply({
            content: "顏色格式不正確，請使用六位十六進位格式，例如 `#5865F2`。",
            ephemeral: true,
          });
          return;
        }
        color = Number.parseInt(colorInput.slice(1), 16);
      }

      if (!interaction.channel?.isTextBased() || !("send" in interaction.channel)) {
        await interaction.reply({ content: "此頻道無法發佈公告。", ephemeral: true });
        return;
      }

      const needsEmbed = Boolean(title || colorInput || footer);
      if (needsEmbed) {
        const embed = new EmbedBuilder()
          .setColor(color)
          .setDescription(message)
          .setTimestamp();
        if (title) embed.setTitle(title);
        if (footer) embed.setFooter({ text: footer });
        await interaction.channel.send({ embeds: [embed] });
      } else {
        await interaction.channel.send({ content: message });
      }
      await interaction.reply({ content: "公告已由機器人發佈。", ephemeral: true });
    }
  });

  client.on("error", (err) => logger.error({ err }, "Discord client error"));
  try {
    await client.login(token);
  } catch (err) {
    logger.error({ err }, "Discord bot login failed; server will continue without the bot");
  }
}