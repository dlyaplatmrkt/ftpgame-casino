import { Context } from "telegraf";
import {
  getUserById,
  updateBalance,
  recordGame,
  addXP,
  createCoinflipRoom,
  getWaitingCoinflipRooms,
  joinCoinflipRoom,
  updateCoinflipRoom,
  cancelCoinflipRoom,
} from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { coinflipRoomsList } from "../utils/keyboards";
import { config } from "../config";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const COIN_FRAMES = ["🌀", "⚪", "🌀", "⚫", "🌀", "⚪", "🌀"];

export async function playCoinflipSolo(ctx: Context, choice: string, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) {
    return ctx.reply(`❌ Недостаточно средств!\n💵 Баланс: ${formatBalance(user.balance)} 🪙`);
  }
  if (bet < config.MIN_BET || bet > config.MAX_BET) {
    return ctx.reply(`❌ Ставка: от ${config.MIN_BET} до ${config.MAX_BET} 🪙`);
  }

  await updateBalance(userId, -bet);

  const choiceEmoji = choice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const msg = await ctx.reply(
    `🪙 <b>МОНЕТКА</b>\n\n${choiceEmoji} — ${formatBalance(bet)} 🪙\n\n🌀 Подбрасываю...`,
    { parse_mode: "HTML" }
  );

  for (const frame of COIN_FRAMES) {
    await sleep(280);
    await ctx.telegram.editMessageText(
      ctx.chat!.id, msg.message_id, undefined,
      `🪙 <b>МОНЕТКА</b>\n\n${frame}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const won = result === choice;
  const winAmount = won ? bet * 2 : 0;
  if (won) await updateBalance(userId, winAmount);

  const resultEmoji = result === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "coinflip", bet, won ? "win" : "loss", winAmount, { choice, result });

  const updatedUser = await getUserById(userId);

  await ctx.telegram.editMessageText(
    ctx.chat!.id, msg.message_id, undefined,
    `🪙 <b>МОНЕТКА</b>\n\n` +
    `Выпало: <b>${resultEmoji}</b>\n` +
    `Твой выбор: ${choiceEmoji}\n\n` +
    `${won ? "🎉 <b>ПОБЕДА!</b>" : "😔 <b>ПРОИГРЫШ</b>"}\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n` +
    (won ? `💰 Выигрыш: <b>+${formatBalance(winAmount)} 🪙</b>\n` : `💸 Потеряно: <b>-${formatBalance(bet)} 🪙</b>\n`) +
    `⭐ XP: +${xpGain}\n💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙` +
    (leveledUp ? `\n\n🆙 <b>Уровень ${newLevel}!</b> 🎊` : ""),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🔄 Ещё (${choiceEmoji})`, callback_data: `cf_bet_solo_${choice}_${bet}` },
            { text: "🔃 Сменить", callback_data: "game_coinflip" },
          ],
          [{ text: "🎮 Меню игр", callback_data: "back_games" }],
        ],
      },
    }
  ).catch(() => {});
}

export async function showCoinflipMultiMenu(ctx: Context) {
  const rooms = await getWaitingCoinflipRooms();
  const userId = ctx.from!.id;
  const otherRooms = rooms.filter((r) => r.creator_id !== userId);
  const myRooms = rooms.filter((r) => r.creator_id === userId);

  let text = `🪙 <b>МОНЕТКА — Мультиплеер</b>\n\n`;
  if (otherRooms.length > 0) {
    text += `🚪 Открытые комнаты:\n`;
    for (const r of otherRooms) {
      const choiceEmoji = r.choice === "heads" ? "🦅" : "🦁";
      text += `  #${r.id} — 🪙 ${formatBalance(r.bet)} ${choiceEmoji}\n`;
    }
    text += `\n`;
  } else {
    text += `Нет открытых комнат.\n\n`;
  }
  if (myRooms.length > 0) {
    text += `⏳ У тебя открыта комната #${myRooms[0].id}`;
  }

  const keyboard: any[][] = [];
  if (otherRooms.length > 0) {
    keyboard.push([{ text: "🚪 Присоединиться", callback_data: "cf_join_list" }]);
  }
  if (myRooms.length === 0) {
    keyboard.push([{ text: "➕ Создать комнату", callback_data: "cf_create_menu" }]);
  } else {
    keyboard.push([{ text: "❌ Отменить комнату", callback_data: `cf_cancel_${myRooms[0].id}` }]);
  }
  keyboard.push([{ text: "🔙 Назад", callback_data: "game_coinflip" }]);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  }).catch(() =>
    ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } })
  );
}

export async function showCoinflipJoinList(ctx: Context) {
  const rooms = await getWaitingCoinflipRooms();
  const userId = ctx.from!.id;
  const otherRooms = rooms.filter((r) => r.creator_id !== userId);

  if (otherRooms.length === 0) {
    return ctx.editMessageText("❌ Нет доступных комнат.", {
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Назад", callback_data: "coinflip_multi" }]],
      },
    }).catch(() => ctx.reply("❌ Нет доступных комнат."));
  }

  return ctx.editMessageText(`🪙 Выбери комнату:`, {
    parse_mode: "HTML",
    reply_markup: coinflipRoomsList(otherRooms).reply_markup,
  }).catch(() =>
    ctx.reply(`🪙 Выбери комнату:`, { reply_markup: coinflipRoomsList(otherRooms).reply_markup })
  );
}

