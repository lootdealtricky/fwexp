import 'dotenv/config'
import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage } from "telegram/events/index.js"

const apiId = Number(process.env.API_ID)
const apiHash = process.env.API_HASH
const stringSession = new StringSession(process.env.STRING_SESSION || "")

const SOURCE_IDS = process.env.SOURCE_IDS.split(",").map(x => x.trim())
const TARGET_ID = process.env.TARGET_ID

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
})

/* ---------- TEXT REPLACER ---------- */
function replaceText(text) {
  const oldBlock = /#Meesho[\s\S]*?Lootdealtricky\.in\/url\/channels/i

  const newBlock = `#Meesho
#Flipkart
#Myntra


     SUPPORT NEEDED ❗

🙏ADD YOUR FRIENDS & RELATIVES ON  👉 @LOOTDEALTRICKY 👈 CHANNEL

Search @Lootdealtricky in Telegram App
`

  return text.replace(oldBlock, newBlock)
}

/* ---------- URL FILTER ---------- */
function extractUrls(text) {
  return text.match(/https?:\/\/[^\s]+/g) || []
}

function shouldSkip(urls) {
  if (urls.length === 0) return false
  return urls.every(u => u.includes("meesho.com"))
}

/* ---------- START ---------- */
async function start() {
  await client.start({
    phoneNumber: async () => process.env.PHONE,
    password: async () => "",
    phoneCode: async () => "",
    onError: err => console.log(err),
  })

  console.log("✅ Userbot Started")

  console.log("🔑 STRING SESSION (save this):")
  console.log(client.session.save())

  client.addEventHandler(async (event) => {
    const msg = event.message
    if (!msg || !msg.peerId) return

    const chatId = msg.peerId.channelId
      ? `-100${msg.peerId.channelId}`
      : null

    if (!SOURCE_IDS.includes(chatId)) return

    let text = msg.text || ""
    const urls = extractUrls(text)

    if (shouldSkip(urls)) {
      console.log("⏭️ Skipped (only meesho.com)")
      return
    }

    if (text) text = replaceText(text)

    try {
      if (msg.media) {
        await client.sendFile(TARGET_ID, {
          file: msg.media,
          caption: text || undefined,
        })
      } else {
        await client.sendMessage(TARGET_ID, { message: text })
      }

      console.log("✅ Forwarded")
    } catch (e) {
      console.error("❌ Send failed:", e.message)
    }

  }, new NewMessage({}))

}

start()
