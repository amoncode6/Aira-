const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Replace with your own MongoDB connection string or .env
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://linmaximilian1:9wWaGsACoCmPvfXG@aira.fxres0b.mongodb.net/?retryWrites=true&w=majority&appName=Aira';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Schema and model
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

// Chat API
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
        messages: [{
          role: 'system',
          content: `You are Aira, an AI assistant created by Amon. You're friendly, helpful, and casual. Speak like a real friend.`
        }]
      });
    }

    // Add user message to history
    chat.messages.push({ role: 'user', content: userMessage });

    // Send to Groq
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
    const reply = data.choices?.[0]?.message?.content?.trim() || 'No response from Groq.';

    // Add assistant reply to history
    chat.messages.push({ role: 'assistant', content: reply });

    // Limit message history
    if (chat.messages.length > 30) {
      chat.messages = chat.messages.slice(-30);
    }

    await chat.save();

    res.json({ reply });
  } catch (err) {
    console.error('❌ Chat error:', err);
    res.status(500).json({ reply: 'Oops, something went wrong.' });
  }
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
