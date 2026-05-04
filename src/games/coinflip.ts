import { Context } from "telegraf";
import {
  getUserById, updateBalance, recordGame, addXP,
  createCoinflipRoom, getWaitingCoinflipRooms,
  joinCoinflipRoom, updateCoinflipRoom, cancelCoinflipRoom,
} from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { coinflipRoomsList } from "../utils/keyboards";
import { config } from "../config";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Animated coin spin — uses basketball throw for reveal effect
const COIN_SPIN = [
  "🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔", "🌕",
];

export async function playCoinflipSolo(ctx: Context, choice: string, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) return ctx.reply(`❌ Недостаточно средств\n💼 Баланс: <b>${formatBalance(user.balance)} 🪙</b>`, { parse_mode: "HTML" });
  if (bet < config.MIN_BET || bet > config.MAX_BET) return ctx.reply(`❌ Ставка: ${config.MIN_BET}–${config.MAX_BET} 🪙`);

  await updateBalance(userId, -bet);

  const choiceLabel = choice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const msg = await ctx.reply(
    `🪙 <b>МОНЕТКА</b>\n━━━━━━━━━━━━━━━\nВыбор: <b>${choiceLabel}</b>  |  Ставка: <b>${formatBalance(bet)} 🪙</b>\n\n🌀 Подбрасываю...`,
    { parse_mode: "HTML" }
  );

  // Coin spin animation
  for (let i = 0; i < COIN_SPIN.length; i++) {
    await sleep(180);
    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
      `🪙 <b>МОНЕТКА</b>\n━━━━━━━━━━━━━━━\n\n${COIN_SPIN[i]}  <b>Монета в воздухе...</b>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const won = result === choice;
  const winAmount = won ? bet * 2 : 0;
  const resultLabel = result === "heads" ? "🦅 Орёл" : "🦁 Решка";

  if (won) await updateBalance(userId, winAmount);
  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "coinflip", bet, won ? "win" : "loss", winAmount, { choice, result });

  const updatedUser = await getUserById(userId);

  await sleep(300);
  await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
    `🪙 <b>МОНЕТКА</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Выпало: <b>${resultLabel}</b>\n` +
    `Твой выбор: ${choiceLabel}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `${won ? "🏆 <b>ПОБЕДА!</b>  ×2" : "💀 <b>ПРОИГРЫШ</b>"}\n` +
    `💸 Ставка: <b>${formatBalance(bet)} 🪙</b>\n` +
    (won
      ? `💰 Выигрыш: <b>+${formatBalance(winAmount)} 🪙</b>\n`
      : `📉 Потеряно: <b>${formatBalance(bet)} 🪙</b>\n`) +
    `⭐️ XP: <b>+${xpGain}</b>  |  💼 <b>${formatBalance(updatedUser?.balance || 0)} 🪙</b>` +
    (leveledUp ? `\n🆙 <b>УРОВЕНЬ ${newLevel}!</b> 🎊` : ""),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🔄 Снова (${choiceLabel})`, callback_data: `cf_bet_solo_${choice}_${bet}` },
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
  const otherRooms = rooms.filter(r => r.creator_id !== userId);
  const myRooms = rooms.filter(r => r.creator_id === userId);

  let text = `🪙 <b>МОНЕТКА — Мультиплеер</b>\n━━━━━━━━━━━━━━━\n`;
  if (otherRooms.length > 0) {
    text += `<b>Открытые комнаты:</b>\n`;
    for (const r of otherRooms) {
      const e = r.choice === "heads" ? "🦅" : "🦁";
      text += `◆ #${r.id}  ${e}  <b>${formatBalance(r.bet)} 🪙</b>\n`;
    }
  } else {
    text += `Нет открытых комнат.\n`;
  }
  if (myRooms.length > 0) text += `\n⏳ Твоя комната: <b>#${myRooms[0].id}</b>`;

  const keyboard: any[][] = [];
  if (otherRooms.length > 0) keyboard.push([{ text: "🚪 Присоединиться", callback_data: "cf_join_list" }]);
  if (myRooms.length === 0) keyboard.push([{ text: "➕ Создать комнату", callback_data: "cf_create_menu" }]);
  else keyboard.push([{ text: "❌ Отменить комнату", callback_data: `cf_cancel_${myRooms[0].id}` }]);
  keyboard.push([{ text: "🔙 Назад", callback_data: "game_coinflip" }]);

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } })
    .catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } }));
}

export async function showCoinflipJoinList(ctx: Context) {
  const rooms = await getWaitingCoinflipRooms();
  const userId = ctx.from!.id;
  const otherRooms = rooms.filter(r => r.creator_id !== userId);

  if (otherRooms.length === 0) {
    return ctx.editMessageText("❌ Нет доступных комнат.", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "coinflip_multi" }]] },
    }).catch(() => ctx.reply("❌ Нет доступных комнат."));
  }

  return ctx.editMessageText(`🪙 <b>Выбери комнату:</b>`, {
    parse_mode: "HTML",
    reply_markup: coinflipRoomsList(otherRooms).reply_markup,
  }).catch(() => ctx.reply(`🪙 Выбери комнату:`, { reply_markup: coinflipRoomsList(otherRooms).reply_markup }));
}