export async function createCoinflipMultiRoom(ctx: Context, choice: string, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) {
    return ctx.reply(`❌ Недостаточно средств!\n💵 Баланс: ${formatBalance(user.balance)} 🪙`);
  }
  if (bet < config.MIN_BET || bet > config.MAX_BET) {
    return ctx.reply(`❌ Ставка: от ${config.MIN_BET} до ${config.MAX_BET} 🪙`);
  }

  await updateBalance(userId, -bet);
  const room = await createCoinflipRoom(userId, bet, choice);
  const choiceEmoji = choice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const botUsername = process.env.BOT_USERNAME || "ftpgame_bot";

  await ctx.reply(
    `🪙 <b>Комната #${room.id} создана!</b>\n\n` +
    `Твой выбор: ${choiceEmoji}\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n\n` +
    `⏳ Ожидаю соперника...`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Пригласить друга", url: `https://t.me/share/url?url=https://t.me/${botUsername}?start=cf_${room.id}&text=Сыграй со мной в Монетку!` }],
          [{ text: "❌ Отменить", callback_data: `cf_cancel_${room.id}` }],
        ],
      },
    }
  );
}

export async function cancelCoinflipMultiRoom(ctx: Context, roomId: number) {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const refund = await cancelCoinflipRoom(roomId, userId);

  if (refund === null) {
    return ctx.editMessageText("❌ Комната не найдена или уже началась.").catch(() =>
      ctx.reply("❌ Не удалось отменить.")
    );
  }

  await updateBalance(userId, refund);
  await ctx.editMessageText(
    `✅ Комната #${roomId} отменена.\n💵 Возвращено: ${formatBalance(refund)} 🪙`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🪙 Назад", callback_data: "coinflip_multi" }]] },
    }
  ).catch(() => ctx.reply(`✅ Комната отменена. Возвращено ${formatBalance(refund)} 🪙`));
}

export async function joinCoinflipMultiRoom(ctx: Context, roomId: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  const rooms = await getWaitingCoinflipRooms();
  const room = rooms.find((r) => r.id === roomId);

  if (!room) return ctx.reply("❌ Комната не найдена или уже закрыта.");
  if (room.creator_id === userId) return ctx.reply("❌ Нельзя играть с собой!");
  if (!user || user.balance < room.bet) {
    return ctx.reply(`❌ Недостаточно средств!\n💸 Ставка: ${formatBalance(room.bet)} 🪙`);
  }

  await updateBalance(userId, -room.bet);
  await joinCoinflipRoom(roomId, userId);

  const myChoice = room.choice === "heads" ? "tails" : "heads";
  const myEmoji = myChoice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const theirEmoji = room.choice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const creator = await getUserById(room.creator_id);

  const msg = await ctx.reply(
    `🪙 <b>Ты против ${creator?.first_name || "соперника"}!</b>\n\n` +
    `Они: ${theirEmoji} | Ты: ${myEmoji}\n` +
    `💸 Банк: ${formatBalance(room.bet * 2)} 🪙\n\n` +
    `🌀 Подбрасываю...`,
    { parse_mode: "HTML" }
  );

  for (const frame of COIN_FRAMES) {
    await sleep(280);
    await ctx.telegram.editMessageText(
      ctx.chat!.id, msg.message_id, undefined,
      `🪙 <b>Монета летит...</b>\n\n${frame}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const bank = room.bet * 2;
  const resultEmoji = result === "heads" ? "🦅 Орёл" : "🦁 Решка";

  const creatorWon = result === room.choice;
  const winnerId = creatorWon ? room.creator_id : userId;
  const youWon = winnerId === userId;

  await updateBalance(winnerId, bank);
  await updateCoinflipRoom(roomId, { status: "finished", result, winner_id: winnerId } as any);

  const xp1 = calcXPGain(room.bet, youWon);
  const xp2 = calcXPGain(room.bet, !youWon);
  await addXP(userId, xp1);
  await addXP(room.creator_id, xp2);
  await recordGame(userId, "coinflip_multi", room.bet, youWon ? "win" : "loss", youWon ? bank : 0, { choice: myChoice, result });
  await recordGame(room.creator_id, "coinflip_multi", room.bet, !youWon ? "win" : "loss", !youWon ? bank : 0, { choice: room.choice, result });

  const updatedUser = await getUserById(userId);

  await ctx.telegram.editMessageText(
    ctx.chat!.id, msg.message_id, undefined,
    `🪙 <b>РЕЗУЛЬТАТ</b>\n\n` +
    `Выпало: <b>${resultEmoji}</b>\n\n` +
    `${youWon ? "🏆 <b>Ты победил!</b>" : `🥈 Победил ${creator?.first_name || "соперник"}`}\n\n` +
    `💰 Банк: ${formatBalance(bank)} 🪙\n` +
    `⭐ XP: +${xp1}\n💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Ещё", callback_data: "game_coinflip" },
            { text: "🎮 Меню", callback_data: "back_games" },
          ],
        ],
      },
    }
  ).catch(() => {});

  try {
    await ctx.telegram.sendMessage(
      room.creator_id,
      `🪙 <b>Монетка — Результат</b>\n\nВыпало: <b>${resultEmoji}</b>\n\n` +
      `${!youWon ? "🏆 <b>Ты победил!</b>" : `🥈 Победил ${ctx.from!.first_name}`}\n\n` +
      `💰 Банк: ${formatBalance(bank)} 🪙\n⭐ XP: +${xp2}`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}
}
