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

// पुराना/डिफ़ॉल्ट टारगेट ID (बाकी चैनल्स के लिए)
const DEFAULT_TARGET_ID = process.env.TARGET_ID

// Flipkart / Cutt.ly वाले खास चैनल के लिए नया टारगेट ID
const FLIPKART_TARGET_ID = "-1006239883508"
const FLIPKART_SOURCE_ID = "-1001276984126"

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

/* ========= TEXT REPLACER (For other sources) ========= */

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

    console.log("🔗 Checking Meesho:", finalUrl)

    for (const pattern of patterns) {
      if (finalUrl.includes(pattern)) {
        console.log("⛔ Meesho Detected")
        return true
      }
    }
  }

  return false
}

/* ========= FLIPKART SHORT URL CHECKER (-1001276984126) ========= */

async function checkFlipkartShortUrl(chatId, urls) {
  if (chatId !== FLIPKART_SOURCE_ID) return true

  for (const url of urls) {
    if (url.includes("cuttli.in") || url.includes("cutt.ly") || url.includes("amzn.to") || url.length < 35) {
      const expanded = await expandUrl(url)
      const decoded = decodeUrl(expanded).toLowerCase()

      console.log("🔍 Unshortened URL Check:", decoded)

      if (decoded.includes("flipkart.com") || decoded.includes("fkrt.it")) {
        console.log("✅ Flipkart detected in short URL! Allowed.")
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
    onError: err => console.log(err),
  })

  console.log("✅ USERBOT STARTED")

  client.addEventHandler(async (event) => {

    try {

      const msg = event.message

      if (
        !msg ||
        msg.out ||
        msg.action
      ) return

      const chatId = String(event.chatId)

      if (!SOURCE_IDS.includes(chatId))
        return

      let text = msg.text || msg.message || ""

      const hash = generateHash(
        chatId + "_" + msg.id
      )

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
        if (urls.length === 0) {
          console.log("⛔ Skipped: No URLs found in Flipkart source post.")
          return
        }

        const isValidFlipkart = await checkFlipkartShortUrl(chatId, urls)
        if (!isValidFlipkart) {
          console.log("⛔ Skipped: Short URL did not resolve to Flipkart.")
          return
        }

        // रैंडम डिले
        await sleep(Math.floor(Math.random() * 3000))

        // Copy As It Is posting to Flipkart Target
        if (msg.media) {
          console.log("📥 Downloading media for Flipkart target...")
          const filePath = await client.downloadMedia(msg.media, { workers: 1 })
          console.log("📤 Re-uploading media (As it is) to Flipkart target...")

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

        console.log("✅ Flipkart Post Sent Successfully (Copy As It Is)")
        return; // यहाँ से बाहर निकल जाओ ताकि नीचे वाला नॉर्मल कोड इसपर न चले
      }

      /* ==========================================================
         SCENARIO B: NORMAL / MEESHO SYSTEM FOR OTHER SOURCES
         ========================================================== */
      
      // SKIP MEESHO
      if (urls.length && await containsMeesho(urls)) {
        console.log("⛔ Skipped Meesho")
        return
      }

      // TEXT REPLACE
      text = replaceText(text)

      // रैंडम डिले
      await sleep(Math.floor(Math.random() * 3000))

      // Normal Media Posting
      if (msg.media) {
        console.log("📥 Downloading media for default target...")
        const filePath = await client.downloadMedia(msg.media, { workers: 1 })
        console.log("📤 Re-uploading media to default target...")

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

      console.log("✅ Normal Post Posted Successfully")

    } catch (e) {
      console.error("❌ ERROR:", e.message)

      if (e.errorMessage?.includes("FLOOD_WAIT")) {
        console.log("⏳ Flood wait triggered")
      }
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
      console.log("🌐 Server Running:", PORT)
    })
}

/* ========= RUN ========= */

startBot()
startServer()
