import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || "",
  ADMIN_ID: parseInt(process.env.ADMIN_ID || "0"),
  DATABASE_URL: process.env.DATABASE_URL || "",
  CRYPTOBOT_TOKEN: process.env.CRYPTOBOT_TOKEN || "",
  CRYPTOBOT_API: "https://pay.crypt.bot/api",
  SUPPORT: "@ftpvpn_support",
  PROJECT_NAME: "FTP GAME",
  MIN_BET: 1,
  MAX_BET: 10000,
  MIN_DEPOSIT: 1,
  MIN_WITHDRAW: 5,
  REFERRAL_BONUS: 25,
  REFERRAL_WELCOME: 10,
  COLORS: {
    PRIMARY: "#7B68EE",
    DARK: "#483D8B",
    BLUE: "#4169E1",
  },
};

export const LEVELS = [
  { level: 1, name: "🌱 Новичок",       xp: 0,       emoji: "🌱" },
  { level: 2, name: "🎮 Игрок",         xp: 500,     emoji: "🎮" },
  { level: 3, name: "🃏 Картёжник",     xp: 2000,    emoji: "🃏" },
  { level: 4, name: "💎 Профи",         xp: 5000,    emoji: "💎" },
  { level: 5, name: "🎯 Мастер",        xp: 15000,   emoji: "🎯" },
  { level: 6, name: "🔥 Чемпион",       xp: 35000,   emoji: "🔥" },
  { level: 7, name: "⚡ Легенда",        xp: 75000,   emoji: "⚡" },
  { level: 8, name: "👑 Элита",          xp: 150000,  emoji: "👑" },
  { level: 9, name: "🌟 VIP",           xp: 300000,  emoji: "🌟" },
  { level: 10, name: "💫 GOD MODE",     xp: 600000,  emoji: "💫" },
];
