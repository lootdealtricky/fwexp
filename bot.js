import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage } from "telegram/events/index.js"
import axios from "axios"
import http from "http"

/* ========= ENV ========= */
const apiId = Number(process.env.API_ID)
const apiHash = process.env.API_HASH
const stringSession = new StringSession(process.env.STRING_SESSION)

if (!apiId || !apiHash || !process.env.STRING_SESSION) {
  throw new Error("Missing API_ID / API_HASH / STRING_SESSION")
}

const SOURCE_IDS = process.env.SOURCE_IDS.split(",").map(x => x.trim())
const TARGET_ID = process.env.TARGET_ID

/* ========= CLIENT ========= */
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
})

/* ========= TEXT REPLACER ========= */
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

/* ========= URL UTILS ========= */
function extractUrls(text) {
  return text.match(/https?:\/\/[^\s]+/gi) || []
}

async function unshortUrl(url) {
  try {
    const r = await axios.get(url, {
      maxRedirects: 10,
      timeout: 8000,
      validateStatus: null,
    })
    return r.request?.res?.responseUrl || url
  } catch {
    return url
  }
}

async function containsMeesho(urls) {
  for (const u of urls) {
    const finalUrl = await unshortUrl(u)
    console.log("🔗 Final URL:", finalUrl)
    if (finalUrl.toLowerCase().includes("meesho.com")) return true
  }
  return false
}

/* ========= BOT ========= */
async function startBot() {
  await client.start({ onError: e => console.log(e) })
  console.log("✅ TELEGRAM USERBOT STARTED")

  client.addEventHandler(async (event) => {
    const msg = event.message
    if (!msg || msg.out) return
    if (!msg.id || msg.action) return   // service message skip

    const chatId = String(event.chatId)
    if (!SOURCE_IDS.includes(chatId)) return

    let text = msg.text || ""
    const urls = extractUrls(text)

    if (urls.length && await containsMeesho(urls)) {
      console.log("⛔ SKIPPED (Meesho detected)")
      return
    }

    if (text) text = replaceText(text)

    try {
      if (msg.media) {
        // ✅ SAFEST WAY
        await client.forwardMessages(TARGET_ID, {
          fromPeer: event.chatId,
          messages: [msg.id],
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

/* ========= DUMMY SERVER (RENDER) ========= */
function startServer() {
  const PORT = process.env.PORT || 10000
  http.createServer((_, res) => {
    res.writeHead(200)
    res.end("Bot running")
  }).listen(PORT, () => {
    console.log("🌐 HTTP server listening on port", PORT)
  })
}

/* ========= RUN ========= */
startBot()
startServer()
