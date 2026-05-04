import { Context } from "telegraf";
import {
  getUserById, updateBalance, recordGame, addXP,
  createDiceRoom, getDiceRoom, getWaitingDiceRooms,
  joinDiceRoom, updateDiceRoom, cancelDiceRoom,
} from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { diceBetMenu, diceRoomsList } from "../utils/keyboards";
import { config } from "../config";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function showDiceMenu(ctx: Context) {
  const text =
    `🎲 <b>DICE</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🎲 <b>Solo:</b> бросаешь кубик — >3 = ×2\n` +
    `👥 <b>Мульти:</b> у кого выше — забирает банк\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Выбери режим:`;

  const kb = {
    inline_keyboard: [
      [
        { text: "🎲 Solo", callback_data: "dice_solo" },
        { text: "👥 Мультиплеер", callback_data: "dice_multi" },
      ],
      [{ text: "🔙 К играм", callback_data: "back_games" }],
    ],
  };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb })
      .catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: kb }));
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function showDiceSoloBetMenu(ctx: Context) {
  const text = `🎲 <b>DICE Solo</b>\n━━━━━━━━━━━━━━━\nВыбери ставку:`;
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: diceBetMenu("solo").reply_markup })
    .catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: diceBetMenu("solo").reply_markup }));
}

export async function playDiceSolo(ctx: Context, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) return ctx.reply(`❌ Недостаточно средств\n💼 Баланс: <b>${formatBalance(user.balance)} 🪙</b>`, { parse_mode: "HTML" });
  if (bet < config.MIN_BET || bet > config.MAX_BET) return ctx.reply(`❌ Ставка: ${config.MIN_BET}–${config.MAX_BET} 🪙`);

  await updateBalance(userId, -bet);

  const waitMsg = await ctx.reply(`🎲 <b>DICE Solo</b>\n━━━━━━━━━━━━━━━\n⏳ Бросаю кубик...`, { parse_mode: "HTML" });

  // Native Telegram dice animation!
  const diceMsg = await ctx.replyWithDice("🎲");
  const roll = diceMsg.dice!.value;

  // Wait for animation (4 seconds for dice)
  await sleep(4000);

  const won = roll > 3;
  const winAmount = won ? bet * 2 : 0;
  if (won) await updateBalance(userId, winAmount);

  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "dice_solo", bet, won ? "win" : "loss", winAmount, { roll });

  const updatedUser = await getUserById(userId);

  // Dice face visuals
  const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const face = FACES[roll] || `[${roll}]`;

  await ctx.telegram.editMessageText(ctx.chat!.id, waitMsg.message_id, undefined,
    `🎲 <b>DICE Solo</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Выпало: <b>${face} ${roll}</b>  ${roll > 3 ? "✅" : "❌"}  (нужно >3)\n` +
    `━━━━━━━━━━━━━━━\n` +
    `${won ? "🏆 <b>ПОБЕДА!</b>  ×2" : "💀 <b>ПРОИГРЫШ</b>"}\n` +
    `💸 Ставка: <b>${formatBalance(bet)} 🪙</b>\n` +
    (won ? `💰 Выигрыш: <b>+${formatBalance(winAmount)} 🪙</b>\n` : `📉 Потеряно: <b>${formatBalance(bet)} 🪙</b>\n`) +
    `⭐️ XP: <b>+${xpGain}</b>  |  💼 <b>${formatBalance(updatedUser?.balance || 0)} 🪙</b>` +
    (leveledUp ? `\n🆙 <b>УРОВЕНЬ ${newLevel}!</b> 🎊` : ""),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: `🔄 Снова (${formatBalance(bet)} 🪙)`, callback_data: `dice_bet_solo_${bet}` },
          { text: "🎮 Меню", callback_data: "back_games" },
        ]],
      },
    }
  ).catch(() => {});
}

