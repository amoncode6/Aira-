const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage || userMessage.trim() === '') {
    return res.status(400).json({ reply: 'Please enter a message.' });
  }

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: `You are Aira, an AI assistant created by Amon. You are friendly, smart, and always helpful. You speak casually like a real friend, and refer to yourself as "I".`
          },
          {
            role: 'user',
            content: userMessage
          }
        ]
      })
    });

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || 'No response received.';
    res.json({ reply });
  } catch (err) {
    console.error('Groq API error:', err);
    res.status(500).json({ reply: 'Oops, Groq went wrong.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Groq chatbot running on http://localhost:${PORT}`);
});
