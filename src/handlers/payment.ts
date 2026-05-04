import { Context } from "telegraf";
import { getUserById, updateBalance, createTransaction, updateTransactionStatus } from "../db/queries";
import { createInvoice, getInvoice, transfer } from "../utils/crypto";
import { depositMenu } from "../utils/keyboards";
import { config } from "../config";
import { formatBalance } from "../utils/levels";

export async function handleDeposit(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("Сначала напиши /start");

  const text =
    `💰 <b>Пополнение баланса</b>\n\n` +
    `Баланс: <b>${formatBalance(user.balance)} 🪙</b>\n\n` +
    `Выбери валюту — сумма будет в USD (1$ = 1 🪙):`;

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: depositMenu().reply_markup,
    }).catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: depositMenu().reply_markup }));
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: depositMenu().reply_markup });
  }
}

export async function handleDepositCurrency(ctx: Context, currency: string) {
  await ctx.answerCbQuery();
  const user = await getUserById(ctx.from!.id);
  if (!user) return;

  const text =
    `💰 <b>Пополнение через ${currency}</b>\n\n` +
    `Выбери сумму в USD:`;

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💵 $5", callback_data: `dep_amount_${currency}_5` },
          { text: "💵 $10", callback_data: `dep_amount_${currency}_10` },
          { text: "💵 $25", callback_data: `dep_amount_${currency}_25` },
        ],
        [
          { text: "💵 $50", callback_data: `dep_amount_${currency}_50` },
          { text: "💵 $100", callback_data: `dep_amount_${currency}_100` },
          { text: "💵 $500", callback_data: `dep_amount_${currency}_500` },
        ],
        [{ text: "🔙 Назад", callback_data: "open_deposit" }],
      ],
    },
  }).catch(() => ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💵 $5", callback_data: `dep_amount_${currency}_5` },
          { text: "💵 $10", callback_data: `dep_amount_${currency}_10` },
          { text: "💵 $25", callback_data: `dep_amount_${currency}_25` },
        ],
        [
          { text: "💵 $50", callback_data: `dep_amount_${currency}_50` },
          { text: "💵 $100", callback_data: `dep_amount_${currency}_100` },
          { text: "💵 $500", callback_data: `dep_amount_${currency}_500` },
        ],
        [{ text: "🔙 Назад", callback_data: "open_deposit" }],
      ],
    },
  }));
}

