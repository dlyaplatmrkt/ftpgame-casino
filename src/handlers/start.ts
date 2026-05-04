import { Context } from "telegraf";
import { getOrCreateUser, getUserById } from "../db/queries";
import { mainMenu } from "../utils/keyboards";
import { welcomeMessage } from "../utils/formatting";
import * as fs from "fs";
import * as path from "path";

export async function handleStart(ctx: Context) {
  const from = ctx.from!;
  const text = (ctx.message as any)?.text || "";
  const parts = text.split(" ");
  const param = parts[1] || "";

  let refCode: string | undefined;
  let diceRoomId: number | undefined;
  let cfRoomId: number | undefined;

  if (param.startsWith("ref_")) {
    refCode = param.replace("ref_", "");
  } else if (param.startsWith("dice_")) {
    diceRoomId = parseInt(param.replace("dice_", ""));
  } else if (param.startsWith("cf_")) {
    cfRoomId = parseInt(param.replace("cf_", ""));
  } else if (param) {
    refCode = param;
  }

  const existingUser = await getUserById(from.id);
  const isNew = !existingUser;

  const user = await getOrCreateUser(from.id, from.first_name, from.username || null, refCode);

  const avatarPath = path.join(process.cwd(), "assets", "avatar.png");
  const welcomePath = path.join(process.cwd(), "assets", "banner_welcome.png");

  const msgText = welcomeMessage(user, isNew);

  try {
    const bannerPath = fs.existsSync(welcomePath) ? welcomePath : avatarPath;
    if (fs.existsSync(bannerPath)) {
      await ctx.replyWithPhoto(
        { source: bannerPath },
        {
          caption: msgText,
          parse_mode: "HTML",
          reply_markup: mainMenu.reply_markup,
        }
      );
    } else {
      await ctx.reply(msgText, { parse_mode: "HTML", reply_markup: mainMenu.reply_markup });
    }
  } catch (_) {
    await ctx.reply(msgText, { parse_mode: "HTML", reply_markup: mainMenu.reply_markup });
  }

  if (diceRoomId) {
    const { joinDiceMultiRoom } = await import("../games/dice");
    await joinDiceMultiRoom(ctx, diceRoomId);
  }

  if (cfRoomId) {
    const { joinCoinflipMultiRoom } = await import("../games/coinflip");
    await joinCoinflipMultiRoom(ctx, cfRoomId);
  }
}
