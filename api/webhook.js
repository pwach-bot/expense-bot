export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(200).send('ok')
    }

    const body = req.body

    if (!body || !body.events) {
      return res.status(200).end()
    }

    const event = body.events[0]

    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text

      // 🔹 parse function
      function parseText(text) {
        const parts = text.trim().split(" ")

        let amount = 0
        let currency = "USD"

        if (parts.length === 1) return { note: text, amount: 0, currency }

        const last = parts[parts.length - 1].toLowerCase()

        // detect currency
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

      // 🔹 basic validation
      if (!amount || isNaN(amount)) {
        await reply(event.replyToken, "กรุณาพิมพ์แบบ: coffee 5 usd")
        return res.status(200).end()
      }

      const replyText = `🔥 NEW CODE: ${note} ${amount} ${currency}`

      await reply(event.replyToken, replyText)
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
      messages: [
        {
          type: "text",
          text
        }
      ]
    })
  })
}