export async function createDepositInvoice(ctx: Context, currency: string, amountUsd: number) {
  if (ctx.callbackQuery) await ctx.answerCbQuery("⏳ Создаю инвойс...");

  const userId = ctx.from!.id;
  const user = await getUserById(userId);
  if (!user) return;

  if (amountUsd < config.MIN_DEPOSIT) {
    return ctx.reply(`Минимальная сумма: $${config.MIN_DEPOSIT}`);
  }

  let invoice: any;
  try {
    invoice = await createInvoice(
      currency,
      amountUsd,
      `FTP GAME — пополнение $${amountUsd}`,
      `dep_${userId}_${amountUsd}_${Date.now()}`
    );
  } catch (err: any) {
    return ctx.reply(
      `❌ Ошибка создания платежа: ${err.message}\n\nПоддержка: ${config.SUPPORT}`
    );
  }

  await createTransaction(userId, "deposit", amountUsd, currency, invoice.invoice_id.toString(), "pending");

  const payUrl = invoice.bot_invoice_url || invoice.mini_app_invoice_url || invoice.pay_url;

  await ctx.reply(
    `✅ <b>Инвойс создан</b>\n\n` +
    `💵 Сумма: <b>$${amountUsd} → ${amountUsd} 🪙</b>\n` +
    `💳 Валюта: ${currency}\n` +
    `⏰ Действует: 1 час\n\n` +
    `После оплаты нажми <b>«Проверить»</b>\n` +
    `ID: <code>${invoice.invoice_id}</code>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Оплатить", url: payUrl }],
          [{ text: "✅ Проверить оплату", callback_data: `check_pay_${invoice.invoice_id}` }],
          [{ text: "🔙 Главное меню", callback_data: "back_main" }],
        ],
      },
    }
  );
}

export async function checkPayment(ctx: Context, invoiceId: string) {
  await ctx.answerCbQuery("⏳ Проверяю...");
  const userId = ctx.from!.id;

  let invoice: any;
  try {
    invoice = await getInvoice(invoiceId);
  } catch (err) {
    return ctx.reply(`❌ Ошибка проверки. Поддержка: ${config.SUPPORT}`);
  }

  if (!invoice) {
    return ctx.reply(`❌ Инвойс не найден. Поддержка: ${config.SUPPORT}`);
  }

  if (invoice.status === "paid") {
    // updateTransactionStatus only updates if status = 'pending' — prevents double crediting
    const updated = await updateTransactionStatus(invoiceId, "completed");
    if (updated) {
      const amount = parseFloat(updated.amount);
      await updateBalance(userId, amount);
      const user = await getUserById(userId);

      await ctx.editMessageText(
        `✅ <b>Оплата подтверждена!</b>\n\n` +
        `💰 Зачислено: <b>+${formatBalance(amount)} 🪙</b>\n` +
        `💵 Баланс: <b>${formatBalance(user?.balance || 0)} 🪙</b>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎮 Играть", callback_data: "back_games" }],
              [{ text: "👤 Кабинет", callback_data: "back_cabinet" }],
            ],
          },
        }
      ).catch(() =>
        ctx.reply(
          `✅ <b>Зачислено +${formatBalance(amount)} 🪙</b>\n💵 Баланс: ${formatBalance(user?.balance || 0)} 🪙`,
          { parse_mode: "HTML" }
        )
      );
    } else {
      // Already credited
      await ctx.answerCbQuery("✅ Уже зачислено");
      const user = await getUserById(userId);
      await ctx.reply(
        `✅ Оплата уже была зачислена ранее.\n💵 Баланс: <b>${formatBalance(user?.balance || 0)} 🪙</b>`,
        { parse_mode: "HTML" }
      );
    }
  } else if (invoice.status === "active") {
    const payUrl = invoice.bot_invoice_url || invoice.mini_app_invoice_url || invoice.pay_url;
    await ctx.reply(
      `⏳ <b>Оплата не поступила</b>\n\nПодожди 1–2 минуты и проверь снова.\nПоддержка: ${config.SUPPORT}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Проверить снова", callback_data: `check_pay_${invoiceId}` }],
            [{ text: "💳 Оплатить", url: payUrl }],
          ],
        },
      }
    );
  } else {
    await ctx.reply(
      `❌ Инвойс истёк или отменён.\n\nСоздай новый платёж.`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "💰 Пополнить снова", callback_data: "open_deposit" }]],
        },
      }
    );
  }
}

export async function handleWithdraw(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("Сначала напиши /start");

  const text =
    `💸 <b>Вывод средств</b>\n\n` +
    `Баланс: <b>${formatBalance(user.balance)} 🪙</b>\n` +
    `Минимум: ${config.MIN_WITHDRAW} 🪙\n\n` +
    `Выбери валюту:`;

  if (user.balance < config.MIN_WITHDRAW) {
    const errText =
      `❌ <b>Недостаточно средств</b>\n\n` +
      `Баланс: ${formatBalance(user.balance)} 🪙\n` +
      `Минимум: ${config.MIN_WITHDRAW} 🪙`;
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(errText, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "💰 Пополнить", callback_data: "open_deposit" }]] },
      }).catch(() => ctx.reply(errText, { parse_mode: "HTML" }));
    }
    return ctx.reply(errText, { parse_mode: "HTML" });
  }

  const keyboard = {
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
  };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

export async function handleWithdrawCurrency(ctx: Context, currency: string) {
  await ctx.answerCbQuery();
  const user = await getUserById(ctx.from!.id);
  if (!user) return;

  if (user.balance < config.MIN_WITHDRAW) {
    return ctx.editMessageText(
      `❌ Недостаточно средств. Баланс: ${formatBalance(user.balance)} 🪙`,
      { reply_markup: { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "open_withdraw" }]] } }
    ).catch(() => ctx.reply(`❌ Недостаточно средств.`));
  }

  const max = Math.floor(user.balance);
  const amounts = [10, 25, 50, 100].filter(a => a <= max);

  const rows: any[][] = [];
  const row: any[] = [];
  for (const a of amounts) {
    row.push({ text: `${a} 🪙`, callback_data: `wd_amount_${currency}_${a}` });
    if (row.length === 3) { rows.push([...row]); row.length = 0; }
  }
  if (row.length > 0) rows.push([...row]);

  if (max > 0) {
    rows.push([{ text: `💸 Всё (${formatBalance(user.balance)} 🪙)`, callback_data: `wd_amount_${currency}_${max}` }]);
  }
  rows.push([{ text: "🔙 Назад", callback_data: "open_withdraw" }]);

  await ctx.editMessageText(
    `💸 <b>Вывод ${currency}</b>\n\nБаланс: ${formatBalance(user.balance)} 🪙\n\nВыбери сумму:`,
    { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } }
  ).catch(() => ctx.reply(`💸 Выбери сумму вывода:`, { reply_markup: { inline_keyboard: rows } }));
}

export async function executeWithdrawal(ctx: Context, currency: string, amount: number) {
  await ctx.answerCbQuery("⏳ Обрабатываю...");
  const userId = ctx.from!.id;
  const user = await getUserById(userId);
  if (!user) return;

  if (user.balance < amount) {
    return ctx.reply(`❌ Недостаточно средств. Баланс: ${formatBalance(user.balance)} 🪙`);
  }

  await updateBalance(userId, -amount);
  const spendId = `wd_${userId}_${amount}_${Date.now()}`;

  try {
    const ok = await transfer(
      userId,
      currency,
      amount.toString(),
      spendId,
      `FTP GAME — вывод ${amount} 🪙`
    );

    if (ok) {
      await createTransaction(userId, "withdrawal", -amount, currency, spendId, "completed");
      const updated = await getUserById(userId);
      await ctx.reply(
        `✅ <b>Вывод выполнен!</b>\n\n` +
        `💸 Отправлено: <b>${formatBalance(amount)} ${currency}</b>\n` +
        `💵 Остаток: <b>${formatBalance(updated?.balance || 0)} 🪙</b>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Главное меню", callback_data: "back_main" }]],
          },
        }
      );
    } else {
      // Refund on failure
      await updateBalance(userId, amount);
      await ctx.reply(
        `❌ Не удалось выполнить вывод.\n\nСредства возвращены. Обратись в поддержку: ${config.SUPPORT}`
      );
    }
  } catch (err: any) {
    await updateBalance(userId, amount);
    await ctx.reply(
      `❌ Ошибка вывода: ${err.message}\n\nСредства возвращены. Поддержка: ${config.SUPPORT}`
    );
  }
}
