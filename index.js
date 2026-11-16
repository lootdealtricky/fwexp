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
  console.error("❌ Missing API_ID, API_HASH or STRING_SESSION variables!")
}

const rawSources = process.env.SOURCE_IDS || "-1001276984126"
const SOURCE_IDS = rawSources.split(",").map(x => x.trim())
const TARGET_ID = process.env.TARGET_ID || "-1006239883508"

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

/* ========= ADVANCED MULTI-REDIRECT URL EXPANDER ========= */

async function expandUrl(url) {
  let currentUrl = url
  try {
    for (let i = 0; i < 5; i++) {
      const response = await axios.get(currentUrl, {
        maxRedirects: 0, // हम खुद रीडायरेक्ट ट्रैक करेंगे ताकि सारे बीच के लिंक्स पकड़ में आएँ
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      })

      const redirectUrl = response.headers.location
      if (!redirectUrl) {
        break // आगे कोई रीडायरेक्ट नहीं है
      }

      // अगर रीडायरेक्ट रिलेटिव यूआरएल है तो उसे पूर्ण यूआरएल बनाएँ
      if (redirectUrl.startsWith("http")) {
        currentUrl = redirectUrl
      } else {
        const parsed = new URL(currentUrl)
        currentUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`
      }
    }
  } catch (err) {
    // अगर axios को 3xx पर एरर आए तो response.headers.location से अगला यूआरएल निकालें
    if (err.response && err.response.headers && err.response.headers.location) {
      const loc = err.response.headers.location
      if (loc.startsWith("http")) {
        currentUrl = loc
      } else {
        try {
          const parsed = new URL(currentUrl)
          currentUrl = `${parsed.protocol}//${parsed.host}${loc}`
        } catch {}
      }
    }
  }
  return currentUrl
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
    // सभी शॉर्टनर्स या छोटे लिंक्स को चेक करेगा
    if (url.includes("cuttli.in") || url.includes("cutt.ly") || url.includes("amzn.to") || url.length < 35) {
      console.log("🔗 Unshortening short URL:", url)
      const expanded = await expandUrl(url)
      const decoded = decodeUrl(expanded).toLowerCase()

      console.log("🔍 Final Resolved URL:", decoded)

      // जाँच करें कि अंत में फ्लिपकार्ट आया या नहीं
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
      console.log(`📩 Incoming message detected from Chat ID: ${chatId}`)

      if (!SOURCE_IDS.includes(chatId)) {
        return 
      }

      console.log(`🎯 Match! Processing message from target source...`)

      if (msg.out || msg.action) return

      let text = msg.text || msg.message || ""
      const hash = generateHash(chatId + "_" + msg.id)

      if (processedMessages.has(hash)) {
        console.log("⚠️ Duplicate skipped")
        return
      }

      processedMessages.add(hash)
      const urls = extractUrls(text)

      console.log("🔗 Extracted URLs:", urls)

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
