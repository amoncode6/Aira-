const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

// Chat endpoint
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

    // Add user message
    chat.messages.push({ role: 'user', content: userMessage });

    // Call Groq
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: chat.messages
      })
    });

    const data = await groqRes.json();

    // Log the response
    console.log('🟢 Groq API response:', JSON.stringify(data, null, 2));

    if (!data || !data.choices || !data.choices[0]?.message?.content) {
      console.error('❌ Invalid Groq response:', data);
      return res.status(500).json({ reply: 'Groq returned no valid reply.' });
    }

    const reply = data.choices[0].message.content.trim();

    // Add assistant reply
    chat.messages.push({ role: 'assistant', content: reply });

    // Trim history
    if (chat.messages.length > 30) {
      chat.messages = chat.messages.slice(-30);
    }

    await chat.save();

    res.json({ reply });

  } catch (err) {
    console.error('❌ Chat error:', err);
    res.status(500).json({ reply: `Oops, something went wrong: ${err.message}` });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
