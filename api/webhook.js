import { google } from "googleapis"

let pending = {}

const expenseCategories = [
  "อาหาร",
  "เดินทาง",
  "ช้อปปิ้ง",
  "ค่าใช้จ่ายประจำ",
  "อื่นๆ"
]

// 🔹 FX convert → USD
async function convertToUSD(amount, currency) {
  if (currency === "USD") return amount

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD")
    const data = await res.json()

    const rate = data.rates[currency]

    if (!rate) return amount

    // rate = USD → currency
    return amount / rate

  } catch (err) {
    console.error("FX ERROR:", err)
    return amount
  }
}

// 🔹 append to Google Sheets
async function appendRow(data) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  })

  const sheets = google.sheets({ version: "v4", auth })

  const usd = await convertToUSD(data.amount, data.currency)

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Transactions!A:I",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        new Date().toISOString(),
        "expense",
        data.amount,
        data.currency,
        usd,
        data.category,
        "expense",
        data.note,
        new Date().toISOString().slice(0,7)
      ]]
    }
  })
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(200).send('ok')
    }

    const body = req.body
    const event = body.events?.[0]

    // 🔴 กัน crash
    if (!event || !event.source) {
      return res.status(200).end()
    }

    const userId = event.source.userId

    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text.trim()

      // 🔹 STEP 1: เลือก category
      if (pending[userId]) {
        const index = parseInt(userText) - 1

        if (index >= 0 && index < expenseCategories.length) {
          const data = pending[userId]
          const category = expenseCategories[index]

          delete pending[userId]

          await appendRow({
            ...data,
            category
          })

          const cleanNote =
            data.note.charAt(0).toUpperCase() + data.note.slice(1)

          const displayAmount =
            data.currency === "USD"
              ? `$${data.amount}`
              : `${data.amount} ${data.currency}`

          const replyText =
            `บันทึกแล้ว ${displayAmount} (${category} - ${cleanNote})`

          await reply(event.replyToken, replyText)
          return res.status(200).end()
        }
      }

      // 🔹 STEP 2: parse input
      function parseText(text) {
        const parts = text.split(" ")

        let amount = 0
        let currency = "USD"

        const last = parts[parts.length - 1].toLowerCase()

        if (["usd", "thb", "jpy", "krw", "inr"].includes(last)) {
          currency = last.toUpperCase()
          amount = parseFloat(parts[parts.length - 2])
          const note = parts.slice(0, parts.length - 2).join(" ")
          return { note, amount, currency }
        } else {
          amount = parseFloat(last)
          const note = parts.slice(0, parts.length - 1).join(" ")
          return { note, amount, currency }
        }
      }

      const { note, amount, currency } = parseText(userText)

      if (!amount || isNaN(amount)) {
        await reply(event.replyToken, "พิมพ์แบบนี้: coffee 5 usd")
        return res.status(200).end()
      }

      pending[userId] = { note, amount, currency }

      let menu = "เลือกหมวด:\n"
      expenseCategories.forEach((c, i) => {
        menu += `${i + 1}. ${c}\n`
      })

      await reply(event.replyToken, menu)
    }

    res.status(200).end()

  } catch (err) {
    console.error("ERROR:", err)
    res.status(200).end()
  }
}

// 🔹 reply helper
async function reply(replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.LINE_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  })
}
