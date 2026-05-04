import { query, queryOne } from "./client";
import { LEVELS } from "../config";

export interface User {
  id: number;
  username: string | null;
  first_name: string;
  balance: number;
  level: number;
  xp: number;
  referral_code: string;
  referred_by: number | null;
  total_games: number;
  total_wins: number;
  total_wagered: number;
  total_won: number;
  banned: boolean;
  created_at: Date;
}

export interface Transaction {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  currency: string | null;
  invoice_id: string | null;
  status: string;
  created_at: Date;
}

export interface GameHistory {
  id: number;
  user_id: number;
  game_type: string;
  bet: number;
  result: string;
  win_amount: number;
  details: any;
  created_at: Date;
}

export interface DiceRoom {
  id: number;
  creator_id: number;
  bet: number;
  status: string;
  player2_id: number | null;
  creator_roll: number | null;
  player2_roll: number | null;
  winner_id: number | null;
  message_id: number | null;
  chat_id: number | null;
  created_at: Date;
}

export interface CoinflipRoom {
  id: number;
  creator_id: number;
  bet: number;
  choice: string;
  status: string;
  player2_id: number | null;
  result: string | null;
  winner_id: number | null;
  created_at: Date;
}

function generateRefCode(userId: number): string {
  return `ftpg${userId.toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

export async function getOrCreateUser(
  id: number,
  first_name: string,
  username: string | null,
  referralCode?: string
): Promise<User> {
  let user = await queryOne<User>("SELECT * FROM users WHERE id = $1", [id]);

  if (!user) {
    const myRef = generateRefCode(id);
    let referredBy: number | null = null;

    if (referralCode) {
      const referrer = await queryOne<User>(
        "SELECT * FROM users WHERE referral_code = $1",
        [referralCode]
      );
      if (referrer && referrer.id !== id) {
        referredBy = referrer.id;
      }
    }

    // All new users get 10 coins welcome bonus
    await query(
      `INSERT INTO users (id, first_name, username, referral_code, referred_by, balance)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [id, first_name, username, myRef, referredBy, 10]
    );

    if (referredBy) {
      // Referrer gets bonus
      await query(
        "UPDATE users SET balance = balance + $1, xp = xp + 500 WHERE id = $2",
        [25, referredBy]
      );
      await createTransaction(referredBy, "referral_bonus", 25, null, null, "completed");
    }

    user = await queryOne<User>("SELECT * FROM users WHERE id = $1", [id]);
  } else {
    await query(
      "UPDATE users SET first_name = $2, username = $3 WHERE id = $1",
      [id, first_name, username]
    );
    user = await queryOne<User>("SELECT * FROM users WHERE id = $1", [id]);
  }

  return user!;
}

export async function getUserById(id: number): Promise<User | null> {
  return queryOne<User>("SELECT * FROM users WHERE id = $1", [id]);
}

export async function updateBalance(userId: number, delta: number): Promise<void> {
  await query("UPDATE users SET balance = balance + $1 WHERE id = $2", [delta, userId]);
}

export async function addXP(userId: number, xp: number): Promise<{ leveledUp: boolean; newLevel: number }> {
  const user = await getUserById(userId);
  if (!user) return { leveledUp: false, newLevel: 1 };

  const oldLevel = user.level;
  const newXP = user.xp + xp;

  let newLevel = 1;
  for (const lvl of LEVELS) {
    if (newXP >= lvl.xp) newLevel = lvl.level;
  }

  await query("UPDATE users SET xp = $1, level = $2 WHERE id = $3", [newXP, newLevel, userId]);
  return { leveledUp: newLevel > oldLevel, newLevel };
}

export async function recordGame(
  userId: number,
  gameType: string,
  bet: number,
  result: "win" | "loss" | "draw",
  winAmount: number,
  details: any
): Promise<void> {
  await query(
    `INSERT INTO game_history (user_id, game_type, bet, result, win_amount, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, gameType, bet, result, winAmount, details]
  );
  await query(
    `UPDATE users SET
      total_games = total_games + 1,
      total_wins = total_wins + $1,
      total_wagered = total_wagered + $2,
      total_won = total_won + $3
     WHERE id = $4`,
    [result === "win" ? 1 : 0, bet, winAmount, userId]
  );
}

export async function createTransaction(
  userId: number,
  type: string,
  amount: number,
  currency: string | null,
  invoiceId: string | null,
  status: string = "pending"
): Promise<number> {
  const res = await queryOne<{ id: number }>(
    `INSERT INTO transactions (user_id, type, amount, currency, invoice_id, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, type, amount, currency, invoiceId, status]
  );
  return res?.id || 0;
}

export async function updateTransactionStatus(
  invoiceId: string,
  status: string
): Promise<Transaction | null> {
  // Only update if current status is 'pending' — prevents double crediting
  return queryOne<Transaction>(
    `UPDATE transactions SET status = $1
     WHERE invoice_id = $2 AND status = 'pending'
     RETURNING *`,
    [status, invoiceId]
  );
}

export async function getTopPlayers(limit: number = 10): Promise<User[]> {
  return query<User>("SELECT * FROM users ORDER BY balance DESC LIMIT $1", [limit]);
}

