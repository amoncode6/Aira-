const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Environment variables
const MONGO_URI = process.env.MONGO_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// MongoDB connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Mongoose schema
const chatSchema = new mongoose.Schema({
  userId: String,
  messages: [
    {
      role: String,
      content: String
    }
  ]
});
const Chat = mongoose.model('Chat', chatSchema);

// 🔁 Groq API Call Helper with Retry + Fallback
async function callGroq(messages, model = 'llama3-8b-8192', retries = 3, delay = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages })
    });

    const data = await res.json();
    console.log(`🔁 Attempt ${attempt} - Groq Response:`, data);

    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }

    const errorMsg = data?.error?.message || '';
    if (errorMsg.includes('over capacity') && attempt < retries) {
      await new Promise(r => setTimeout(r, delay * attempt));
    } else {
      break;
    }
  }

  // 🔄 Final fallback to larger model
  const fallback = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'llama3-70b-8192', messages })
  });

  const fallbackData = await fallback.json();
  console.log('🆘 Fallback response:', fallbackData);

  if (fallbackData?.choices?.[0]?.message?.content) {
    return fallbackData.choices[0].message.content.trim();
  }

  throw new Error(fallbackData?.error?.message || 'All Groq attempts failed.');
}

// 🧠 /api/chat endpoint
app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;
  const userId = req.body.userId || 'default-user';

  if (!userMessage || userMessage.trim() === '') {
    return res.status(400).json({ reply: 'Please enter a message.' });
  }

  try {
    let chat = await Chat.findOne({ userId });

    if (!chat) {
      chat = new Chat({
        userId,
        messages: [
          {
            role: 'system',
            content: `You are Aira, an AI assistant created by Amon. Be helpful, casual, and friendly.`
          }
        ]
      });
    }

    chat.messages.push({ role: 'user', content: userMessage });

    const cleaned = chat.messages.map(({ role, content }) => ({ role, content }));

    const reply = await callGroq(cleaned);

    chat.messages.push({ role: 'assistant', content: reply });

    if (chat.messages.length > 30) {
      chat.messages = chat.messages.slice(-30);
    }

    await chat.save();
    res.json({ reply });

  } catch (err) {
    console.error('❌ Chat error:', err);
    res.status(500).json({ reply: `Groq failed: ${err.message}` });
  }
});

// 🗃️ /api/history endpoint
app.get('/api/history', async (req, res) => {
  const userId = req.query.userId || 'default-user';

  try {
    const chat = await Chat.findOne({ userId });
    if (!chat) return res.json({ messages: [] });

    const filtered = chat.messages.filter(msg =>
      msg.role === 'user' || msg.role === 'assistant'
    );
    res.json({ messages: filtered });
  } catch (err) {
    console.error('❌ History error:', err);
    res.status(500).json({ messages: [] });
  }
});

// 🚀 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
