import { Markup } from "telegraf";

export const mainMenu = Markup.keyboard([
  ["🎮 Играть", "👤 Кабинет"],
  ["💰 Пополнить", "💸 Вывести"],
  ["👥 Рефералы", "🏆 Топ игроков"],
  ["📊 История", "ℹ️ Помощь"],
]).resize();

export const backMenu = Markup.keyboard([["🔙 Главное меню"]]).resize();

export const gamesMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback("🎲 DICE", "game_dice"),
    Markup.button.callback("🎰 Слоты", "game_slots"),
  ],
  [
    Markup.button.callback("🪙 Монетка", "game_coinflip"),
    Markup.button.callback("🎡 Рулетка", "game_roulette"),
  ],
  [Markup.button.callback("🔙 Назад", "back_main")],
]);

export function diceBetMenu(mode: "solo" | "multi") {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🪙 1", `dice_bet_${mode}_1`),
      Markup.button.callback("🪙 5", `dice_bet_${mode}_5`),
      Markup.button.callback("🪙 10", `dice_bet_${mode}_10`),
    ],
    [
      Markup.button.callback("🪙 25", `dice_bet_${mode}_25`),
      Markup.button.callback("🪙 50", `dice_bet_${mode}_50`),
      Markup.button.callback("🪙 100", `dice_bet_${mode}_100`),
    ],
    [
      Markup.button.callback("✏️ Своя сумма", `dice_bet_${mode}_custom`),
    ],
    [Markup.button.callback("🔙 Назад", "game_dice")],
  ]);
}

export function slotsBetMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🪙 1", "slots_bet_1"),
      Markup.button.callback("🪙 5", "slots_bet_5"),
      Markup.button.callback("🪙 10", "slots_bet_10"),
    ],
    [
      Markup.button.callback("🪙 25", "slots_bet_25"),
      Markup.button.callback("🪙 50", "slots_bet_50"),
      Markup.button.callback("🪙 100", "slots_bet_100"),
    ],
    [Markup.button.callback("✏️ Своя сумма", "slots_bet_custom")],
    [Markup.button.callback("🔙 Назад", "game_slots")],
  ]);
}

export function coinflipMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🦅 Орёл (Solo)", "coinflip_solo_heads"),
      Markup.button.callback("🦁 Решка (Solo)", "coinflip_solo_tails"),
    ],
    [Markup.button.callback("👥 Создать комнату", "coinflip_multi")],
    [Markup.button.callback("🔙 Назад", "back_games")],
  ]);
}

export function coinflipBetMenu(choice: string, mode: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🪙 1", `cf_bet_${mode}_${choice}_1`),
      Markup.button.callback("🪙 5", `cf_bet_${mode}_${choice}_5`),
      Markup.button.callback("🪙 10", `cf_bet_${mode}_${choice}_10`),
    ],
    [
      Markup.button.callback("🪙 25", `cf_bet_${mode}_${choice}_25`),
      Markup.button.callback("🪙 50", `cf_bet_${mode}_${choice}_50`),
      Markup.button.callback("🪙 100", `cf_bet_${mode}_${choice}_100`),
    ],
    [Markup.button.callback("✏️ Своя сумма", `cf_bet_${mode}_${choice}_custom`)],
    [Markup.button.callback("🔙 Назад", "game_coinflip")],
  ]);
}

export function rouletteBetMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🔴 Красное ×2", "roulette_red"),
      Markup.button.callback("⚫ Чёрное ×2", "roulette_black"),
    ],
    [
      Markup.button.callback("🟢 Зеро ×14", "roulette_green"),
      Markup.button.callback("🔢 Число ×36", "roulette_number"),
    ],
    [Markup.button.callback("🔙 Назад", "back_games")],
  ]);
}

export function rouletteSizeBetMenu(type: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🪙 1", `rou_bet_${type}_1`),
      Markup.button.callback("🪙 5", `rou_bet_${type}_5`),
      Markup.button.callback("🪙 10", `rou_bet_${type}_10`),
    ],
    [
      Markup.button.callback("🪙 25", `rou_bet_${type}_25`),
      Markup.button.callback("🪙 50", `rou_bet_${type}_50`),
      Markup.button.callback("🪙 100", `rou_bet_${type}_100`),
    ],
    [Markup.button.callback("✏️ Своя сумма", `rou_bet_${type}_custom`)],
    [Markup.button.callback("🔙 Назад", "game_roulette")],
  ]);
}

export function depositMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("💎 TON", "deposit_TON"),
      Markup.button.callback("₿ BTC", "deposit_BTC"),
    ],
    [
      Markup.button.callback("⬡ ETH", "deposit_ETH"),
      Markup.button.callback("💵 USDT", "deposit_USDT"),
    ],
    [Markup.button.callback("🔙 Назад", "back_main")],
  ]);
}

export function diceRoomsList(rooms: any[]) {
  const buttons = rooms.map((r) =>
    [Markup.button.callback(`🎲 Комната #${r.id} — 🪙 ${r.bet}`, `join_dice_${r.id}`)]
  );
  buttons.push([Markup.button.callback("🔙 Назад", "game_dice")]);
  return Markup.inlineKeyboard(buttons);
}

export function coinflipRoomsList(rooms: any[]) {
  const choiceEmoji = (c: string) => c === "heads" ? "🦅" : "🦁";
  const buttons = rooms.map((r) =>
    [Markup.button.callback(`${choiceEmoji(r.choice)} Комната #${r.id} — 🪙 ${r.bet}`, `join_cf_${r.id}`)]
  );
  buttons.push([Markup.button.callback("🔙 Назад", "game_coinflip")],);
  return Markup.inlineKeyboard(buttons);
}
