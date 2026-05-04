# 🎰 FTP GAME — Telegram Casino Bot

Полноценный Telegram-казино с играми, системой уровней, рефераллами и CryptoBot оплатой.

## 🎮 Игры

- **🎲 DICE** — Solo и мультиплеер. Solo: выбрось > 3, получи ×2. Мультиплеер: создай комнату, жди соперника, кто больше выбросит — тот победил!
- **🎰 Слоты** — 3 барабана: 🍒🍋🍊🍇⭐💎. Джекпот 💎💎💎 = ×10
- **🪙 Монетка** — Solo или мультиплеер. Орёл/Решка × 2
- **🎡 Рулетка** — Красное/Чёрное × 2, Зеро × 14, Точное число × 36

## 🛠️ Технологии

- **Node.js 22** + TypeScript
- **Telegraf** — Telegram Bot Framework
- **PostgreSQL** — База данных
- **CryptoBot API** — Криптоплатежи (TON, BTC, ETH, USDT)
- **PM2** — Process Manager

## 💎 Функции

- 10 уровней (от 🌱 Новичка до 💫 GOD MODE)
- XP система
- Реферальная программа (+25 🪙 за каждого друга)
- Личный кабинет со статистикой
- История игр и транзакций
- CryptoBot депозиты и вывод
- Админ-панель
- Абсолютный рандом

## 🚀 Запуск

```bash
# Установить зависимости
pnpm install

# Разработка
pnpm dev

# Сборка
pnpm build

# Запуск
pnpm start
```

## 🔧 Переменные окружения

```env
BOT_TOKEN=your_bot_token
ADMIN_ID=your_telegram_id
DATABASE_URL=postgresql://user:pass@localhost:5432/ftpgame
CRYPTOBOT_TOKEN=your_cryptobot_token
BOT_USERNAME=your_bot_username
```

## 📦 Деплой на VPS

```bash
chmod +x deploy.sh
./deploy.sh
```

## 📞 Поддержка

@ftpvpn_support
