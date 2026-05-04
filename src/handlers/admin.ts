import { Context } from "telegraf";
import { getAllUsers, getTotalStats, banUser, unbanUser, getUserById } from "../db/queries";
import { config } from "../config";
import { formatBalance, formatNumber } from "../utils/levels";

function isAdmin(ctx: Context): boolean {
  return ctx.from?.id === config.ADMIN_ID;
}

export async function handleAdmin(ctx: Context) {
  if (!isAdmin(ctx)) return ctx.reply("❌ Нет доступа.");

  const stats = await getTotalStats();

  await ctx.reply(
    `🛡️ <b>ПАНЕЛЬ АДМИНИСТРАТОРА</b>\n` +
    `<b>FTP GAME</b>\n\n` +
    `📊 <b>Статистика:</b>\n` +
    `👤 Пользователей: ${formatNumber(stats.total_users)}\n` +
    `🎮 Всего игр: ${formatNumber(stats.total_games)}\n` +
    `💰 Оборот: ${formatBalance(stats.total_wagered)} 🪙\n\n` +
    `Выберите действие:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👥 Пользователи", callback_data: "admin_users" },
            { text: "📊 Статистика", callback_data: "admin_stats" },
          ],
          [
            { text: "📢 Рассылка", callback_data: "admin_broadcast" },
            { text: "💰 Начислить", callback_data: "admin_credit" },
          ],
          [{ text: "🔙 Меню", callback_data: "back_main" }],
        ],
      },
    }
  );
}

export async function handleAdminUsers(ctx: Context) {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const users = await getAllUsers();
  let text = `👥 <b>ПОЛЬЗОВАТЕЛИ (${users.length})</b>\n\n`;

  for (const u of users.slice(0, 20)) {
    const banned = u.banned ? "🚫" : "✅";
    text +=
      `${banned} <b>${u.first_name}</b>${u.username ? ` @${u.username}` : ""}\n` +
      `  ID: <code>${u.id}</code> | 💵 ${formatBalance(u.balance)} 🪙 | 🎮 ${u.total_games}\n\n`;
  }

  if (users.length > 20) {
    text += `... и ещё ${users.length - 20} пользователей`;
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Назад", callback_data: "admin_panel" }],
      ],
    },
  });
}

export async function handleBanUser(ctx: Context, targetId: number) {
  if (!isAdmin(ctx)) return ctx.reply("❌ Нет доступа.");

  const user = await getUserById(targetId);
  if (!user) return ctx.reply("❌ Пользователь не найден.");

  if (user.banned) {
    await unbanUser(targetId);
    await ctx.reply(`✅ Пользователь ${user.first_name} разблокирован.`);
  } else {
    await banUser(targetId);
    await ctx.reply(`🚫 Пользователь ${user.first_name} заблокирован.`);
    try {
      await ctx.telegram.sendMessage(
        targetId,
        `🚫 Ваш аккаунт заблокирован.\nПо вопросам: ${config.SUPPORT}`
      );
    } catch (_) {}
  }
}

export async function handleAdminCredit(ctx: Context, targetId: number, amount: number) {
  if (!isAdmin(ctx)) return;
  const { updateBalance } = await import("../db/queries");
  const user = await getUserById(targetId);
  if (!user) return ctx.reply("❌ Пользователь не найден.");

  await updateBalance(targetId, amount);
  await ctx.reply(`✅ Начислено ${formatBalance(amount)} 🪙 пользователю ${user.first_name}`);

  try {
    await ctx.telegram.sendMessage(
      targetId,
      `🎁 Администратор начислил вам <b>${formatBalance(amount)} 🪙</b>!`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}
}

export async function handleBroadcast(ctx: Context, message: string) {
  if (!isAdmin(ctx)) return;

  const users = await getAllUsers();
  let sent = 0;
  let failed = 0;

  await ctx.reply(`📢 Начинаю рассылку ${users.length} пользователям...`);

  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(user.id, message, { parse_mode: "HTML" });
      sent++;
      await new Promise((r) => setTimeout(r, 50));
    } catch (_) {
      failed++;
    }
  }

  await ctx.reply(
    `📢 Рассылка завершена!\n✅ Отправлено: ${sent}\n❌ Ошибок: ${failed}`
  );
}

export { isAdmin };
