import { Context } from "telegraf";
import { getUserById, updateBalance, createTransaction, updateTransactionStatus } from "../db/queries";
import { createInvoice, getInvoice } from "../utils/crypto";
import { depositMenu } from "../utils/keyboards";
import { config } from "../config";
import { formatBalance } from "../utils/levels";

const DEPOSIT_RATES: Record<string, number> = {
  TON: 1,
  BTC: 1,
  ETH: 1,
  USDT: 1,
};

export async function handleDeposit(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("❌ Сначала напиши /start");

  await ctx.reply(
    `💰 <b>ПОПОЛНЕНИЕ БАЛАНСА</b>\n\n` +
    `💵 Текущий баланс: ${formatBalance(user.balance)} 🪙\n\n` +
    `Выбери криптовалюту для пополнения:\n\n` +
    `📌 Минимальный депозит: ${config.MIN_DEPOSIT} USD\n` +
    `🪙 Курс: 1 USD = 1 🪙`,
    {
      parse_mode: "HTML",
      reply_markup: depositMenu().reply_markup,
    }
  );
}

export async function handleDepositCurrency(ctx: Context, currency: string) {
  await ctx.answerCbQuery();
  const user = await getUserById(ctx.from!.id);
  if (!user) return;

  await ctx.editMessageText(
    `💰 <b>Пополнение через ${currency}</b>\n\n` +
    `Введи сумму пополнения в USD (минимум ${config.MIN_DEPOSIT} USD):\n\n` +
    `💡 Пример: <code>10</code>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "$5", callback_data: `dep_amount_${currency}_5` },
            { text: "$10", callback_data: `dep_amount_${currency}_10` },
            { text: "$25", callback_data: `dep_amount_${currency}_25` },
          ],
          [
            { text: "$50", callback_data: `dep_amount_${currency}_50` },
            { text: "$100", callback_data: `dep_amount_${currency}_100` },
            { text: "$500", callback_data: `dep_amount_${currency}_500` },
          ],
          [{ text: "🔙 Назад", callback_data: "open_deposit" }],
        ],
      },
    }
  );
}

export async function createDepositInvoice(ctx: Context, currency: string, amountUsd: number) {
  if (ctx.callbackQuery) await ctx.answerCbQuery("⏳ Создаю инвойс...");

  const userId = ctx.from!.id;
  const user = await getUserById(userId);
  if (!user) return;

  if (amountUsd < config.MIN_DEPOSIT) {
    return ctx.reply(`❌ Минимальная сумма пополнения: ${config.MIN_DEPOSIT} USD`);
  }

  let invoice: any;
  try {
    invoice = await createInvoice(
      currency,
      amountUsd.toString(),
      `Пополнение FTP GAME — ${amountUsd} USD`,
      `dep_${userId}_${amountUsd}_${Date.now()}`
    );
  } catch (err: any) {
    return ctx.reply(
      `❌ Ошибка создания инвойса: ${err.message}\n\n` +
      `Попробуй позже или обратись в поддержку: ${config.SUPPORT}`
    );
  }

  await createTransaction(userId, "deposit", amountUsd, currency, invoice.invoice_id, "pending");

  await ctx.reply(
    `💰 <b>Инвойс создан!</b>\n\n` +
    `💳 Сумма: <b>${amountUsd} ${currency}</b>\n` +
    `🪙 Будет зачислено: <b>${amountUsd} 🪙</b>\n` +
    `⏰ Действует: 1 час\n\n` +
    `После оплаты нажми кнопку "✅ Я оплатил" для проверки.\n\n` +
    `🔗 ID инвойса: <code>${invoice.invoice_id}</code>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Оплатить", url: invoice.bot_invoice_url || invoice.pay_url }],
          [{ text: "✅ Я оплатил", callback_data: `check_pay_${invoice.invoice_id}` }],
          [{ text: "🔙 Главное меню", callback_data: "back_main" }],
        ],
      },
    }
  );
}