export async function createCoinflipMultiRoom(ctx: Context, choice: string, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) return ctx.reply(`❌ Недостаточно средств!`);
  if (bet < config.MIN_BET || bet > config.MAX_BET) return ctx.reply(`❌ Ставка: ${config.MIN_BET}–${config.MAX_BET} 🪙`);

  await updateBalance(userId, -bet);
  const room = await createCoinflipRoom(userId, bet, choice);
  const choiceLabel = choice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const botUsername = process.env.BOT_USERNAME || "ftpgame_bot";

  await ctx.reply(
    `🪙 <b>Комната #${room.id} создана!</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Твоя сторона: <b>${choiceLabel}</b>\n` +
    `💸 Ставка: <b>${formatBalance(bet)} 🪙</b>\n\n` +
    `⏳ Ожидаю соперника...`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Пригласить друга", url: `https://t.me/share/url?url=https://t.me/${botUsername}?start=cf_${room.id}` }],
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
  if (refund === null) return ctx.editMessageText("❌ Комната не найдена.").catch(() => ctx.reply("❌ Ошибка."));
  await updateBalance(userId, refund);
  await ctx.editMessageText(
    `✅ Комната #${roomId} отменена\n💵 Возвращено: <b>${formatBalance(refund)} 🪙</b>`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🪙 Назад", callback_data: "coinflip_multi" }]] },
    }
  ).catch(() => ctx.reply(`✅ Возвращено ${formatBalance(refund)} 🪙`));
}

export async function joinCoinflipMultiRoom(ctx: Context, roomId: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);
  const rooms = await getWaitingCoinflipRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) return ctx.reply("❌ Комната не найдена или закрыта.");
  if (room.creator_id === userId) return ctx.reply("❌ Нельзя играть с собой!");
  if (!user || user.balance < room.bet) return ctx.reply(`❌ Недостаточно средств!\n💸 Нужно: <b>${formatBalance(room.bet)} 🪙</b>`, { parse_mode: "HTML" });

  await updateBalance(userId, -room.bet);
  await joinCoinflipRoom(roomId, userId);

  const myChoice = room.choice === "heads" ? "tails" : "heads";
  const myLabel = myChoice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const theirLabel = room.choice === "heads" ? "🦅 Орёл" : "🦁 Решка";
  const creator = await getUserById(room.creator_id);

  const msg = await ctx.reply(
    `🪙 <b>МОНЕТКА vs ${creator?.first_name || "Соперник"}</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Они: <b>${theirLabel}</b>  |  Ты: <b>${myLabel}</b>\n` +
    `💸 Банк: <b>${formatBalance(room.bet * 2)} 🪙</b>\n\n` +
    `🌀 Подбрасываю...`,
    { parse_mode: "HTML" }
  );

  for (let i = 0; i < COIN_SPIN.length; i++) {
    await sleep(180);
    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
      `🪙 <b>МОНЕТКА</b>\n━━━━━━━━━━━━━━━\n\n${COIN_SPIN[i]}  <b>Монета летит...</b>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const bank = room.bet * 2;
  const resultLabel = result === "heads" ? "🦅 Орёл" : "🦁 Решка";
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

  await sleep(300);
  await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
    `🪙 <b>МОНЕТКА — РЕЗУЛЬТАТ</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Выпало: <b>${resultLabel}</b>\n\n` +
    `${youWon ? "🏆 <b>ТЫ ПОБЕДИЛ!</b>" : `🥈 Победил <b>${creator?.first_name || "соперник"}</b>`}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `💰 Банк: <b>${formatBalance(bank)} 🪙</b>\n` +
    `⭐️ XP: <b>+${xp1}</b>  |  💼 <b>${formatBalance(updatedUser?.balance || 0)} 🪙</b>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Ещё", callback_data: "game_coinflip" },
          { text: "🎮 Меню", callback_data: "back_games" },
        ]],
      },
    }
  ).catch(() => {});

  try {
    await ctx.telegram.sendMessage(
      room.creator_id,
      `🪙 <b>Монетка — Результат</b>\n\nВыпало: <b>${resultLabel}</b>\n\n` +
      `${!youWon ? "🏆 <b>ТЫ ПОБЕДИЛ!</b>" : `🥈 Победил <b>${ctx.from!.first_name}</b>`}\n\n` +
      `💰 Банк: <b>${formatBalance(bank)} 🪙</b>  |  ⭐️ XP: <b>+${xp2}</b>`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}
}
