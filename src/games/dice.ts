import { Context } from "telegraf";
import {
  getUserById,
  updateBalance,
  recordGame,
  addXP,
  createDiceRoom,
  getDiceRoom,
  getWaitingDiceRooms,
  joinDiceRoom,
  updateDiceRoom,
  cancelDiceRoom,
} from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { diceBetMenu, diceRoomsList } from "../utils/keyboards";
import { config } from "../config";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function showDiceMenu(ctx: Context) {
  const text =
    `🎲 <b>DICE</b>\n\n` +
    `<b>Solo:</b> бросаешь кубик — выше 3 = ×2\n` +
    `<b>Мультиплеер:</b> кто бросит больше — забирает банк\n\n` +
    `Выбери режим:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🎲 Solo", callback_data: "dice_solo" },
        { text: "👥 Мультиплеер", callback_data: "dice_multi" },
      ],
      [{ text: "🔙 К играм", callback_data: "back_games" }],
    ],
  };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }).catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard }));
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

export async function showDiceSoloBetMenu(ctx: Context) {
  await ctx.editMessageText(
    `🎲 <b>DICE Solo</b>\n\nВыбери ставку:`,
    {
      parse_mode: "HTML",
      reply_markup: diceBetMenu("solo").reply_markup,
    }
  ).catch(() =>
    ctx.reply(`🎲 <b>DICE Solo</b>\n\nВыбери ставку:`, {
      parse_mode: "HTML",
      reply_markup: diceBetMenu("solo").reply_markup,
    })
  );
}

export async function playDiceSolo(ctx: Context, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) {
    return ctx.reply(
      `❌ Недостаточно средств\n💵 Баланс: ${formatBalance(user.balance)} 🪙\n💸 Ставка: ${formatBalance(bet)} 🪙`
    );
  }
  if (bet < config.MIN_BET || bet > config.MAX_BET) {
    return ctx.reply(`❌ Ставка: от ${config.MIN_BET} до ${config.MAX_BET} 🪙`);
  }

  await updateBalance(userId, -bet);

  const loadMsg = await ctx.reply(`🎲 Бросаю кубик...`);
  const diceMsg = await ctx.replyWithDice("🎲");
  const roll = diceMsg.dice!.value;

  await sleep(4000);

  const won = roll > 3;
  const winAmount = won ? bet * 2 : 0;
  if (won) await updateBalance(userId, winAmount);

  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "dice_solo", bet, won ? "win" : "loss", winAmount, { roll });

  const updatedUser = await getUserById(userId);

  let text =
    `${won ? "🎉 <b>ПОБЕДА!</b>" : "😔 <b>ПРОИГРЫШ</b>"}\n\n` +
    `🎲 Выпало: <b>${roll}</b> ${roll > 3 ? "✅" : "❌"} (нужно > 3)\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n`;

  if (won) text += `💰 Выигрыш: <b>+${formatBalance(winAmount)} 🪙</b>\n`;
  else text += `💸 Потеряно: <b>-${formatBalance(bet)} 🪙</b>\n`;

  text += `⭐ XP: +${xpGain}\n💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙`;
  if (leveledUp) text += `\n\n🆙 <b>Уровень ${newLevel}!</b> 🎊`;

  await ctx.telegram.editMessageText(ctx.chat!.id, loadMsg.message_id, undefined, text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔄 Ещё (${formatBalance(bet)} 🪙)`, callback_data: `dice_bet_solo_${bet}` },
          { text: "🎮 Меню игр", callback_data: "back_games" },
        ],
      ],
    },
  });
}

export async function showDiceMultiMenu(ctx: Context) {
  const rooms = await getWaitingDiceRooms();
  const userId = ctx.from!.id;
  const myRooms = rooms.filter((r) => r.creator_id === userId);
  const otherRooms = rooms.filter((r) => r.creator_id !== userId);

  let text = `🎲 <b>DICE Мультиплеер</b>\n\n`;
  if (otherRooms.length > 0) {
    text += `🚪 Открытые комнаты:\n`;
    for (const r of otherRooms) text += `  #${r.id} — 🪙 ${formatBalance(r.bet)}\n`;
    text += `\n`;
  } else {
    text += `Нет открытых комнат.\n\n`;
  }
  if (myRooms.length > 0) {
    text += `⏳ У тебя открыта комната #${myRooms[0].id}`;
  }

  const keyboard: any[][] = [];
  if (otherRooms.length > 0) {
    keyboard.push([{ text: "🚪 Присоединиться", callback_data: "dice_join_list" }]);
  }
  if (myRooms.length === 0) {
    keyboard.push([{ text: "➕ Создать комнату", callback_data: "dice_create" }]);
  } else {
    keyboard.push([{ text: "❌ Отменить мою комнату", callback_data: `dice_cancel_${myRooms[0].id}` }]);
  }
  keyboard.push([{ text: "🔙 Назад", callback_data: "game_dice" }]);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  }).catch(() =>
    ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } })
  );
}

export async function showDiceJoinList(ctx: Context) {
  const rooms = await getWaitingDiceRooms();
  const userId = ctx.from!.id;
  const otherRooms = rooms.filter((r) => r.creator_id !== userId);

  if (otherRooms.length === 0) {
    return ctx.editMessageText("❌ Нет доступных комнат. Создай свою!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Создать комнату", callback_data: "dice_create" }],
          [{ text: "🔙 Назад", callback_data: "dice_multi" }],
        ],
      },
    }).catch(() => ctx.reply("❌ Нет доступных комнат."));
  }

  return ctx.editMessageText(`🎲 <b>Выбери комнату:</b>`, {
    parse_mode: "HTML",
    reply_markup: diceRoomsList(otherRooms).reply_markup,
  }).catch(() => ctx.reply(`🎲 Выбери комнату:`, { reply_markup: diceRoomsList(otherRooms).reply_markup }));
}