export async function showDiceMultiMenu(ctx: Context) {
  const rooms = await getWaitingDiceRooms();
  const userId = ctx.from!.id;
  const myRooms = rooms.filter(r => r.creator_id === userId);
  const otherRooms = rooms.filter(r => r.creator_id !== userId);

  let text = `🎲 <b>DICE Мультиплеер</b>\n━━━━━━━━━━━━━━━\n`;
  if (otherRooms.length > 0) {
    text += `<b>Открытые комнаты:</b>\n`;
    for (const r of otherRooms) text += `◆ #${r.id}  💸 <b>${formatBalance(r.bet)} 🪙</b>\n`;
    text += `\n`;
  } else {
    text += `Нет открытых комнат.\n\n`;
  }
  if (myRooms.length > 0) text += `⏳ Твоя комната: <b>#${myRooms[0].id}</b>`;

  const keyboard: any[][] = [];
  if (otherRooms.length > 0) keyboard.push([{ text: "🚪 Присоединиться", callback_data: "dice_join_list" }]);
  if (myRooms.length === 0) keyboard.push([{ text: "➕ Создать комнату", callback_data: "dice_create" }]);
  else keyboard.push([{ text: "❌ Отменить комнату", callback_data: `dice_cancel_${myRooms[0].id}` }]);
  keyboard.push([{ text: "🔙 Назад", callback_data: "game_dice" }]);

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } })
    .catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } }));
}

