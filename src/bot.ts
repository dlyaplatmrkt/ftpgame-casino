import { Telegraf, session } from "telegraf";
import { config } from "./config";
import { initDB } from "./db/client";
import { getUserById } from "./db/queries";
import { mainMenu, gamesMenu, backMenu } from "./utils/keyboards";
import { helpMessage, topMessage } from "./utils/formatting";
import { handleStart } from "./handlers/start";
import { handleCabinet, handleHistory, handleTransactionHistory } from "./handlers/cabinet";
import { handleDeposit, handleDepositCurrency, createDepositInvoice, checkPayment, handleWithdraw, handleWithdrawCurrency } from "./handlers/payment";
import { handleReferral } from "./handlers/referral";
import { handleAdmin, handleAdminUsers, handleBanUser, isAdmin } from "./handlers/admin";
import { showDiceMenu, showDiceSoloBetMenu, playDiceSolo, showDiceMultiMenu, showDiceJoinList, createDiceMultiRoom, joinDiceMultiRoom } from "./games/dice";
import { playSlots, showSlotsPaytable } from "./games/slots";
import { playCoinflipSolo, showCoinflipMultiMenu, showCoinflipJoinList, createCoinflipMultiRoom, joinCoinflipMultiRoom } from "./games/coinflip";
import { showRouletteMenu, showRouletteBetSize, playRoulette, askRouletteNumber } from "./games/roulette";
import { getTopPlayers } from "./db/queries";
import { formatBalance } from "./utils/levels";

const pendingInputs: Map<number, { type: string; data?: any }> = new Map();

