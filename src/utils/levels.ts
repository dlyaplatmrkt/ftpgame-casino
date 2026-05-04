import { LEVELS } from "../config";

export function getLevelInfo(xp: number): {
  level: number;
  name: string;
  emoji: string;
  currentXP: number;
  nextXP: number;
  progress: number;
} {
  let current = LEVELS[0];
  let next = LEVELS[1];

  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || LEVELS[i];
    }
  }

  const currentXP = xp - current.xp;
  const nextXP = next.xp - current.xp;
  const progress = next.xp === current.xp ? 100 : Math.min(100, Math.floor((currentXP / nextXP) * 100));

  return {
    level: current.level,
    name: current.name,
    emoji: current.emoji,
    currentXP,
    nextXP: next.xp === current.xp ? 0 : nextXP,
    progress,
  };
}

export function getProgressBar(progress: number, length: number = 10): string {
  const filled = Math.floor((progress / 100) * length);
  const empty = length - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

export function calcXPGain(bet: number, won: boolean): number {
  const base = Math.floor(bet * 0.1);
  const bonus = won ? Math.floor(bet * 0.2) : 0;
  return base + bonus;
}

export function formatBalance(amount: number): string {
  return amount.toFixed(2);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}
