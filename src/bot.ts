import { Telegraf } from "telegraf";
import { config } from "./config";
import { initDB } from "./db/client";
import { getUserById, getTopPlayers } from "./db/queries";
import { mainMenu, gamesMenu, slotsBetMenu } from "./utils/keyboards";
import { helpMessage, topMessage } from "./utils/formatting";
import { handleStart } from "./handlers/start";
import { handleCabinet, handleHistory, handleTransactionHistory } from "./handlers/cabinet";
import {
  handleDeposit,
  handleDepositCurrency,
  createDepositInvoice,
  checkPayment,
  handleWithdraw,
  handleWithdrawCurrency,
  executeWithdrawal,
} from "./handlers/payment";
import { handleReferral } from "./handlers/referral";
import { handleAdmin, handleAdminUsers, handleBanUser, isAdmin } from "./handlers/admin";
import {
  showDiceMenu,
  showDiceSoloBetMenu,
  playDiceSolo,
  showDiceMultiMenu,
  showDiceJoinList,
  createDiceMultiRoom,
  joinDiceMultiRoom,
  cancelDiceMultiRoom,
} from "./games/dice";
import { playSlots, showSlotsPaytable } from "./games/slots";
import {
  playCoinflipSolo,
  showCoinflipMultiMenu,
  showCoinflipJoinList,
  createCoinflipMultiRoom,
  joinCoinflipMultiRoom,
  cancelCoinflipMultiRoom,
} from "./games/coinflip";
import { showRouletteMenu, showRouletteBetSize, playRoulette } from "./games/roulette";
import { formatBalance } from "./utils/levels";

// Tracks what input we're waiting for from each user
const pendingInputs: Map<number, { type: string; data?: any }> = new Map();

