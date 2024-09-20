require('dotenv').config(); // Load environment variables
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Initialize the GoogleGenerativeAI instance
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const DISCORD_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '1280533796093034659';
const IGNORE_PREFIX = '!'; // Prefix to ignore

const MEMORY_FILE = path.join(__dirname, 'memory.json');

// Load or initialize memory data
let memory = {};
if (fs.existsSync(MEMORY_FILE)) {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
}

// Save memory data to a file
function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, () => {
  console.log('Bot is online!');
});

client.login(DISCORD_TOKEN);

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.channel.id !== CHANNEL_ID || message.content.startsWith(IGNORE_PREFIX)) {
    return;
  }

  try {
    const userId = message.author.id;
    const prompt = message.content;

    // Retrieve and use stored information
    const userMemory = memory[userId] || {};

    // Add context or previous information to the prompt if needed
    const fullPrompt = `User said: ${prompt}\nPrevious context: ${userMemory.context || ''}`;

    // Generate content using the Google Gemini model
    const result = await model.generateContent(fullPrompt);

    // Check if the result is in the expected format
    if (result && result.response && typeof result.response.text === 'function') {
      const responseText = await result.response.text();

      // Update user memory with new context
      userMemory.context = responseText;
      memory[userId] = userMemory;
      saveMemory();

      // Handle long responses
      const MAX_MESSAGE_LENGTH = 2000;
      if (responseText.length > MAX_MESSAGE_LENGTH) {
        for (let i = 0; i < responseText.length; i += MAX_MESSAGE_LENGTH) {
          const chunk = responseText.slice(i, i + MAX_MESSAGE_LENGTH);
          await message.reply(chunk);
        }
      } else {
        await message.reply(responseText);
      }
    } else {
      console.error('Unexpected API response format:', result);
      await message.reply('Sorry, there was an error processing your request.');
    }
  } catch (error) {
    console.error('Error generating content:', error);
    await message.reply('Sorry, there was an error generating the content.');
  }
});
