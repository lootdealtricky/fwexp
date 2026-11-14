import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage } from "telegram/events/index.js"
import axios from "axios"
import http from "http"
import fs from "fs"
import path from "path"
import crypto from "crypto"

/* ========= ENV ========= */

const apiId = Number(process.env.API_ID)
const apiHash = process.env.API_HASH
const stringSession = new StringSession(process.env.STRING_SESSION)

if (!apiId || !apiHash || !process.env.STRING_SESSION) {
  throw new Error("Missing ENV variables")
}

const SOURCE_IDS = process.env.SOURCE_IDS
  .split(",")
  .map(x => x.trim())

const DEFAULT_TARGET_ID = process.env.TARGET_ID
const FLIPKART_TARGET_ID = "-1006239883508"
const FLIPKART_SOURCE_ID = "-1001276984126"

console.log("📌 Configured Source IDs:", SOURCE_IDS)
console.log("📌 Default Target ID:", DEFAULT_TARGET_ID)

/* ========= CLIENT ========= */

const client = new TelegramClient(
  stringSession,
  apiId,
  apiHash,
  {
    connectionRetries: 10,
  }
)

/* ========= CACHE ========= */

const processedMessages = new Set()

/* ========= TEXT REPLACER ========= */

function replaceText(text = "") {
  const oldBlock =
    /#Meesho[\s\S]*?Lootdealtricky\.in\/url\/channels/gi

  const newBlock = `#Flipkart
#Amazon
#Myntra

🔥 BEST DEALS DAILY 🔥

🙏 SUPPORT US:
👉 @LOOTDEALTRICKY
`
  return text.replace(oldBlock, newBlock)
}

/* ========= URL EXTRACT ========= */

function extractUrls(text = "") {
  return text.match(/https?:\/\/[^\s]+/gi) || []
}

/* ========= EXPAND URL ========= */

async function expandUrl(url) {
  try {
    const response = await axios.get(url, {
      maxRedirects: 10,
      timeout: 10000,
      validateStatus: null,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    })
    return response.request?.res?.responseUrl || url
  } catch {
    return url
  }
}

/* ========= DECODE URL ========= */

function decodeUrl(url) {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

/* ========= MEESHO DETECTION ========= */

async function containsMeesho(urls) {
  const patterns = [
    "meesho.com",
    "msho.in",
    "meesho.io",
    "meesho",
  ]

  for (const url of urls) {
    const expanded = await expandUrl(url)
    const decoded = decodeUrl(expanded)
    const finalUrl = expanded.toLowerCase() + " " + decoded.toLowerCase()

    for (const pattern of patterns) {
      if (finalUrl.includes(pattern)) {
        return true
      }
    }
  }
  return false
}

/* ========= FLIPKART SHORT URL CHECKER ========= */

async function checkFlipkartShortUrl(chatId, urls) {
  if (chatId !== FLIPKART_SOURCE_ID) return true

  for (const url of urls) {
    if (url.includes("cuttli.in") || url.includes("cutt.ly") || url.includes("amzn.to") || url.length < 35) {
      const expanded = await expandUrl(url)
      const decoded = decodeUrl(expanded).toLowerCase()

      console.log("🔍 Unshortened URL Check:", decoded)

      if (decoded.includes("flipkart.com") || decoded.includes("fkrt.it")) {
        return true
      }
    }
  }
  return false
}

/* ========= HASH ========= */

function generateHash(text) {
  return crypto
    .createHash("md5")
    .update(text)
    .digest("hex")
}

/* ========= SAFE DELAY ========= */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/* ========= MAIN ========= */

async function startBot() {
  await client.start({
    onError: err => console.log("Telegram Error:", err),
  })

  console.log("✅ USERBOT STARTED & LISTENING FOR MESSAGES...")

  client.addEventHandler(async (event) => {
    try {
      const msg = event.message
      if (!msg) return

      const chatId = String(event.chatId)
      console.log(`📩 New message received from Chat ID: ${chatId}`)

      if (msg.out || msg.action) return

      if (!SOURCE_IDS.includes(chatId)) {
        // अगर आईडी मैच नहीं होगी तो यहाँ दिखेगा ताकि आपको पता चल सके कि किस चैनल से मैसेज आ रहा है
        console.log(`❌ Ignored: Chat ID ${chatId} is not in SOURCE_IDS`)
        return
      }

      let text = msg.text || msg.message || ""
      const hash = generateHash(chatId + "_" + msg.id)

      if (processedMessages.has(hash)) {
        console.log("⚠️ Duplicate skipped")
        return
      }

      processedMessages.add(hash)
      const urls = extractUrls(text)

      /* ==========================================================
         SCENARIO A: FLIPKART / CUTT.LY SYSTEM FOR -1001276984126
         ========================================================== */
      if (chatId === FLIPKART_SOURCE_ID) {
        console.log("🎯 Processing Flipkart source channel message...")
        if (urls.length === 0) {
          console.log("⛔ Skipped: No URLs found in post.")
          return
        }

        const isValidFlipkart = await checkFlipkartShortUrl(chatId, urls)
        if (!isValidFlipkart) {
          console.log("⛔ Skipped: Short URL did not resolve to Flipkart.")
          return
        }

        await sleep(Math.floor(Math.random() * 2000))

        if (msg.media) {
          console.log("📥 Downloading media for Flipkart target...")
          const filePath = await client.downloadMedia(msg.media, { workers: 1 })
          console.log("📤 Sending media to Flipkart target...")

          await client.sendFile(FLIPKART_TARGET_ID, {
            file: filePath,
            caption: text || "",
          })

          if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } else {
          if (text.trim()) {
            await client.sendMessage(FLIPKART_TARGET_ID, { message: text })
          }
        }

        console.log("✅ Flipkart Post Sent Successfully!")
        return
      }

      /* ==========================================================
         SCENARIO B: NORMAL / MEESHO SYSTEM FOR OTHER SOURCES
         ========================================================== */
      console.log("🎯 Processing other source channel message...")

      if (urls.length && await containsMeesho(urls)) {
        console.log("⛔ Skipped Meesho")
        return
      }

      text = replaceText(text)
      await sleep(Math.floor(Math.random() * 2000))

      if (msg.media) {
        console.log("📥 Downloading media for default target...")
        const filePath = await client.downloadMedia(msg.media, { workers: 1 })
        console.log("📤 Sending media to default target...")

        await client.sendFile(DEFAULT_TARGET_ID, {
          file: filePath,
          caption: text || "",
        })

        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } else {
        if (text.trim()) {
          await client.sendMessage(DEFAULT_TARGET_ID, { message: text })
        }
      }

      console.log("✅ Normal Post Posted Successfully!")

    } catch (e) {
      console.error("❌ ERROR inside event handler:", e.message)
    }
  }, new NewMessage({}))
}

/* ========= KEEP ALIVE ========= */

function startServer() {
  const PORT = process.env.PORT || 10000
  http
    .createServer((req, res) => {
      res.writeHead(200)
      res.end("Bot Running")
    })
    .listen(PORT, () => {
      console.log("🌐 Server Running on port:", PORT)
    })
}

/* ========= RUN ========= */

startBot()
startServer()
