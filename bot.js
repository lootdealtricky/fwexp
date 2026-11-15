import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.STRING_SESSION || "");

(async () => {
  console.log("Loading client...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => "",
    password: async () => "",
    phoneCode: async () => "",
    onError: (err) => console.log(err),
  });

  console.log("You should be connected now.");
  
  // Saari chats aur unki IDs console mein print karne ke liye
  console.log("Fetching all dialogs/channels...");
  const dialogs = await client.getDialogs();
  for (const dialog of dialogs) {
    if (dialog.isChannel || dialog.isGroup) {
      console.log(`Name: ${dialog.title} | ID: ${dialog.id}`);
    }
  }

  console.log("USERBOT STARTED & LISTENING...");
})();