export async function createBot() {
  await initDB();

  const bot = new Telegraf(config.BOT_TOKEN);

  // Ban check middleware
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      const user = await getUserById(ctx.from.id);
      if (user?.banned) {
        return ctx.reply(`🚫 Аккаунт заблокирован. Поддержка: ${config.SUPPORT}`);
      }
    }
    return next();
  });

  // ─── Commands ─────────────────────────────────────────────
  bot.command("start", handleStart);
  bot.command("help", async (ctx) => ctx.reply(helpMessage(), { parse_mode: "HTML" }));
  bot.command("admin", handleAdmin);
  bot.command("balance", async (ctx) => {
    const user = await getUserById(ctx.from!.id);
    if (!user) return ctx.reply("❌ Сначала напиши /start");
    await ctx.reply(`💵 Баланс: <b>${formatBalance(user.balance)} 🪙</b>`, { parse_mode: "HTML" });
  });
  bot.command("top", async (ctx) => {
    const players = await getTopPlayers(10);
    await ctx.reply(topMessage(players), { parse_mode: "HTML" });
  });
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
    const text = ctx.message.text.replace("/broadcast ", "").trim();
    if (!text) return;
    const { handleBroadcast } = await import("./handlers/admin");
    await handleBroadcast(ctx, text);
  });

  // ─── Reply keyboard buttons ────────────────────────────────
  bot.hears("🎮 Играть", async (ctx) => {
    await ctx.reply("🎮 <b>Выбери игру:</b>", {
      parse_mode: "HTML",
      reply_markup: gamesMenu.reply_markup,
    });
  });
  bot.hears("👤 Кабинет", handleCabinet);
  bot.hears("💰 Пополнить", handleDeposit);
  bot.hears("💸 Вывести", handleWithdraw);
  bot.hears("👥 Рефералы", handleReferral);
  bot.hears("🏆 Топ игроков", async (ctx) => {
    const players = await getTopPlayers(10);
    await ctx.reply(topMessage(players), { parse_mode: "HTML" });
  });
  bot.hears("📊 История", async (ctx) => {
    const { getUserHistory } = await import("./db/queries");
    const history = await getUserHistory(ctx.from!.id, 10);
    if (history.length === 0) return ctx.reply("📊 История пуста. Сыграй первую игру!");
    const gameEmojis: Record<string, string> = {
      dice_solo: "🎲", dice_multi: "🎲👥",
      slots: "🎰", coinflip: "🪙", coinflip_multi: "🪙👥", roulette: "🎡",
    };
    let text = `📊 <b>История игр</b>\n\n`;
    for (const g of history) {
      const emoji = gameEmojis[g.game_type] || "🎮";
      const res = g.result === "win" ? "✅" : g.result === "draw" ? "🤝" : "❌";
      text += `${emoji} ${res} ${formatBalance(g.bet)} 🪙`;
      if (g.result === "win") text += ` → +${formatBalance(g.win_amount)} 🪙`;
      text += "\n";
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });
  bot.hears("ℹ️ Помощь", async (ctx) => ctx.reply(helpMessage(), { parse_mode: "HTML" }));
  bot.hears("🔙 Главное меню", async (ctx) => {
    await ctx.reply("🏠 Главное меню", { reply_markup: mainMenu.reply_markup });
  });

  // ─── Callback queries ─────────────────────────────────────
  bot.on("callback_query", async (ctx) => {
    const data = (ctx.callbackQuery as any).data as string;
    if (!data) return ctx.answerCbQuery();

    try {
      // Navigation
      if (data === "back_main") {
        await ctx.answerCbQuery();
        return ctx.reply("🏠 Главное меню", { reply_markup: mainMenu.reply_markup });
      }
      if (data === "back_games") {
        await ctx.answerCbQuery();
        return ctx.editMessageText("🎮 <b>Выбери игру:</b>", {
          parse_mode: "HTML",
          reply_markup: gamesMenu.reply_markup,
        }).catch(() =>
          ctx.reply("🎮 <b>Выбери игру:</b>", {
            parse_mode: "HTML",
            reply_markup: gamesMenu.reply_markup,
          })
        );
      }
      if (data === "back_cabinet") {
        await ctx.answerCbQuery();
        return handleCabinet(ctx);
      }

      // Deposit
      if (data === "open_deposit") {
        return handleDeposit(ctx);
      }
      if (data === "open_withdraw") {
        return handleWithdraw(ctx);
      }
      if (data.startsWith("deposit_")) {
        const currency = data.slice(8);
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

      // Withdraw
      if (data.startsWith("withdraw_")) {
        const currency = data.slice(9);
        return handleWithdrawCurrency(ctx, currency);
      }
      const wdAmountMatch = data.match(/^wd_amount_(\w+)_(\d+(?:\.\d+)?)$/);
      if (wdAmountMatch) {
        return executeWithdrawal(ctx, wdAmountMatch[1], parseFloat(wdAmountMatch[2]));
      }

      // History
      if (data === "history_games") return handleHistory(ctx);
      if (data === "history_tx") return handleTransactionHistory(ctx);

      // Referral
      if (data === "referral_refresh") {
        await ctx.answerCbQuery();
        return handleReferral(ctx);
      }

      // Admin
      if (data === "admin_panel") {
        await ctx.answerCbQuery();
        return handleAdmin(ctx);
      }
      if (data === "admin_users") return handleAdminUsers(ctx);

      // ── DICE ────────────────────────────────────────────────
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
        const { diceBetMenu } = await import("./utils/keyboards");
        return ctx.editMessageText("🎲 <b>Создать комнату — выбери ставку:</b>", {
          parse_mode: "HTML",
          reply_markup: diceBetMenu("multi").reply_markup,
        }).catch(() =>
          ctx.reply("🎲 Выбери ставку для комнаты:", {
            reply_markup: diceBetMenu("multi").reply_markup,
          })
        );
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

      // Dice custom bet
      if (data === "dice_custom_solo") {
        await ctx.answerCbQuery();
        pendingInputs.set(ctx.from!.id, { type: "dice_custom_bet", data: { mode: "solo" } });
        return ctx.reply("✏️ Введи сумму ставки (1–10000 🪙):");
      }
      if (data === "dice_custom_multi") {
        await ctx.answerCbQuery();
        pendingInputs.set(ctx.from!.id, { type: "dice_custom_bet", data: { mode: "multi" } });
        return ctx.reply("✏️ Введи сумму ставки для комнаты (1–10000 🪙):");
      }

      // Dice room join / cancel
      const joinDiceMatch = data.match(/^join_dice_(\d+)$/);
      if (joinDiceMatch) {
        await ctx.answerCbQuery();
        return joinDiceMultiRoom(ctx, parseInt(joinDiceMatch[1]));
      }
      const cancelDiceMatch = data.match(/^dice_cancel_(\d+)$/);
      if (cancelDiceMatch) {
        return cancelDiceMultiRoom(ctx, parseInt(cancelDiceMatch[1]));
      }

      // ── SLOTS ────────────────────────────────────────────────
      if (data === "game_slots") {
        await ctx.answerCbQuery();
        return ctx.editMessageText(
          `🎰 <b>СЛОТЫ</b>\n\n` +
          `💎💎💎 = ×10 · ⭐⭐⭐ = ×5 · 3 одинак. = ×3 · 2 одинак. = ×1.5\n\n` +
          `Выбери ставку:`,
          {
            parse_mode: "HTML",
            reply_markup: slotsBetMenu().reply_markup,
          }
        ).catch(() =>
          ctx.reply("🎰 Выбери ставку:", { reply_markup: slotsBetMenu().reply_markup })
        );
      }
      const slotsBetMatch = data.match(/^slots_bet_(\d+(?:\.\d+)?)$/);
      if (slotsBetMatch) {
        await ctx.answerCbQuery("🎰 Крутим!");
        return playSlots(ctx, parseFloat(slotsBetMatch[1]));
      }
      if (data === "slots_custom") {
        await ctx.answerCbQuery();
        pendingInputs.set(ctx.from!.id, { type: "slots_custom_bet" });
        return ctx.reply("✏️ Введи сумму ставки (1–10000 🪙):");
      }
      if (data === "slots_paytable") return showSlotsPaytable(ctx);

      // ── COINFLIP ─────────────────────────────────────────────
      if (data === "game_coinflip") {
        await ctx.answerCbQuery();
        const { coinflipMenu } = await import("./utils/keyboards");
        return ctx.editMessageText(
          `🪙 <b>МОНЕТКА</b>\n\nSolo: ×2 на твою сторону\nМультиплеер: банк забирает победитель\n\nВыбери режим:`,
          {
            parse_mode: "HTML",
            reply_markup: coinflipMenu().reply_markup,
          }
        ).catch(() =>
          ctx.reply("🪙 Выбери режим:", {
            parse_mode: "HTML",
            reply_markup: coinflipMenu().reply_markup,
          })
        );
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
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🦅 Орёл", callback_data: "cf_create_heads" },
                { text: "🦁 Решка", callback_data: "cf_create_tails" },
              ],
              [{ text: "🔙 Назад", callback_data: "coinflip_multi" }],
            ],
          },
        }).catch(() => ctx.reply("🪙 Выбери сторону:"));
      }
      if (data === "cf_create_heads" || data === "cf_create_tails") {
        await ctx.answerCbQuery();
        const choice = data === "cf_create_heads" ? "heads" : "tails";
        const { coinflipBetMenu } = await import("./utils/keyboards");
        return ctx.editMessageText(
          `🪙 ${choice === "heads" ? "🦅 Орёл" : "🦁 Решка"} — выбери ставку:`,
          {
            parse_mode: "HTML",
            reply_markup: coinflipBetMenu(choice, "multi").reply_markup,
          }
        ).catch(() => ctx.reply("🪙 Выбери ставку:"));
      }
      const cfBetMatch = data.match(/^cf_bet_(solo|multi)_(heads|tails)_(\d+(?:\.\d+)?)$/);
      if (cfBetMatch) {
        const mode = cfBetMatch[1];
        const choice = cfBetMatch[2];
        const bet = parseFloat(cfBetMatch[3]);
        await ctx.answerCbQuery();
        if (mode === "solo") return playCoinflipSolo(ctx, choice, bet);
        else return createCoinflipMultiRoom(ctx, choice, bet);
      }
      // Coinflip custom bet
      const cfCustomMatch = data.match(/^cf_custom_(solo|multi)_(heads|tails)$/);
      if (cfCustomMatch) {
        await ctx.answerCbQuery();
        pendingInputs.set(ctx.from!.id, {
          type: "cf_custom_bet",
          data: { mode: cfCustomMatch[1], choice: cfCustomMatch[2] },
        });
        return ctx.reply("✏️ Введи сумму ставки (1–10000 🪙):");
      }
      // Coinflip join / cancel
      const joinCfMatch = data.match(/^join_cf_(\d+)$/);
      if (joinCfMatch) {
        await ctx.answerCbQuery();
        return joinCoinflipMultiRoom(ctx, parseInt(joinCfMatch[1]));
      }
      const cancelCfMatch = data.match(/^cf_cancel_(\d+)$/);
      if (cancelCfMatch) {
        return cancelCoinflipMultiRoom(ctx, parseInt(cancelCfMatch[1]));
      }

      // ── ROULETTE ─────────────────────────────────────────────
      if (data === "game_roulette") {
        await ctx.answerCbQuery();
        return showRouletteMenu(ctx);
      }
      const rouBetTypeMatch = data.match(/^roulette_(red|black|green|number)$/);
      if (rouBetTypeMatch) {
        await ctx.answerCbQuery();
        return showRouletteBetSize(ctx, rouBetTypeMatch[1]);
      }
      const rouBetMatch = data.match(/^rou_bet_(red|black|green|number)_(\d+(?:\.\d+)?)$/);
      if (rouBetMatch) {
        const betType = rouBetMatch[1];
        const bet = parseFloat(rouBetMatch[2]);
        if (betType === "number") {
          await ctx.answerCbQuery();
          pendingInputs.set(ctx.from!.id, { type: "roulette_number", data: { bet } });
          return ctx.reply(`🔢 Введи число от 0 до 36:\n💸 Ставка: ${bet} 🪙`);
        }
        await ctx.answerCbQuery("🎡 Запускаю!");
        return playRoulette(ctx, betType, bet);
      }
      // Roulette custom bet
      const rouCustomMatch = data.match(/^rou_custom_(red|black|green|number)$/);
      if (rouCustomMatch) {
        await ctx.answerCbQuery();
        pendingInputs.set(ctx.from!.id, {
          type: "rou_custom_bet",
          data: { betType: rouCustomMatch[1] },
        });
        return ctx.reply("✏️ Введи сумму ставки (1–10000 🪙):");
      }

      // Fallback
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error("Callback error:", err.message);
      try { await ctx.answerCbQuery("❌ Ошибка"); } catch (_) {}
    }
  });

  // ─── Text input handler ───────────────────────────────────
  bot.on("text", async (ctx) => {
    const userId = ctx.from!.id;
    const text = ctx.message.text;

    // Ignore keyboard button texts (they have their own handlers)
    const keyboardTexts = ["🎮 Играть", "👤 Кабинет", "💰 Пополнить", "💸 Вывести",
      "👥 Рефералы", "🏆 Топ игроков", "📊 История", "ℹ️ Помощь", "🔙 Главное меню"];
    if (keyboardTexts.includes(text)) return;

    const pending = pendingInputs.get(userId);
    if (!pending) return;

    if (pending.type === "roulette_number") {
      const num = parseInt(text);
      if (isNaN(num) || num < 0 || num > 36) {
        return ctx.reply("❌ Число от 0 до 36");
      }
      pendingInputs.delete(userId);
      return playRoulette(ctx, "number", pending.data.bet, num);
    }

    if (pending.type === "rou_custom_bet") {
      const bet = parseFloat(text);
      if (isNaN(bet) || bet < 1 || bet > 10000) {
        return ctx.reply("❌ Сумма от 1 до 10000 🪙");
      }
      const { betType } = pending.data || {};
      pendingInputs.delete(userId);
      if (betType === "number") {
        pendingInputs.set(userId, { type: "roulette_number", data: { bet } });
        return ctx.reply(`🔢 Введи число от 0 до 36:\n💸 Ставка: ${bet} 🪙`);
      }
      return playRoulette(ctx, betType, bet);
    }

    if (pending.type === "dice_custom_bet") {
      const bet = parseFloat(text);
      if (isNaN(bet) || bet < 1 || bet > 10000) return ctx.reply("❌ Сумма от 1 до 10000 🪙");
      pendingInputs.delete(userId);
      const mode = pending.data?.mode || "solo";
      if (mode === "solo") return playDiceSolo(ctx, bet);
      else return createDiceMultiRoom(ctx, bet);
    }

    if (pending.type === "slots_custom_bet") {
      const bet = parseFloat(text);
      if (isNaN(bet) || bet < 1 || bet > 10000) return ctx.reply("❌ Сумма от 1 до 10000 🪙");
      pendingInputs.delete(userId);
      return playSlots(ctx, bet);
    }

    if (pending.type === "cf_custom_bet") {
      const bet = parseFloat(text);
      if (isNaN(bet) || bet < 1 || bet > 10000) return ctx.reply("❌ Сумма от 1 до 10000 🪙");
      pendingInputs.delete(userId);
      const { mode, choice } = pending.data || {};
      if (mode === "solo") return playCoinflipSolo(ctx, choice, bet);
      else return createCoinflipMultiRoom(ctx, choice, bet);
    }
  });

  bot.catch((err: any) => {
    console.error("Bot error:", err.message);
  });

  return bot;
}
