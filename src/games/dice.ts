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
} from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { diceBetMenu, diceRoomsList } from "../utils/keyboards";
import { config } from "../config";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function showDiceMenu(ctx: Context) {
  await ctx.replyWithPhoto(
    { source: "assets/banner_games.png" },
    {
      caption:
        `🎲 <b>DICE — Кубик</b>\n\n` +
        `<b>Solo режим:</b>\n` +
        `• Бросаешь кубик 🎲\n` +
        `• Выпало > 3 → Победа ×2 ✅\n` +
        `• Выпало ≤ 3 → Проигрыш ❌\n\n` +
        `<b>Мультиплеер:</b>\n` +
        `• Создаёшь комнату с ставкой\n` +
        `• Второй игрок присоединяется\n` +
        `• Кто бросит больше — забирает банк! 🏆\n\n` +
        `Выбери режим:`,
      parse_mode: "HTML",
    }
  ).catch(() =>
    ctx.reply(
      `🎲 <b>DICE — Кубик</b>\n\nВыбери режим игры:`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🎲 Solo", callback_data: "dice_solo" },
              { text: "👥 Мультиплеер", callback_data: "dice_multi" },
            ],
            [{ text: "🔙 Назад", callback_data: "back_games" }],
          ],
        },
      }
    )
  );

  await ctx.reply("Выбери режим:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎲 Solo", callback_data: "dice_solo" },
          { text: "👥 Мультиплеер", callback_data: "dice_multi" },
        ],
        [{ text: "🔙 К играм", callback_data: "back_games" }],
      ],
    },
  });
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

  if (!user || user.banned) {
    return ctx.reply("❌ Аккаунт заблокирован или не найден.");
  }
  if (user.balance < bet) {
    return ctx.reply(
      `❌ Недостаточно средств!\n💵 Баланс: ${formatBalance(user.balance)} 🪙\n💸 Ставка: ${formatBalance(bet)} 🪙`
    );
  }
  if (bet < config.MIN_BET || bet > config.MAX_BET) {
    return ctx.reply(
      `❌ Ставка должна быть от ${config.MIN_BET} до ${config.MAX_BET} 🪙`
    );
  }

  await updateBalance(userId, -bet);

  const loadMsg = await ctx.reply("🎲 Бросаю кубик...");

  const diceMsg = await ctx.replyWithDice("🎲");
  const roll = diceMsg.dice!.value;

  await sleep(4000);

  const won = roll > 3;
  const winAmount = won ? bet * 2 : 0;
  if (won) await updateBalance(userId, winAmount);

  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "dice_solo", bet, won ? "win" : "loss", winAmount, {
    roll,
    threshold: 3,
  });

  const updatedUser = await getUserById(userId);

  let text =
    `${won ? "🎉 ПОБЕДА!" : "😔 ПРОИГРЫШ"}\n\n` +
    `🎲 Выпало: <b>${roll}</b> (нужно > 3)\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n`;

  if (won) {
    text += `💰 Выигрыш: <b>+${formatBalance(winAmount)} 🪙</b>\n`;
  } else {
    text += `💸 Потеряно: <b>-${formatBalance(bet)} 🪙</b>\n`;
  }

  text +=
    `⭐ XP: +${xpGain}\n` +
    `💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙\n`;

  if (leveledUp) {
    text += `\n🆙 <b>НОВЫЙ УРОВЕНЬ ${newLevel}!</b> 🎊`;
  }

  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    loadMsg.message_id,
    undefined,
    text,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `🔄 Ещё раз (×${formatBalance(bet)})`,
              callback_data: `dice_bet_solo_${bet}`,
            },
            { text: "🎮 Меню игр", callback_data: "back_games" },
          ],
        ],
      },
    }
  );
}

export async function showDiceMultiMenu(ctx: Context) {
  const rooms = await getWaitingDiceRooms();
  const userId = ctx.from!.id;
  const myRooms = rooms.filter((r) => r.creator_id === userId);
  const otherRooms = rooms.filter((r) => r.creator_id !== userId);

  let text = `🎲 <b>DICE Мультиплеер</b>\n\n`;

  if (otherRooms.length > 0) {
    text += `🚪 <b>Открытые комнаты:</b>\n`;
    for (const r of otherRooms) {
      text += `• Комната #${r.id} — 🪙 ${formatBalance(r.bet)}\n`;
    }
    text += `\n`;
  } else {
    text += `Нет открытых комнат.\n\n`;
  }

  if (myRooms.length > 0) {
    text += `⚠️ У тебя уже есть открытая комната #${myRooms[0].id}\n`;
  }

  const keyboard: any[][] = [];

  if (otherRooms.length > 0) {
    keyboard.push([{ text: "🚪 Присоединиться к комнате", callback_data: "dice_join_list" }]);
  }

  if (myRooms.length === 0) {
    keyboard.push([{ text: "➕ Создать комнату", callback_data: "dice_create" }]);
  }

  keyboard.push([{ text: "🔙 Назад", callback_data: "game_dice" }]);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  }).catch(() =>
    ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    })
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

  return ctx.editMessageText(
    `🎲 <b>Выбери комнату для присоединения:</b>`,
    {
      parse_mode: "HTML",
      reply_markup: diceRoomsList(otherRooms).reply_markup,
    }
  ).catch(() =>
    ctx.reply(`🎲 Выбери комнату:`, {
      parse_mode: "HTML",
      reply_markup: diceRoomsList(otherRooms).reply_markup,
    })
  );
}

