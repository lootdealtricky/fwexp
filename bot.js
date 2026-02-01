import 'dotenv/config'
import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage } from "telegram/events/index.js"
import axios from "axios"

/* ---------- CONFIG ---------- */
const apiId = Number(process.env.API_ID)
const apiHash = process.env.API_HASH
const stringSession = new StringSession(process.env.STRING_SESSION || "")

const SOURCE_IDS = process.env.SOURCE_IDS.split(",").map(x => x.trim())
const TARGET_ID = process.env.TARGET_ID

/* ---------- CLIENT ---------- */
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

/* ---------- URL EXTRACT ---------- */
function extractUrls(text) {
  return text.match(/https?:\/\/[^\s]+/gi) || []
}

/* ---------- URL UNSHORT ---------- */
async function unshortUrl(url) {
  try {
    const res = await axios.get(url, {
      maxRedirects: 10,
      timeout: 8000,
      validateStatus: null,
    })
    return res.request?.res?.responseUrl || url
  } catch {
    return url
  }
}

/* ---------- MEESHO CHECK ---------- */
async function containsMeesho(urls) {
  for (const url of urls) {
    const finalUrl = await unshortUrl(url)
    console.log("🔗 Final URL:", finalUrl)

    if (finalUrl.toLowerCase().includes("meesho.com")) {
      return true
    }
  }
  return false
}

/* ---------- START ---------- */
async function start() {
  await client.start({
    phoneNumber: async () => process.env.PHONE || "",
    phoneCode: async () => "",
    password: async () => "",
    onError: err => console.log(err),
  })

  console.log("✅ USERBOT STARTED")
  console.log("🔐 SAVE THIS STRING SESSION:")
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

    /* ❌ CANCEL IF ANY MEESHO LINK (EVEN SHORT) */
    if (urls.length > 0) {
      const blocked = await containsMeesho(urls)
      if (blocked) {
        console.log("⛔ SKIPPED (Meesho detected)")
        return
      }
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
      console.error("❌ Send Error:", e.message)
    }

  }, new NewMessage({}))
}

start()