export async function createBot() {
  await initDB();

  const bot = new Telegraf(config.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    if (ctx.from) {
      const user = await getUserById(ctx.from.id);
      if (user?.banned) {
        return ctx.reply(`🚫 Ваш аккаунт заблокирован. Поддержка: ${config.SUPPORT}`);
      }
    }
    return next();
  });

  bot.command("start", handleStart);
  bot.command("help", async (ctx) => ctx.reply(helpMessage(), { parse_mode: "HTML" }));
  bot.command("admin", handleAdmin);
  bot.command("ban", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    if (targetId) await handleBanUser(ctx, targetId);
  });
  bot.command("credit", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const args = ctx.message.text.split(" ");
    const targetId = parseInt(args[1]);
    const amount = parseFloat(args[2]);
    if (targetId && amount) {
      const { handleAdminCredit } = await import("./handlers/admin");
      await handleAdminCredit(ctx, targetId, amount);
    }
  });
  bot.command("broadcast", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const text = ctx.message.text.replace("/broadcast ", "");
    const { handleBroadcast } = await import("./handlers/admin");
    await handleBroadcast(ctx, text);
  });
  bot.command("balance", async (ctx) => {
    const user = await getUserById(ctx.from!.id);
    if (!user) return ctx.reply("❌ Сначала напиши /start");
    await ctx.reply(`💵 Твой баланс: <b>${formatBalance(user.balance)} 🪙</b>`, { parse_mode: "HTML" });
  });
  bot.command("top", async (ctx) => {
    const players = await getTopPlayers(10);
    await ctx.reply(topMessage(players), { parse_mode: "HTML" });
  });

  bot.hears("🎮 Играть", async (ctx) => {
    await ctx.reply("🎮 <b>ВЫБЕРИ ИГРУ</b>", {
      parse_mode: "HTML",
      reply_markup: gamesMenu.reply_markup,
    });
  });

  bot.hears("👤 Кабинет", handleCabinet);
  bot.hears("💰 Пополнить", handleDeposit);
  bot.hears("💸 Вывести", handleWithdraw);
  bot.hears("👥 Рефералы", handleReferral);
  bot.hears("📊 История", async (ctx) => {
    const history = await import("./db/queries").then(m => m.getUserHistory(ctx.from!.id, 15));
    if (history.length === 0) return ctx.reply("📊 История пуста. Сыграй первую игру!");

    const gameEmojis: Record<string, string> = {
      dice_solo: "🎲", dice_multi: "🎲👥",
      slots: "🎰", coinflip: "🪙", coinflip_multi: "🪙👥", roulette: "🎡"
    };
    let text = `📊 <b>ИСТОРИЯ ИГР</b>\n\n`;
    for (const g of history) {
      const emoji = gameEmojis[g.game_type] || "🎮";
      const res = g.result === "win" ? "✅" : g.result === "draw" ? "🤝" : "❌";
      text += `${emoji} ${res} ${formatBalance(g.bet)} 🪙`;
      if (g.result === "win") text += ` → +${formatBalance(g.win_amount)} 🪙`;
      text += `\n`;
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.hears("🏆 Топ игроков", async (ctx) => {
    const players = await getTopPlayers(10);
    await ctx.reply(topMessage(players), { parse_mode: "HTML" });
  });
  bot.hears("ℹ️ Помощь", async (ctx) => ctx.reply(helpMessage(), { parse_mode: "HTML" }));
  bot.hears("🔙 Главное меню", async (ctx) => {
    const user = await getUserById(ctx.from!.id);
    if (!user) return;
    await ctx.reply("🏠 Главное меню", { reply_markup: mainMenu.reply_markup });
  });

  bot.on("callback_query", async (ctx) => {
    const data = (ctx.callbackQuery as any).data as string;
    if (!data) return;

    try {
      if (data === "back_main") {
        await ctx.answerCbQuery();
        return ctx.reply("🏠 Главное меню", { reply_markup: mainMenu.reply_markup });
      }

      if (data === "back_games") {
        await ctx.answerCbQuery();
        return ctx.editMessageText("🎮 <b>ВЫБЕРИ ИГРУ</b>", {
          parse_mode: "HTML",
          reply_markup: gamesMenu.reply_markup,
        }).catch(() => ctx.reply("🎮 <b>ВЫБЕРИ ИГРУ</b>", {
          parse_mode: "HTML",
          reply_markup: gamesMenu.reply_markup,
        }));
      }

      if (data === "back_cabinet") {
        await ctx.answerCbQuery();
        return handleCabinet(ctx);
      }

      if (data === "open_deposit") {
        await ctx.answerCbQuery();
        return handleDeposit(ctx);
      }

      if (data === "open_withdraw") {
        await ctx.answerCbQuery();
        return handleWithdraw(ctx);
      }

      if (data === "referral_refresh") {
        await ctx.answerCbQuery();
        return handleReferral(ctx);
      }

      if (data === "history_games") return handleHistory(ctx);
      if (data === "history_tx") return handleTransactionHistory(ctx);

      if (data === "game_dice") {
        await ctx.answerCbQuery();
        return showDiceMenu(ctx);
      }
      if (data === "dice_solo") {
        await ctx.answerCbQuery();
        return showDiceSoloBetMenu(ctx);
      }
      if (data === "dice_multi") {
        await ctx.answerCbQuery();
        return showDiceMultiMenu(ctx);
      }
      if (data === "dice_join_list") {
        await ctx.answerCbQuery();
        return showDiceJoinList(ctx);
      }
      if (data === "dice_create") {
        await ctx.answerCbQuery();
        return ctx.editMessageText("🎲 <b>Создать комнату DICE</b>\n\nВыбери ставку:", {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🪙 1", callback_data: "dice_bet_multi_1" },
                { text: "🪙 5", callback_data: "dice_bet_multi_5" },
                { text: "🪙 10", callback_data: "dice_bet_multi_10" },
              ],
              [
                { text: "🪙 25", callback_data: "dice_bet_multi_25" },
                { text: "🪙 50", callback_data: "dice_bet_multi_50" },
                { text: "🪙 100", callback_data: "dice_bet_multi_100" },
              ],
              [{ text: "🔙 Назад", callback_data: "dice_multi" }],
            ],
          },
        }).catch(() => ctx.reply("Выбери ставку для комнаты:"));
      }

      const diceBetSoloMatch = data.match(/^dice_bet_solo_(\d+(?:\.\d+)?)$/);
      if (diceBetSoloMatch) {
        await ctx.answerCbQuery();
        return playDiceSolo(ctx, parseFloat(diceBetSoloMatch[1]));
      }

      const diceBetMultiMatch = data.match(/^dice_bet_multi_(\d+(?:\.\d+)?)$/);
      if (diceBetMultiMatch) {
        await ctx.answerCbQuery();
        return createDiceMultiRoom(ctx, parseFloat(diceBetMultiMatch[1]));
      }

      const joinDiceMatch = data.match(/^join_dice_(\d+)$/);
      if (joinDiceMatch) {
        await ctx.answerCbQuery();
        return joinDiceMultiRoom(ctx, parseInt(joinDiceMatch[1]));
      }

      if (data === "game_slots") {
        await ctx.answerCbQuery();
        const { slotsBetMenu } = await import("./utils/keyboards");
        return ctx.editMessageText(
          `🎰 <b>СЛОТЫ</b>\n\n` +
          `Символы: 🍒 🍋 🍊 🍇 ⭐ 💎\n` +
          `💎💎💎 = ×10 | ⭐⭐⭐ = ×5 | 3 одинак. = ×3\n\n` +
          `Выбери ставку:`,
          {
            parse_mode: "HTML",
            reply_markup: slotsBetMenu().reply_markup,
          }
        ).catch(() => ctx.reply("🎰 Выбери ставку:", { reply_markup: { inline_keyboard: [] } }));
      }

      const slotsBetMatch = data.match(/^slots_bet_(\d+(?:\.\d+)?)$/);
      if (slotsBetMatch) {
        await ctx.answerCbQuery("🎰 Крутим барабаны!");
        return playSlots(ctx, parseFloat(slotsBetMatch[1]));
      }

      if (data === "slots_paytable") {
        return showSlotsPaytable(ctx);
      }

      if (data === "game_coinflip") {
        await ctx.answerCbQuery();
        const { coinflipMenu } = await import("./utils/keyboards");
        return ctx.editMessageText(
          `🪙 <b>МОНЕТКА</b>\n\n` +
          `Solo: ×2 на твою сторону\n` +
          `Мультиплеер: ставки складываются в банк\n\n` +
          `Выбери режим:`,
          {
            parse_mode: "HTML",
            reply_markup: coinflipMenu().reply_markup,
          }
        ).catch(() => ctx.reply("🪙 Выбери режим:", { reply_markup: coinflipMenu().reply_markup }));
      }

      if (data === "coinflip_solo_heads" || data === "coinflip_solo_tails") {
        await ctx.answerCbQuery();
        const choice = data === "coinflip_solo_heads" ? "heads" : "tails";
        const { coinflipBetMenu } = await import("./utils/keyboards");
        return ctx.editMessageText(
          `🪙 ${choice === "heads" ? "🦅 Орёл" : "🦁 Решка"} — выбери ставку:`,
          {
            parse_mode: "HTML",
            reply_markup: coinflipBetMenu(choice, "solo").reply_markup,
          }
        ).catch(() => ctx.reply("🪙 Выбери ставку:"));
      }

      if (data === "coinflip_multi") {
        await ctx.answerCbQuery();
        return showCoinflipMultiMenu(ctx);
      }

      if (data === "cf_join_list") {
        await ctx.answerCbQuery();
        return showCoinflipJoinList(ctx);
      }

      if (data === "cf_create_menu") {
        await ctx.answerCbQuery();
        return ctx.editMessageText("🪙 Выбери свою сторону:", {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🦅 Орёл", callback_data: "cf_create_heads" },
                { text: "🦁 Решка", callback_data: "cf_create_tails" },
              ],
              [{ text: "🔙 Назад", callback_data: "coinflip_multi" }],
            ],
          },
        }).catch(() => ctx.reply("Выбери сторону:"));
      }

      if (data === "cf_create_heads" || data === "cf_create_tails") {
        await ctx.answerCbQuery();
        const choice = data === "cf_create_heads" ? "heads" : "tails";
        const { coinflipBetMenu } = await import("./utils/keyboards");
        return ctx.editMessageText(`🪙 ${choice === "heads" ? "🦅 Орёл" : "🦁 Решка"} — выбери ставку:`, {
          parse_mode: "HTML",
          reply_markup: coinflipBetMenu(choice, "multi").reply_markup,
        }).catch(() => ctx.reply("🪙 Выбери ставку:"));
      }

      const cfBetMatch = data.match(/^cf_bet_(solo|multi)_(heads|tails)_(\d+(?:\.\d+)?)$/);
      if (cfBetMatch) {
        const mode = cfBetMatch[1];
        const choice = cfBetMatch[2];
        const bet = parseFloat(cfBetMatch[3]);
        await ctx.answerCbQuery("🪙 Подбрасываю монету!");
        if (mode === "solo") return playCoinflipSolo(ctx, choice, bet);
        else return createCoinflipMultiRoom(ctx, choice, bet);
      }

      const joinCfMatch = data.match(/^join_cf_(\d+)$/);
      if (joinCfMatch) {
        await ctx.answerCbQuery();
        return joinCoinflipMultiRoom(ctx, parseInt(joinCfMatch[1]));
      }

      if (data === "game_roulette") {
        await ctx.answerCbQuery();
        return showRouletteMenu(ctx);
      }

      if (data.startsWith("roulette_")) {
        const betType = data.replace("roulette_", "");
        await ctx.answerCbQuery();
        if (betType === "number") {
          pendingInputs.set(ctx.from!.id, { type: "roulette_number_bet_size" });
          return ctx.editMessageText(
            `🔢 <b>Рулетка — Точное число (×36)</b>\n\nВыбери ставку:`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "🪙 1", callback_data: "rou_bet_number_1" },
                    { text: "🪙 5", callback_data: "rou_bet_number_5" },
                    { text: "🪙 10", callback_data: "rou_bet_number_10" },
                  ],
                  [
                    { text: "🪙 25", callback_data: "rou_bet_number_25" },
                    { text: "🪙 50", callback_data: "rou_bet_number_50" },
                    { text: "🪙 100", callback_data: "rou_bet_number_100" },
                  ],
                  [{ text: "🔙 Назад", callback_data: "game_roulette" }],
                ],
              },
            }
          ).catch(() => ctx.reply("🔢 Выбери ставку:"));
        }
        return showRouletteBetSize(ctx, betType);
      }

      const rouBetMatch = data.match(/^rou_bet_(red|black|green|number)_(\d+(?:\.\d+)?)$/);
      if (rouBetMatch) {
        await ctx.answerCbQuery("🎡 Запускаю рулетку!");
        const betType = rouBetMatch[1];
        const bet = parseFloat(rouBetMatch[2]);
        if (betType === "number") {
          pendingInputs.set(ctx.from!.id, { type: "roulette_number", data: { bet } });
          return ctx.reply(
            `🔢 <b>Введи число от 0 до 36:</b>\n\n💸 Ставка: ${bet} 🪙`,
            { parse_mode: "HTML" }
          );
        }
        return playRoulette(ctx, betType, bet);
      }

      if (data.startsWith("deposit_")) {
        const currency = data.replace("deposit_", "");
        return handleDepositCurrency(ctx, currency);
      }

      const depAmountMatch = data.match(/^dep_amount_(\w+)_(\d+)$/);
      if (depAmountMatch) {
        await ctx.answerCbQuery("⏳ Создаю инвойс...");
        return createDepositInvoice(ctx, depAmountMatch[1], parseInt(depAmountMatch[2]));
      }

      const checkPayMatch = data.match(/^check_pay_(.+)$/);
      if (checkPayMatch) {
        return checkPayment(ctx, checkPayMatch[1]);
      }

      if (data.startsWith("withdraw_")) {
        const currency = data.replace("withdraw_", "");
        return handleWithdrawCurrency(ctx, currency);
      }

      if (data === "admin_panel") {
        await ctx.answerCbQuery();
        return handleAdmin(ctx);
      }
      if (data === "admin_users") {
        return handleAdminUsers(ctx);
      }

      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error("Callback error:", err.message);
      try {
        await ctx.answerCbQuery("❌ Ошибка. Попробуй снова.");
      } catch (_) {}
    }
  });

  bot.on("text", async (ctx) => {
    const userId = ctx.from!.id;
    const text = ctx.message.text;

    const pending = pendingInputs.get(userId);
    if (pending) {
      if (pending.type === "roulette_number" && pending.data) {
        const num = parseInt(text);
        if (isNaN(num) || num < 0 || num > 36) {
          return ctx.reply("❌ Введи число от 0 до 36");
        }
        pendingInputs.delete(userId);
        return playRoulette(ctx, "number", pending.data.bet, num);
      }

      if (pending.type === "dice_custom_bet") {
        const bet = parseFloat(text);
        if (isNaN(bet) || bet <= 0) return ctx.reply("❌ Введи корректную сумму");
        pendingInputs.delete(userId);
        const mode = pending.data?.mode || "solo";
        if (mode === "solo") return playDiceSolo(ctx, bet);
        else return createDiceMultiRoom(ctx, bet);
      }

      if (pending.type === "slots_custom_bet") {
        const bet = parseFloat(text);
        if (isNaN(bet) || bet <= 0) return ctx.reply("❌ Введи корректную сумму");
        pendingInputs.delete(userId);
        return playSlots(ctx, bet);
      }

      if (pending.type === "cf_custom_bet") {
        const bet = parseFloat(text);
        if (isNaN(bet) || bet <= 0) return ctx.reply("❌ Введи корректную сумму");
        pendingInputs.delete(userId);
        const { mode, choice } = pending.data || {};
        if (mode === "solo") return playCoinflipSolo(ctx, choice, bet);
        else return createCoinflipMultiRoom(ctx, choice, bet);
      }
    }
  });

  bot.catch((err: any) => {
    console.error("Bot error:", err.message);
  });

  return bot;
}