export async function createDiceMultiRoom(ctx: Context, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) {
    return ctx.reply(
      `❌ Недостаточно средств!\n💵 Баланс: ${formatBalance(user.balance)} 🪙`
    );
  }

  await updateBalance(userId, -bet);
  const room = await createDiceRoom(userId, bet);

  const msg = await ctx.reply(
    `🎲 <b>Комната #${room.id} создана!</b>\n\n` +
      `💸 Ставка: ${formatBalance(bet)} 🪙\n` +
      `⏳ Ожидаю второго игрока...\n\n` +
      `Поделись этим с другом:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Присоединиться к комнате",
              url: `https://t.me/share/url?url=t.me/${process.env.BOT_USERNAME || "ftpgame_bot"}?start=dice_${room.id}`,
            },
          ],
          [{ text: "❌ Отменить", callback_data: `dice_cancel_${room.id}` }],
        ],
      },
    }
  );

  await updateDiceRoom(room.id, {
    message_id: msg.message_id,
    chat_id: ctx.chat!.id,
  } as any);
}

export async function joinDiceMultiRoom(ctx: Context, roomId: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);
  const room = await getDiceRoom(roomId);

  if (!room) return ctx.reply("❌ Комната не найдена.");
  if (room.status !== "waiting") return ctx.reply("❌ Комната уже занята.");
  if (room.creator_id === userId) return ctx.reply("❌ Нельзя играть с собой!");

  if (!user || user.balance < room.bet) {
    return ctx.reply(
      `❌ Недостаточно средств!\n💸 Ставка: ${formatBalance(room.bet)} 🪙\n💵 Баланс: ${formatBalance(user?.balance || 0)} 🪙`
    );
  }

  await updateBalance(userId, -room.bet);
  await joinDiceRoom(roomId, userId);

  await ctx.reply(
    `🎲 <b>Ты присоединился к комнате #${room.id}!</b>\n` +
      `💸 Ставка: ${formatBalance(room.bet)} 🪙\n\n` +
      `Бросаю кубики... 🎲`,
    { parse_mode: "HTML" }
  );

  await sleep(1000);

  const dice1Msg = await ctx.replyWithDice("🎲");
  const creator = await getUserById(room.creator_id);

  await sleep(500);

  const dice2Msg = await ctx.replyWithDice("🎲");

  await sleep(4000);

  const roll1 = dice1Msg.dice!.value;
  const roll2 = dice2Msg.dice!.value;

  let winnerId: number;
  let resultText: string;

  const bank = room.bet * 2;

  if (roll1 > roll2) {
    winnerId = room.creator_id;
    resultText =
      `🏆 <b>${creator?.first_name || "Создатель"} побеждает!</b>\n` +
      `🎲 ${creator?.first_name || "Создатель"}: <b>${roll1}</b> vs Ты: <b>${roll2}</b>`;
    await updateBalance(room.creator_id, bank);
    await recordGame(room.creator_id, "dice_multi", room.bet, "win", bank, { roll: roll1, opponent_roll: roll2 });
    await recordGame(userId, "dice_multi", room.bet, "loss", 0, { roll: roll2, opponent_roll: roll1 });
  } else if (roll2 > roll1) {
    winnerId = userId;
    resultText =
      `🏆 <b>Ты побеждаешь!</b>\n` +
      `🎲 Ты: <b>${roll2}</b> vs ${creator?.first_name || "Создатель"}: <b>${roll1}</b>`;
    await updateBalance(userId, bank);
    await recordGame(userId, "dice_multi", room.bet, "win", bank, { roll: roll2, opponent_roll: roll1 });
    await recordGame(room.creator_id, "dice_multi", room.bet, "loss", 0, { roll: roll1, opponent_roll: roll2 });
  } else {
    winnerId = 0;
    resultText = `🤝 <b>Ничья!</b>\n🎲 Оба выбросили: <b>${roll1}</b>\n💸 Ставки возвращены`;
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

  await ctx.reply(
    `${resultText}\n\n` +
      `💰 Банк: ${formatBalance(bank)} 🪙\n` +
      `⭐ XP получено: +${xp1}\n` +
      `💵 Твой баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙`,
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
  );

  try {
    await ctx.telegram.sendMessage(
      room.creator_id,
      `${resultText}\n\n💰 Банк: ${formatBalance(bank)} 🪙\n⭐ XP: +${xp2}`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}
}
