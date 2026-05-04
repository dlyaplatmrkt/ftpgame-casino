import { Pool } from "pg";
import { config } from "../config";

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("Unexpected DB client error:", err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const res = await pool.query(text, params);
  return (res.rows[0] as T) || null;
}

export async function initDB(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT NOT NULL,
      balance DECIMAL(20, 2) DEFAULT 0,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE NOT NULL,
      referred_by BIGINT,
      total_games INTEGER DEFAULT 0,
      total_wins INTEGER DEFAULT 0,
      total_wagered DECIMAL(20, 2) DEFAULT 0,
      total_won DECIMAL(20, 2) DEFAULT 0,
      banned BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS game_history (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      game_type TEXT NOT NULL,
      bet DECIMAL(20, 2) NOT NULL,
      result TEXT NOT NULL,
      win_amount DECIMAL(20, 2) DEFAULT 0,
      details JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      type TEXT NOT NULL,
      amount DECIMAL(20, 2) NOT NULL,
      currency TEXT,
      invoice_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dice_rooms (
      id SERIAL PRIMARY KEY,
      creator_id BIGINT NOT NULL,
      bet DECIMAL(20, 2) NOT NULL,
      status TEXT DEFAULT 'waiting',
      player2_id BIGINT,
      creator_roll INTEGER,
      player2_roll INTEGER,
      winner_id BIGINT,
      message_id INTEGER,
      chat_id BIGINT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS coinflip_rooms (
      id SERIAL PRIMARY KEY,
      creator_id BIGINT NOT NULL,
      bet DECIMAL(20, 2) NOT NULL,
      choice TEXT NOT NULL,
      status TEXT DEFAULT 'waiting',
      player2_id BIGINT,
      result TEXT,
      winner_id BIGINT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_game_history_user_id ON game_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON transactions(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_dice_rooms_status ON dice_rooms(status);
    CREATE INDEX IF NOT EXISTS idx_coinflip_rooms_status ON coinflip_rooms(status);
  `);
  console.log("✅ Database initialized");
}
