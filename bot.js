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

const TARGET_ID = process.env.TARGET_ID

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
        "User-Agent":
          "Mozilla/5.0",
      },
    })

    return (
      response.request?.res?.responseUrl ||
      url
    )

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

/* ========= STRONG MEESHO DETECTION ========= */

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

    const finalUrl =
      expanded.toLowerCase() +
      " " +
      decoded.toLowerCase()

    console.log("🔗 Checking:", finalUrl)

    for (const pattern of patterns) {

      if (finalUrl.includes(pattern)) {

        console.log("⛔ Meesho Detected")

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

      let text = msg.text || ""

      const hash = generateHash(
        chatId + "_" + msg.id
      )

      if (processedMessages.has(hash)) {

        console.log("⚠️ Duplicate skipped")

        return
      }

      processedMessages.add(hash)

      const urls = extractUrls(text)

      /* ========= SKIP MEESHO ========= */

      if (
        urls.length &&
        await containsMeesho(urls)
      ) {

        console.log("⛔ Skipped Meesho")

        return
      }

      text = replaceText(text)

      /* ========= RANDOM DELAY ========= */

      await sleep(
        Math.floor(Math.random() * 3000)
      )

      /* ========= MEDIA ========= */

      if (msg.media) {

        console.log("📥 Downloading media")

        const filePath =
          await client.downloadMedia(
            msg.media,
            {
              workers: 1,
            }
          )

        console.log(
          "📤 Re-uploading media"
        )

        await client.sendFile(
          TARGET_ID,
          {
            file: filePath,
            caption: text || "",
            forceDocument: false,
          }
        )

        /* cleanup */

        if (
          filePath &&
          fs.existsSync(filePath)
        ) {

          fs.unlinkSync(filePath)
        }

      } else {

        /* ========= TEXT ========= */

        if (text.trim()) {

          await client.sendMessage(
            TARGET_ID,
            {
              message: text,
            }
          )
        }
      }

      console.log("✅ Posted Successfully")

    } catch (e) {

      console.error(
        "❌ ERROR:",
        e.message
      )

      /* FLOOD WAIT */

      if (
        e.errorMessage?.includes(
          "FLOOD_WAIT"
        )
      ) {

        console.log(
          "⏳ Flood wait triggered"
        )
      }
    }

  }, new NewMessage({}))
}

/* ========= KEEP ALIVE ========= */

function startServer() {

  const PORT =
    process.env.PORT || 10000

  http
    .createServer((req, res) => {

      res.writeHead(200)

      res.end("Bot Running")
    })
    .listen(PORT, () => {

      console.log(
        "🌐 Server Running:",
        PORT
      )
    })
}

/* ========= RUN ========= */

startBot()
startServer()
