import { google } from "googleapis"

let pending = {}

const expenseCategories = [
  "อาหาร",
  "เดินทาง",
  "ช้อปปิ้ง",
  "ค่าใช้จ่ายประจำ",
  "อื่นๆ"
]

const incomeCategories = [
  "เงินเดือน",
  "โบนัส",
  "อื่นๆ"
]

// 🔹 FX convert
async function convertToUSD(amount, currency) {
  if (currency === "USD") return amount

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD")
    const data = await res.json()

    const rate = data.rates[currency]
    if (!rate) return amount

    return amount / rate
  } catch (err) {
    console.error("FX ERROR:", err)
    return amount
  }
}

// 🔹 append to sheet
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
        data.direction,
        data.amount,
        data.currency,
        usd,
        data.category,
        data.direction,
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

    if (!event || !event.source) {
      return res.status(200).end()
    }

    const userId = event.source.userId

    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text.trim()

      // 🔹 STEP 1: category selection
      if (pending[userId]) {
        const index = parseInt(userText) - 1

        const data = pending[userId]

        const categories =
          data.direction === "expense"
            ? expenseCategories
            : incomeCategories

        if (index >= 0 && index < categories.length) {
          const category = categories[index]

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

          const label =
            data.direction === "expense"
              ? "บันทึกค่าใช้จ่าย"
              : "บันทึกรายรับ"

          const replyText =
            `${label} ${displayAmount} (${category} - ${cleanNote})`

          await reply(event.replyToken, replyText)
          return res.status(200).end()
        }
      }

      // 🔹 STEP 2: parse
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

      const parsed = parseText(userText)

      if (!parsed.amount || isNaN(parsed.amount)) {
        await reply(event.replyToken, "พิมพ์แบบนี้: coffee -5 หรือ salary 3000")
        return res.status(200).end()
      }

      const direction = parsed.amount > 0 ? "income" : "expense"

      const absAmount = Math.abs(parsed.amount)

      pending[userId] = {
        note: parsed.note,
        amount: absAmount,
        currency: parsed.currency,
        direction
      }

      const categories =
        direction === "expense"
          ? expenseCategories
          : incomeCategories

      let menu = "เลือกหมวด:\n"
      categories.forEach((c, i) => {
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
