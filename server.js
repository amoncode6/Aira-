const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const axios = require('axios'); // for Replicate
require('dotenv').config();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Env Variables
const MONGO_URI = process.env.MONGO_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

// Connect MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Schema
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

// 🔁 Retry Groq API with fallback
async function callGroq(messages, model = 'llama3-8b-8192', retries = 3, delay = 1500) {
  for (let i = 1; i <= retries; i++) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages })
    });

    const data = await res.json();
    console.log(`🔁 Groq Attempt ${i}:`, data);

    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }

    const error = data?.error?.message || '';
    if (error.includes('over capacity') && i < retries) {
      await new Promise(r => setTimeout(r, delay * i));
    } else {
      break;
    }
  }

  // Fallback to bigger model
  const fallback = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'llama3-70b-8192', messages })
  });

  const fallbackData = await fallback.json();
  console.log('🆘 Fallback Groq response:', fallbackData);

  if (fallbackData?.choices?.[0]?.message?.content) {
    return fallbackData.choices[0].message.content.trim();
  }

  throw new Error(fallbackData?.error?.message || 'All Groq attempts failed.');
}

// 🧠 Chat Endpoint
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

    // ✨ Special trigger for "new chat"
    if (userMessage.toLowerCase().includes('reset_chat_now')) {
      chat.messages = chat.messages.slice(0, 1);
      await chat.save();
      return res.json({ reply: '✅ New chat started!' });
    }

    // 🖼️ Detect image generation prompt
    const lower = userMessage.toLowerCase();
    if (lower.startsWith('create ') || lower.startsWith('generate ')) {
      const prompt = userMessage.replace(/^(create|generate)\s+/i, '');
      const replicateResponse = await axios.post(
        'https://api.replicate.com/v1/predictions',
        {
          version: "eaa43976b7c8a4f8a220edb90cf2a5191cb9604d3a2e8380ab4aa2dbb1e50fdc", // SDXL 1.0
          input: { prompt }
        },
        {
          headers: {
            'Authorization': `Token ${REPLICATE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const prediction = replicateResponse.data;
      console.log('🎨 Replicate prediction started:', prediction.id);

      // Poll the status
      let outputUrl = '';
      for (let i = 0; i < 10; i++) {
        const check = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { Authorization: `Token ${REPLICATE_API_KEY}` }
        });

        if (check.data.status === 'succeeded') {
          outputUrl = check.data.output?.[0];
          break;
        } else if (check.data.status === 'failed') {
          throw new Error('Image generation failed.');
        }

        await new Promise(r => setTimeout(r, 1500));
      }

      if (outputUrl) {
        return res.json({ reply: `🖼️ Here's your image: ${outputUrl}` });
      } else {
        throw new Error('Image generation timed out.');
      }
    }

    // 💬 Normal chat
    chat.messages.push({ role: 'user', content: userMessage });
    const cleanedMessages = chat.messages.map(({ role, content }) => ({ role, content }));
    const reply = await callGroq(cleanedMessages);

    chat.messages.push({ role: 'assistant', content: reply });

    if (chat.messages.length > 30) {
      chat.messages = chat.messages.slice(-30);
    }

    await chat.save();
    res.json({ reply });

  } catch (err) {
    console.error('❌ Chat error:', err);
    res.status(500).json({ reply: `❌ Error: ${err.message}` });
  }
});

// 🗃️ Get Chat History
app.get('/api/history', async (req, res) => {
  const userId = req.query.userId || 'default-user';

  try {
    const chat = await Chat.findOne({ userId });
    if (!chat) return res.json({ messages: [] });

    const messages = chat.messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    );
    res.json({ messages });
  } catch (err) {
    console.error('❌ History error:', err);
    res.status(500).json({ messages: [] });
  }
});

// 🚀 Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
