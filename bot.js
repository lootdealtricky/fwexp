import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
const apiId = YOUR_API_ID; // Apna API ID yahan dalein
const apiHash = "YOUR_API_HASH"; // Apna API Hash yahan dalein
const stringSession = new StringSession("YOUR_STRING_SESSION"); // Apni session string yahan dalein

(async () => {
  console.log("Loading interactive client...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Please enter your number: "),
    password: async () => await input.text("Please enter your password: "),
    phoneCode: async () => await input.text("Please code you received: "),
    onError: (err) => console.log(err),
  });

  console.log("You should be connected now.");
  
  // Naya addition: Saari chats aur unki IDs print karne ke liye
  console.log("Fetching all dialogs/channels...");
  const dialogs = await client.getDialogs();
  for (const dialog of dialogs) {
    if (dialog.isChannel || dialog.isGroup) {
      console.log(`Name: ${dialog.title} | ID: ${dialog.id}`);
    }
  }

  // Yahan aapka baaki ka event handler / listener code aayega jo messages sunta hai
  console.log("USERBOT STARTED & LISTENING...");
})();
