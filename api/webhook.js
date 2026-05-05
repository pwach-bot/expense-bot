export default async function handler(req, res) {
  const body = req.body

  if (!body.events) {
    return res.status(200).end()
  }

  const event = body.events[0]

  if (event.type === "message" && event.message.type === "text") {
    const userText = event.message.text

    const replyText = `คุณพิมพ์ว่า: ${userText}`

    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LINE_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: replyText
          }
        ]
      })
    })
  }

  res.status(200).end()
}
