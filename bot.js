import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage } from "telegram/events/index.js"
import axios from "axios"
import http from "http"
import fs from "fs"
import path from "path"
import crypto from "crypto"

/* ========= ENV (Safe Fallbacks Added) ========= */

const apiId = Number(process.env.API_ID)
const apiHash = process.env.API_HASH
const stringSession = new StringSession(process.env.STRING_SESSION || "")

if (!apiId || !apiHash || !process.env.STRING_SESSION) {
  console.error("❌ Missing API_ID, API_HASH or STRING_SESSION variables!")
}

// अगर Render पर SOURCE_IDS नहीं मिला तो यह अपने आप यह डिफ़ॉल्ट आईडी ले लेगा
const rawSources = process.env.SOURCE_IDS || "-1001276984126"
const SOURCE_IDS = rawSources.split(",").map(x => x.trim())

// अगर Render पर TARGET_ID नहीं मिला तो यह @ekconverter15bot या -1006239883508 पर भेजेगा
const TARGET_ID = process.env.TARGET_ID || "-1003803600664"

console.log("📌 Configured Source IDs:", SOURCE_IDS)
console.log("📌 Target ID:", TARGET_ID)

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

/* ========= FLIPKART SHORT URL CHECKER ========= */

async function checkFlipkartShortUrl(urls) {
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

  console.log("✅ USERBOT STARTED & LISTENING FOR FLIPKART POSTS...")

  client.addEventHandler(async (event) => {
    try {
      const msg = event.message
      if (!msg) return

      const chatId = String(event.chatId)

      if (!SOURCE_IDS.includes(chatId)) {
        return 
      }

      console.log(`📩 Message received from Source ID: ${chatId}`)

      if (msg.out || msg.action) return

      let text = msg.text || msg.message || ""
      const hash = generateHash(chatId + "_" + msg.id)

      if (processedMessages.has(hash)) {
        console.log("⚠️ Duplicate skipped")
        return
      }

      processedMessages.add(hash)
      const urls = extractUrls(text)

      if (urls.length === 0) {
        console.log("⛔ Skipped: No URLs found in post.")
        return
      }

      const isValidFlipkart = await checkFlipkartShortUrl(urls)
      if (!isValidFlipkart) {
        console.log("⛔ Skipped: Short URL did not resolve to Flipkart.")
        return
      }

      await sleep(Math.floor(Math.random() * 2000))

      if (msg.media) {
        console.log("📥 Downloading media...")
        const filePath = await client.downloadMedia(msg.media, { workers: 1 })
        console.log("📤 Sending media to target...")

        await client.sendFile(TARGET_ID, {
          file: filePath,
          caption: text || "",
        })

        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } else {
        if (text.trim()) {
          await client.sendMessage(TARGET_ID, { message: text })
        }
      }

      console.log("✅ Flipkart Post Sent Successfully!")

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