export async function createDiceMultiRoom(ctx: Context, bet: number) {
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
  const room = await createDiceRoom(userId, bet);

  const botUsername = process.env.BOT_USERNAME || "ftpgame_bot";

  await ctx.reply(
    `🎲 <b>Комната #${room.id} создана!</b>\n\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n` +
    `⏳ Ожидаю соперника...\n\n` +
    `Отправь другу ссылку:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Пригласить друга", url: `https://t.me/share/url?url=https://t.me/${botUsername}?start=dice_${room.id}&text=Сыграй со мной в DICE!` }],
          [{ text: "❌ Отменить", callback_data: `dice_cancel_${room.id}` }],
        ],
      },
    }
  );

  await updateDiceRoom(room.id, { chat_id: ctx.chat!.id } as any);
}

export async function cancelDiceMultiRoom(ctx: Context, roomId: number) {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const refund = await cancelDiceRoom(roomId, userId);

  if (refund === null) {
    return ctx.editMessageText("❌ Комната не найдена или уже началась.").catch(() =>
      ctx.reply("❌ Не удалось отменить комнату.")
    );
  }

  await updateBalance(userId, refund);
  await ctx.editMessageText(
    `✅ Комната #${roomId} отменена.\n💵 Возвращено: ${formatBalance(refund)} 🪙`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🎲 Назад", callback_data: "dice_multi" }]] },
    }
  ).catch(() => ctx.reply(`✅ Комната отменена. Возвращено ${formatBalance(refund)} 🪙`));
}

export async function joinDiceMultiRoom(ctx: Context, roomId: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);
  const room = await getDiceRoom(roomId);

  if (!room) return ctx.reply("❌ Комната не найдена.");
  if (room.status !== "waiting") return ctx.reply("❌ Комната уже недоступна.");
  if (room.creator_id === userId) return ctx.reply("❌ Нельзя играть с собой!");
  if (!user || user.balance < room.bet) {
    return ctx.reply(
      `❌ Недостаточно средств!\n💸 Ставка: ${formatBalance(room.bet)} 🪙\n💵 Баланс: ${formatBalance(user?.balance || 0)} 🪙`
    );
  }

  await updateBalance(userId, -room.bet);
  await joinDiceRoom(roomId, userId);

  const waitMsg = await ctx.reply(`🎲 Комната #${room.id} — бросаю кубики...`, { parse_mode: "HTML" });

  await sleep(1000);
  const dice1Msg = await ctx.replyWithDice("🎲");
  await sleep(500);
  const dice2Msg = await ctx.replyWithDice("🎲");
  await sleep(4000);

  const roll1 = dice1Msg.dice!.value;
  const roll2 = dice2Msg.dice!.value;
  const creator = await getUserById(room.creator_id);
  const bank = room.bet * 2;

  let winnerId: number;
  let resultText: string;

  if (roll1 > roll2) {
    winnerId = room.creator_id;
    resultText = `🏆 ${creator?.first_name || "Создатель"} победил!\n🎲 ${roll1} vs ${roll2}`;
    await updateBalance(room.creator_id, bank);
    await recordGame(room.creator_id, "dice_multi", room.bet, "win", bank, { roll: roll1, opponent_roll: roll2 });
    await recordGame(userId, "dice_multi", room.bet, "loss", 0, { roll: roll2, opponent_roll: roll1 });
  } else if (roll2 > roll1) {
    winnerId = userId;
    resultText = `🏆 Ты победил!\n🎲 ${roll2} vs ${roll1}`;
    await updateBalance(userId, bank);
    await recordGame(userId, "dice_multi", room.bet, "win", bank, { roll: roll2, opponent_roll: roll1 });
    await recordGame(room.creator_id, "dice_multi", room.bet, "loss", 0, { roll: roll1, opponent_roll: roll2 });
  } else {
    winnerId = 0;
    resultText = `🤝 Ничья! Оба выбросили ${roll1}`;
    await updateBalance(userId, room.bet);
    await updateBalance(room.creator_id, room.bet);
    await recordGame(userId, "dice_multi", room.bet, "draw", room.bet, { roll: roll2 });
    await recordGame(room.creator_id, "dice_multi", room.bet, "draw", room.bet, { roll: roll1 });
  }

  await updateDiceRoom(roomId, {
    status: "finished",
    creator_roll: roll1,
    player2_roll: roll2,
    winner_id: winnerId || undefined,
  } as any);

  const xp1 = calcXPGain(room.bet, roll2 > roll1);
  const xp2 = calcXPGain(room.bet, roll1 > roll2);
  await addXP(userId, xp1);
  await addXP(room.creator_id, xp2);

  const updatedUser = await getUserById(userId);

  await ctx.telegram.editMessageText(ctx.chat!.id, waitMsg.message_id, undefined,
    `${resultText}\n\n💰 Банк: ${formatBalance(bank)} 🪙\n⭐ XP: +${xp1}\n💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Ещё", callback_data: "dice_multi" },
            { text: "🎮 Меню", callback_data: "back_games" },
          ],
        ],
      },
    }
  ).catch(() =>
    ctx.reply(
      `${resultText}\n\n💰 Банк: ${formatBalance(bank)} 🪙\n💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙`,
      { parse_mode: "HTML" }
    )
  );

  try {
    await ctx.telegram.sendMessage(
      room.creator_id,
      `${resultText}\n\n💰 Банк: ${formatBalance(bank)} 🪙\n⭐ XP: +${xp2}`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}
}