export async function showDiceJoinList(ctx: Context) {
  const rooms = await getWaitingDiceRooms();
  const userId = ctx.from!.id;
  const otherRooms = rooms.filter(r => r.creator_id !== userId);

  if (otherRooms.length === 0) {
    return ctx.editMessageText("❌ Нет доступных комнат.", {
      reply_markup: { inline_keyboard: [
        [{ text: "➕ Создать", callback_data: "dice_create" }],
        [{ text: "🔙 Назад", callback_data: "dice_multi" }],
      ]},
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
  if (user.balance < bet) return ctx.reply(`❌ Недостаточно средств!`);
  if (bet < config.MIN_BET || bet > config.MAX_BET) return ctx.reply(`❌ Ставка: ${config.MIN_BET}–${config.MAX_BET} 🪙`);

  await updateBalance(userId, -bet);
  const room = await createDiceRoom(userId, bet);
  const botUsername = process.env.BOT_USERNAME || "ftpgame_bot";

  await ctx.reply(
    `🎲 <b>Комната #${room.id} создана!</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `💸 Ставка: <b>${formatBalance(bet)} 🪙</b>\n` +
    `⏳ Ожидаю соперника...`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Пригласить друга", url: `https://t.me/share/url?url=https://t.me/${botUsername}?start=dice_${room.id}` }],
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
  if (refund === null) return ctx.editMessageText("❌ Комната не найдена.").catch(() => ctx.reply("❌ Ошибка."));
  await updateBalance(userId, refund);
  await ctx.editMessageText(
    `✅ Комната #${roomId} отменена\n💵 Возвращено: <b>${formatBalance(refund)} 🪙</b>`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🎲 Назад", callback_data: "dice_multi" }]] },
    }
  ).catch(() => ctx.reply(`✅ Возвращено ${formatBalance(refund)} 🪙`));
}

export async function joinDiceMultiRoom(ctx: Context, roomId: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);
  const room = await getDiceRoom(roomId);

  if (!room) return ctx.reply("❌ Комната не найдена.");
  if (room.status !== "waiting") return ctx.reply("❌ Комната недоступна.");
  if (room.creator_id === userId) return ctx.reply("❌ Нельзя играть с собой!");
  if (!user || user.balance < room.bet) return ctx.reply(`❌ Недостаточно средств!\n💸 Нужно: <b>${formatBalance(room.bet)} 🪙</b>`, { parse_mode: "HTML" });

  await updateBalance(userId, -room.bet);
  await joinDiceRoom(roomId, userId);

  const waitMsg = await ctx.reply(
    `🎲 <b>DICE vs соперник</b>\n━━━━━━━━━━━━━━━\n💸 Банк: <b>${formatBalance(room.bet * 2)} 🪙</b>\n\n⏳ Бросаем кубики...`,
    { parse_mode: "HTML" }
  );

  await sleep(1000);

  // Both dice animations
  const dice1 = await ctx.replyWithDice("🎲");
  await sleep(500);
  const dice2 = await ctx.replyWithDice("🎲");

  await sleep(4500); // Wait for animation

  const roll1 = dice1.dice!.value;
  const roll2 = dice2.dice!.value;
  const creator = await getUserById(room.creator_id);
  const bank = room.bet * 2;

  const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  let winnerId: number, resultLine: string;

  if (roll1 > roll2) {
    winnerId = room.creator_id;
    resultLine = `🏆 <b>${creator?.first_name || "Создатель"} победил!</b>`;
    await updateBalance(room.creator_id, bank);
    await recordGame(room.creator_id, "dice_multi", room.bet, "win", bank, { roll: roll1, vs: roll2 });
    await recordGame(userId, "dice_multi", room.bet, "loss", 0, { roll: roll2, vs: roll1 });
  } else if (roll2 > roll1) {
    winnerId = userId;
    resultLine = `🏆 <b>Ты победил!</b>`;
    await updateBalance(userId, bank);
    await recordGame(userId, "dice_multi", room.bet, "win", bank, { roll: roll2, vs: roll1 });
    await recordGame(room.creator_id, "dice_multi", room.bet, "loss", 0, { roll: roll1, vs: roll2 });
  } else {
    winnerId = 0;
    resultLine = `🤝 <b>Ничья! Ставки возвращены.</b>`;
    await updateBalance(userId, room.bet);
    await updateBalance(room.creator_id, room.bet);
    await recordGame(userId, "dice_multi", room.bet, "draw", room.bet, { roll: roll2 });
    await recordGame(room.creator_id, "dice_multi", room.bet, "draw", room.bet, { roll: roll1 });
  }

  await updateDiceRoom(roomId, { status: "finished", creator_roll: roll1, player2_roll: roll2, winner_id: winnerId || undefined } as any);

  const xp1 = calcXPGain(room.bet, roll2 > roll1);
  const xp2 = calcXPGain(room.bet, roll1 > roll2);
  await addXP(userId, xp1);
  await addXP(room.creator_id, xp2);

  const updatedUser = await getUserById(userId);

  await ctx.telegram.editMessageText(ctx.chat!.id, waitMsg.message_id, undefined,
    `🎲 <b>DICE — РЕЗУЛЬТАТ</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `${creator?.first_name || "Они"}: <b>${FACES[roll1]} ${roll1}</b>  |  Ты: <b>${FACES[roll2]} ${roll2}</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `${resultLine}\n` +
    `💰 Банк: <b>${formatBalance(bank)} 🪙</b>\n` +
    `⭐️ XP: <b>+${xp1}</b>  |  💼 <b>${formatBalance(updatedUser?.balance || 0)} 🪙</b>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Ещё", callback_data: "dice_multi" },
          { text: "🎮 Меню", callback_data: "back_games" },
        ]],
      },
    }
  ).catch(() => {});

  try {
    await ctx.telegram.sendMessage(room.creator_id,
      `🎲 <b>DICE — РЕЗУЛЬТАТ</b>\n━━━━━━━━━━━━━━━\n` +
      `Ты: <b>${FACES[roll1]} ${roll1}</b>  |  Они: <b>${FACES[roll2]} ${roll2}</b>\n` +
      `━━━━━━━━━━━━━━━\n${roll1 > roll2 ? "🏆 <b>Ты победил!</b>" : roll2 > roll1 ? "🥈 Проигрыш" : "🤝 Ничья"}\n` +
      `💰 Банк: <b>${formatBalance(bank)} 🪙</b>  |  ⭐️ XP: <b>+${xp2}</b>`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}
}
