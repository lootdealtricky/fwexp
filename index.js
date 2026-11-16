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
  
  console.log("Fetching active dialogs/channels...");
  const dialogs = await client.getDialogs({ limit: undefined });

  for (const dialog of dialogs) {
    // Sirf wahi channel/group dikhao jo active hain aur jinki entity/title available hai
    if ((dialog.isChannel || dialog.isGroup) && dialog.entity && !dialog.entity.left && !dialog.entity.kicked) {
      const name = dialog.title || dialog.entity.title || "Unknown Name";
      console.log(`Active Channel Name: ${name} | ID: ${dialog.id}`);
    }
  }

  console.log("USERBOT STARTED & LISTENING...");
})();
