import axios from "axios";
import { config } from "../config";

const api = axios.create({
  baseURL: config.CRYPTOBOT_API,
  headers: { "Crypto-Pay-API-Token": config.CRYPTOBOT_TOKEN },
  timeout: 15000,
});

export interface Invoice {
  invoice_id: string;
  status: string;
  hash: string;
  asset: string;
  amount: string;
  pay_url: string;
  bot_invoice_url: string;
  mini_app_invoice_url: string;
  description: string;
  created_at: string;
  paid_at?: string;
  paid_anonymously?: boolean;
}

export async function createInvoice(
  asset: string,
  amountUsd: number,
  description: string,
  payload: string
): Promise<Invoice> {
  let body: any;

  if (asset === "USDT") {
    body = {
      asset: "USDT",
      amount: amountUsd.toString(),
      description,
      payload,
      paid_btn_name: "callback",
      paid_btn_url: `https://t.me/${process.env.BOT_USERNAME || "ftpgame_bot"}`,
    };
  } else {
    body = {
      currency_type: "fiat",
      fiat: "USD",
      accepted_assets: asset,
      amount: amountUsd.toString(),
      description,
      payload,
      paid_btn_name: "callback",
      paid_btn_url: `https://t.me/${process.env.BOT_USERNAME || "ftpgame_bot"}`,
    };
  }

  const res = await api.post("/createInvoice", body);

  if (!res.data.ok) {
    const errName = res.data.error?.name || "CryptoBot error";
    if (errName.includes("CURRENCY_INVALID") || errName.includes("fiat")) {
      const fallback = await api.post("/createInvoice", {
        asset: "USDT",
        amount: amountUsd.toString(),
        description,
        payload,
        paid_btn_name: "callback",
        paid_btn_url: `https://t.me/${process.env.BOT_USERNAME || "ftpgame_bot"}`,
      });
      if (!fallback.data.ok) throw new Error(fallback.data.error?.name || "CryptoBot error");
      return fallback.data.result;
    }
    throw new Error(errName);
  }

  return res.data.result;
}

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  const res = await api.post("/getInvoices", {
    invoice_ids: invoiceId.toString(),
  });
  if (!res.data.ok) return null;
  const items = res.data.result?.items || [];
  return items[0] || null;
}

export async function transfer(
  userId: number,
  asset: string,
  amount: string,
  spendId: string,
  comment: string
): Promise<boolean> {
  const res = await api.post("/transfer", {
    user_id: userId,
    asset,
    amount,
    spend_id: spendId,
    comment,
  });
  return res.data.ok === true;
}

export async function getBalance(): Promise<Record<string, string>> {
  const res = await api.post("/getBalance");
  if (!res.data.ok) return {};
  const result: Record<string, string> = {};
  for (const b of res.data.result || []) {
    result[b.currency_code] = b.available;
  }
  return result;
}
