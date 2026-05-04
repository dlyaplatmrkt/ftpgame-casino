import { createBot } from "./bot";
import { getPendingInvoices, updateTransactionStatus, updateBalance, getUserById } from "./db/queries";
import { getInvoice } from "./utils/crypto";
import { config } from "./config";

async function checkPendingPayments(bot: any) {
  try {
    const pending = await getPendingInvoices();
    for (const tx of pending) {
      if (!tx.invoice_id) continue;
      try {
        const invoice = await getInvoice(tx.invoice_id);
        if (invoice?.status === "paid") {
          const updated = await updateTransactionStatus(tx.invoice_id, "completed");
          if (updated) {
            await updateBalance(tx.user_id, Number(tx.amount));
            const user = await getUserById(tx.user_id);
            try {
              await bot.telegram.sendMessage(
                tx.user_id,
                `✅ <b>Оплата подтверждена!</b>\n\n` +
                `💰 Зачислено: <b>+${Number(tx.amount).toFixed(2)} 🪙</b>\n` +
                `💵 Баланс: <b>${Number(user?.balance || 0).toFixed(2)} 🪙</b>\n\n` +
                `Удачной игры! 🎰`,
                { parse_mode: "HTML" }
              );
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  } catch (err: any) {
    console.error("Payment check error:", err.message);
  }
}

async function main() {
  console.log("🚀 Starting FTP GAME Bot...");
  console.log(`📌 Admin ID: ${config.ADMIN_ID}`);
  console.log(`🎮 Project: ${config.PROJECT_NAME}`);

  const bot = await createBot();

  setInterval(() => checkPendingPayments(bot), 30000);

  process.once("SIGINT", () => {
    console.log("Stopping bot...");
    bot.stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    console.log("Stopping bot...");
    bot.stop("SIGTERM");
  });

  await bot.launch();
  console.log("✅ FTP GAME Bot is running!");
  console.log(`🎲 Games: DICE, Slots, Coinflip, Roulette`);
  console.log(`💰 Payments: CryptoBot (TON, BTC, ETH, USDT)`);
  console.log(`👥 Referral system: active`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