export async function getUserHistory(userId: number, limit: number = 10): Promise<GameHistory[]> {
  return query<GameHistory>(
    "SELECT * FROM game_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
}

export async function getUserTransactions(userId: number, limit: number = 10): Promise<Transaction[]> {
  return query<Transaction>(
    "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
}

export async function getPendingInvoices(): Promise<Transaction[]> {
  return query<Transaction>(
    "SELECT * FROM transactions WHERE status = 'pending' AND type = 'deposit' AND invoice_id IS NOT NULL"
  );
}

export async function getReferrals(userId: number): Promise<User[]> {
  return query<User>(
    "SELECT * FROM users WHERE referred_by = $1 ORDER BY created_at DESC",
    [userId]
  );
}

export async function getTotalStats(): Promise<{
  total_users: number;
  total_games: number;
  total_wagered: number;
}> {
  const res = await queryOne<any>(
    `SELECT COUNT(*) as total_users,
            COALESCE(SUM(total_games), 0) as total_games,
            COALESCE(SUM(total_wagered), 0) as total_wagered
     FROM users`
  );
  return {
    total_users: parseInt(res?.total_users || "0"),
    total_games: parseInt(res?.total_games || "0"),
    total_wagered: parseFloat(res?.total_wagered || "0"),
  };
}

export async function getAllUsers(): Promise<User[]> {
  return query<User>("SELECT * FROM users ORDER BY created_at DESC");
}

export async function banUser(userId: number): Promise<void> {
  await query("UPDATE users SET banned = true WHERE id = $1", [userId]);
}

export async function unbanUser(userId: number): Promise<void> {
  await query("UPDATE users SET banned = false WHERE id = $1", [userId]);
}

export async function createDiceRoom(creatorId: number, bet: number): Promise<DiceRoom> {
  return queryOne<DiceRoom>(
    `INSERT INTO dice_rooms (creator_id, bet) VALUES ($1, $2) RETURNING *`,
    [creatorId, bet]
  ) as Promise<DiceRoom>;
}

export async function getDiceRoom(id: number): Promise<DiceRoom | null> {
  return queryOne<DiceRoom>("SELECT * FROM dice_rooms WHERE id = $1", [id]);
}

export async function getWaitingDiceRooms(): Promise<DiceRoom[]> {
  return query<DiceRoom>(
    "SELECT * FROM dice_rooms WHERE status = 'waiting' ORDER BY created_at DESC LIMIT 10"
  );
}

export async function joinDiceRoom(roomId: number, playerId: number): Promise<DiceRoom | null> {
  return queryOne<DiceRoom>(
    `UPDATE dice_rooms SET status = 'playing', player2_id = $1
     WHERE id = $2 AND status = 'waiting' RETURNING *`,
    [playerId, roomId]
  );
}

export async function cancelDiceRoom(roomId: number, creatorId: number): Promise<number | null> {
  const room = await queryOne<DiceRoom>(
    "SELECT * FROM dice_rooms WHERE id = $1 AND creator_id = $2 AND status = 'waiting'",
    [roomId, creatorId]
  );
  if (!room) return null;
  await query("UPDATE dice_rooms SET status = 'cancelled' WHERE id = $1", [roomId]);
  return room.bet;
}

export async function updateDiceRoom(roomId: number, data: Partial<DiceRoom>): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    sets.push(`${k} = $${i}`);
    vals.push(v);
    i++;
  }
  vals.push(roomId);
  await query(`UPDATE dice_rooms SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function createCoinflipRoom(creatorId: number, bet: number, choice: string): Promise<CoinflipRoom> {
  return queryOne<CoinflipRoom>(
    `INSERT INTO coinflip_rooms (creator_id, bet, choice) VALUES ($1, $2, $3) RETURNING *`,
    [creatorId, bet, choice]
  ) as Promise<CoinflipRoom>;
}

export async function getWaitingCoinflipRooms(): Promise<CoinflipRoom[]> {
  return query<CoinflipRoom>(
    "SELECT * FROM coinflip_rooms WHERE status = 'waiting' ORDER BY created_at DESC LIMIT 10"
  );
}

export async function joinCoinflipRoom(roomId: number, playerId: number): Promise<CoinflipRoom | null> {
  return queryOne<CoinflipRoom>(
    `UPDATE coinflip_rooms SET status = 'playing', player2_id = $1
     WHERE id = $2 AND status = 'waiting' RETURNING *`,
    [playerId, roomId]
  );
}

export async function cancelCoinflipRoom(roomId: number, creatorId: number): Promise<number | null> {
  const room = await queryOne<CoinflipRoom>(
    "SELECT * FROM coinflip_rooms WHERE id = $1 AND creator_id = $2 AND status = 'waiting'",
    [roomId, creatorId]
  );
  if (!room) return null;
  await query("UPDATE coinflip_rooms SET status = 'cancelled' WHERE id = $1", [roomId]);
  return room.bet;
}

export async function updateCoinflipRoom(roomId: number, data: Partial<CoinflipRoom>): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    sets.push(`${k} = $${i}`);
    vals.push(v);
    i++;
  }
  vals.push(roomId);
  await query(`UPDATE coinflip_rooms SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}
