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
  
  // Saari chats fetch karne ke liye limit: undefined taaki koi limit na rahe
  console.log("Fetching all dialogs/channels (this may take a few seconds)...");
  const dialogs = await client.getDialogs({ limit: undefined });
  
  console.log(`Total dialogs found: ${dialogs.length}`);

  for (const dialog of dialogs) {
    if (dialog.isChannel || dialog.isGroup) {
      const name = dialog.title || (dialog.entity && dialog.entity.title) || "Unknown Name";
      console.log(`Name: ${name} | ID: ${dialog.id}`);
    }
  }

  console.log("USERBOT STARTED & LISTENING...");
})();
