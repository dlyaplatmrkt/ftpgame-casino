import { Context } from "telegraf";
import {
  getAllUsers, getTotalStats, banUser, unbanUser,
  getUserById, updateBalance, createTransaction,
} from "../db/queries";
import { config } from "../config";
import { formatBalance, formatNumber } from "../utils/levels";

export function isAdmin(ctx: Context): boolean {
  return ctx.from?.id === config.ADMIN_ID;
}

export async function handleAdmin(ctx: Context) {
  if (!isAdmin(ctx)) return ctx.reply("❌ Нет доступа");

  const stats = await getTotalStats();

  const text =
    `🛡️ <b>Панель администратора</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `👤 Пользователей: <b>${formatNumber(stats.total_users)}</b>\n` +
    `🎮 Игр сыграно: <b>${formatNumber(stats.total_games)}</b>\n` +
    `💸 Оборот: <b>${formatBalance(stats.total_wagered)} 🪙</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `/ban ID — заблокировать/разбанить\n` +
    `/credit ID СУММА — начислить\n` +
    `/broadcast ТЕКСТ — рассылка`;

  const sendOpts = {
    parse_mode: "HTML" as const,
    reply_markup: {
      inline_keyboard: [
        [{ text: "👥 Пользователи", callback_data: "admin_users" }],
      ],
    },
  };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(text, sendOpts).catch(() => ctx.reply(text, sendOpts));
  } else {
    await ctx.reply(text, sendOpts);
  }
}

export async function handleAdminUsers(ctx: Context) {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const users = await getAllUsers();
  const top = users.slice(0, 15);

  let text = `👥 <b>Пользователи</b> (${formatNumber(users.length)} всего)\n━━━━━━━━━━━━━━━\n`;
  for (const u of top) {
    const banned = u.banned ? " 🚫" : "";
    text +=
      `◆ <b>${u.first_name}</b>${u.username ? ` @${u.username}` : ""}${banned}\n` +
      `  <code>${u.id}</code>  💼 <b>${formatBalance(u.balance)} 🪙</b>  🎮 ${formatNumber(u.total_games)}\n`;
  }
  if (users.length > 15) text += `\n<i>... и ещё ${users.length - 15}</i>`;

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "admin_panel" }]] },
  }).catch(() => ctx.reply(text, { parse_mode: "HTML" }));
}

export async function handleBanUser(ctx: Context, targetId: number) {
  const target = await getUserById(targetId);
  if (!target) return ctx.reply(`❌ Пользователь ${targetId} не найден`);

  if (target.banned) {
    await unbanUser(targetId);
    await ctx.reply(`✅ <b>${target.first_name}</b> разбанен`, { parse_mode: "HTML" });
  } else {
    await banUser(targetId);
    await ctx.reply(`🚫 <b>${target.first_name}</b> заблокирован`, { parse_mode: "HTML" });
    try {
      await ctx.telegram.sendMessage(targetId, `🚫 Аккаунт заблокирован. Поддержка: ${config.SUPPORT}`);
    } catch (_) {}
  }
}

export async function handleAdminCredit(ctx: Context, targetId: number, amount: number) {
  const target = await getUserById(targetId);
  if (!target) return ctx.reply(`❌ Пользователь ${targetId} не найден`);

  await updateBalance(targetId, amount);
  await createTransaction(targetId, "admin_credit", amount, null, null, "completed");

  await ctx.reply(
    `✅ Начислено <b>${formatBalance(amount)} 🪙</b> → <b>${target.first_name}</b>`,
    { parse_mode: "HTML" }
  );
  try {
    await ctx.telegram.sendMessage(
      targetId,
      `🎁 <b>Администратор начислил ${formatBalance(amount)} 🪙</b>`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}
}

export async function handleBroadcast(ctx: Context, message: string) {
  const users = await getAllUsers();
  let sent = 0, failed = 0;

  await ctx.reply(`📡 Рассылка ${formatNumber(users.length)} пользователям...`);

  for (const u of users) {
    try {
      await ctx.telegram.sendMessage(u.id, `📢 <b>FTP GAME</b>\n\n${message}`, { parse_mode: "HTML" });
      sent++;
      if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
    } catch (_) { failed++; }
  }

  await ctx.reply(
    `✅ <b>Рассылка завершена</b>\n📤 Отправлено: <b>${formatNumber(sent)}</b>\n❌ Ошибок: <b>${formatNumber(failed)}</b>`,
    { parse_mode: "HTML" }
  );
}