export async function checkPayment(ctx: Context, invoiceId: string) {
  await ctx.answerCbQuery("⏳ Проверяю оплату...");
  const userId = ctx.from!.id;

  let invoice: any;
  try {
    invoice = await getInvoice(invoiceId);
  } catch (err) {
    return ctx.reply(`❌ Ошибка проверки. Попробуй позже. Поддержка: ${config.SUPPORT}`);
  }

  if (!invoice) {
    return ctx.reply("❌ Инвойс не найден. Обратись в поддержку: " + config.SUPPORT);
  }

  if (invoice.status === "paid") {
    const updated = await updateTransactionStatus(invoiceId, "completed");
    if (updated) {
      const amount = parseFloat(updated.amount);
      await updateBalance(userId, amount);
      const user = await getUserById(userId);

      await ctx.editMessageText(
        `✅ <b>Оплата подтверждена!</b>\n\n` +
        `💰 Зачислено: <b>+${formatBalance(amount)} 🪙</b>\n` +
        `💵 Баланс: <b>${formatBalance(user?.balance || 0)} 🪙</b>\n\n` +
        `Удачной игры! 🎮`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎮 Играть", callback_data: "back_games" }],
              [{ text: "👤 Кабинет", callback_data: "back_cabinet" }],
            ],
          },
        }
      );
    }
  } else if (invoice.status === "active") {
    await ctx.reply(
      `⏳ <b>Оплата ещё не поступила</b>\n\n` +
      `Если оплатил — подожди 1-2 минуты и попробуй снова.\n` +
      `Поддержка: ${config.SUPPORT}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Проверить снова", callback_data: `check_pay_${invoiceId}` }],
            [{ text: "💳 Оплатить", url: invoice.bot_invoice_url || invoice.pay_url }],
          ],
        },
      }
    );
  } else {
    await ctx.reply(
      `❌ <b>Инвойс истёк или отменён</b>\n\nСоздай новый платёж.`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 Пополнить снова", callback_data: "open_deposit" }],
          ],
        },
      }
    );
  }
}

export async function handleWithdraw(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("❌ Сначала напиши /start");

  if (user.balance < config.MIN_WITHDRAW) {
    return ctx.reply(
      `❌ <b>Недостаточно средств для вывода</b>\n\n` +
      `💵 Ваш баланс: ${formatBalance(user.balance)} 🪙\n` +
      `📌 Минимум для вывода: ${config.MIN_WITHDRAW} 🪙`,
      { parse_mode: "HTML" }
    );
  }

  await ctx.reply(
    `💸 <b>ВЫВОД СРЕДСТВ</b>\n\n` +
    `💵 Доступно: <b>${formatBalance(user.balance)} 🪙</b>\n` +
    `📌 Минимум: ${config.MIN_WITHDRAW} 🪙\n\n` +
    `Выбери криптовалюту:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💎 TON", callback_data: "withdraw_TON" },
            { text: "₿ BTC", callback_data: "withdraw_BTC" },
          ],
          [
            { text: "⬡ ETH", callback_data: "withdraw_ETH" },
            { text: "💵 USDT", callback_data: "withdraw_USDT" },
          ],
          [{ text: "🔙 Назад", callback_data: "back_main" }],
        ],
      },
    }
  );
}

export async function handleWithdrawCurrency(ctx: Context, currency: string) {
  await ctx.answerCbQuery();
  const user = await getUserById(ctx.from!.id);
  if (!user) return;

  await ctx.editMessageText(
    `💸 <b>Вывод ${currency}</b>\n\n` +
    `💵 Баланс: ${formatBalance(user.balance)} 🪙\n\n` +
    `Введи сумму вывода:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `💸 ${Math.min(10, user.balance)} 🪙`, callback_data: `wd_amount_${currency}_${Math.min(10, user.balance)}` },
            { text: `💸 ${Math.min(50, user.balance)} 🪙`, callback_data: `wd_amount_${currency}_${Math.min(50, user.balance)}` },
          ],
          [{ text: `💸 ВСЁ (${formatBalance(user.balance)} 🪙)`, callback_data: `wd_amount_${currency}_${user.balance}` }],
          [{ text: "🔙 Назад", callback_data: "open_withdraw" }],
        ],
      },
    }
  );
}
