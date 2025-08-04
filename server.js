const express = require('express');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

const app = express();

// Serve frontend from public/
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // built-in body parser

// Setup OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// POST endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const userMessage = req.body.message || '';
    if (!userMessage) return res.status(400).json({ reply: 'Message is required.' });

    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: userMessage }],
    });

    const reply = completion.data.choices[0].message.content.trim();
    res.json({ reply });
  } catch (error) {
    console.error('❌ OpenAI API error:', error.message || error);
    res.status(500).json({ reply: 'Sorry, I had a problem. Try again later.' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
