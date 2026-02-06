import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage } from "telegram/events/index.js"
import axios from "axios"
import http from "http"

/* ========== ENV CHECK ========== */
const apiId = Number(process.env.API_ID)
const apiHash = process.env.API_HASH
const stringSession = new StringSession(process.env.STRING_SESSION)

if (!apiId || !apiHash || !process.env.STRING_SESSION) {
  throw new Error("❌ Missing API_ID / API_HASH / STRING_SESSION")
}

const SOURCE_IDS = process.env.SOURCE_IDS.split(",").map(x => x.trim())
const TARGET_ID = process.env.TARGET_ID

/* ========== TELEGRAM CLIENT ========== */
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
})

/* ========== TEXT REPLACER ========== */
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

/* ========== URL EXTRACT ========== */
function extractUrls(text) {
  return text.match(/https?:\/\/[^\s]+/gi) || []
}

/* ========== URL UNSHORT ========== */
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

/* ========== MEESHO CHECK ========== */
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

/* ========== TELEGRAM BOT ========== */
async function startBot() {
  await client.start({ onError: err => console.log(err) })
  console.log("✅ TELEGRAM USERBOT STARTED")

  client.addEventHandler(async (event) => {
    const msg = event.message
    if (!msg || !msg.peerId) return

    const chatId = msg.peerId.channelId
      ? `-100${msg.peerId.channelId}`
      : null

    if (!SOURCE_IDS.includes(chatId)) return

    let text = msg.text || ""
    const urls = extractUrls(text)

    // ❌ Skip if any Meesho link (even short)
    if (urls.length && await containsMeesho(urls)) {
      console.log("⛔ SKIPPED (Meesho detected)")
      return
    }

    if (text) text = replaceText(text)

    try {
      if (msg.media) {
        // ✅ SAFE METHOD: direct forward (NO re-upload)
        await client.forwardMessages(TARGET_ID, {
          messages: [msg.id],
          fromPeer: msg.peerId,
        })
      } else {
        // text-only with replacement
        await client.sendMessage(TARGET_ID, { message: text })
      }

      console.log("✅ Forwarded")

    } catch (e) {
      console.error("❌ Send Error:", e.message)
    }

  }, new NewMessage({}))
}

/* ========== DUMMY HTTP SERVER (RENDER FIX) ========== */
function startServer() {
  const PORT = process.env.PORT || 10000

  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("Telegram bot is running")
  }).listen(PORT, () => {
    console.log("🌐 HTTP server listening on port", PORT)
  })
}

/* ========== RUN ========== */
startBot()
startServer()
