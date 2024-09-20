require("dotenv").config();
const {
  SlashCommandBuilder,
  ButtonStyle,
  ButtonBuilder,
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
} = require("discord.js");
const { NodeSSH } = require("node-ssh");
const axios = require("axios");
const { RateLimiterMemory } = require("rate-limiter-flexible");

// Environment variables
const {
  DISCORD_TOKEN2,
  SSH_HOST,
  SSH_PORT,
  SSH_USERNAME,
  SSH_PASSWORD,
  WEATHER_API_KEY,
} = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const ssh = new NodeSSH();

const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
});

// Function to execute SSH commands
async function sshCommand(commands) {
  try {
    await ssh.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USERNAME,
      password: SSH_PASSWORD,
    });

    let output = "";
    let error = "";

    for (const command of commands) {
      const result = await ssh.execCommand(command);
      output += result.stdout;
      error += result.stderr;
    }

    return { output, error };
  } catch (e) {
    console.error("SSH Error:", e);
    return { output: "", error: `SSH error: ${e.message}` };
  }
}

// Slash commands handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  try {
    // Apply rate limit
    try {
      await rateLimiter.consume(interaction.user.id);
      console.log(`Rate limit check passed for user ${interaction.user.id}`);
    } catch (rateLimitExceeded) {
      console.error(
        `Rate limit exceeded for user ${interaction.user.id}: ${rateLimitExceeded}`,
      );
      await interaction.reply({
        content: "You are being rate limited. Please wait before trying again.",
        ephemeral: true,
      });
      return;
    }

    rateLimiter
      .get(interaction.user.id)
      .then((rateLimitInfo) => {
        console.log(
          `Rate limit info for user ${interaction.user.id}:`,
          rateLimitInfo,
        );
      })
      .Catch((err) => {
        console.error("Error retrieving rate limit info:", err);
      });

    if (commandName === "purge") {
      const amount = interaction.options.getInteger("amount");
      if (amount < 1) {
        await interaction.reply({
          content: "Amount must be a positive number.",
          ephemeral: true,
        });
        return;
      }

      try {
        const messages = await interaction.channel.messages.fetch({
          limit: amount + 1,
        });
        await interaction.channel.bulkDelete(messages);
        await interaction.reply({
          content: `Purged ${amount} messages.`,
          ephemeral: true,
        });
      } catch (e) {
        console.error("Error purging messages:", e);
        await interaction.reply({
          content: `Failed to purge messages: ${e.message}`,
          ephemeral: true,
        });
      }
    } else if (commandName === "projects") {
      const embed = new EmbedBuilder()
        .setTitle("Projects List")
        .setDescription("Here is a list of our projects:")
        .setColor("#0000FF")
        .addFields(
          { name: "**Work Done**", value: "work", inline: true },
          { name: "**Game Development**", value: "In progress", inline: true },
          {
            name: "**Flutter**",
            valur: "14 Sep | 2024 (Saturday)",
            inline: false,
          },
          {
            name: "**Discord Bot**",
            value: "https://github.com/isDarkLord/botfortesting",
            inline: false,
          },
          {
            name: "**Discord.js docs**",
            value: "ttps://discord.js.guide",
            inline: true,
          },
        )
        .setFooter({
          text: "This bot helps with code support, project management, and task tracking.",
        });

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "whoru") {
      const embed = new EmbedBuilder()
        .setTitle("Purpose of the bot")
        .setDescription(
          "This bot was made by dark aka Fahim and also with the help of capkut aka Prashant.",
        )
        .setColor("#00FF00")

        .setFooter({ text: "Mostly made in javascript" });

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "weather") {
      const city = interaction.options.getString("city");
      if (!city) {
        await interaction.reply({
          content: "Please provide a city name.",
          ephemeral: true,
        });
        return;
      }

      try {
        const response = await axios.get(
          `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric`,
        );
        const weatherData = response.data;
        const main = weatherData.main || {};
        const weather = weatherData.weather[0] || {};

        const embed = new EmbedBuilder()
          .setTitle(`Weather in ${city}`)
          .setDescription(`Current weather in ${city}:\n${weather.description}`)
          .setColor("#00F720")
          .addFields({
            name: "Temperature",
            value: `${main.temp}°C`,
            inline: true,
          });

        await interaction.reply({ embeds: [embed] });
      } catch (e) {
        console.error("Error fetching weather data:", e);
        await interaction.reply({
          content: `Failed to fetch weather data: ${e.message}`,
          ephemeral: true,
        });
      }
    } else if (commandName === "ssh") {
      const commandsString = interaction.options.getString("commands");
      if (!commandsString) {
        await interaction.reply({
          content: "No commands provided.",
          ephemeral: true,
        });
        return;
      }

      const commands = commandsString.split(";").map((cmd) => cmd.trim());

      // Validate commands to prevent dangerous operations
      if (
        commands.some((cmd) =>
          ["rm", "sudo", "shutdown", "reboot", "mkfs", "mkdir"].includes(
            cmd.toLowerCase(),
          ),
        )
      ) {
        await interaction.reply({
          content: "Dangerous commands are not allowed here.",
          ephemeral: true,
        });
        return;
      }

      if (commands.length === 0) {
        await interaction.reply({
          content: "No command provided.",
          ephemeral: true,
        });
        return;
      }

      try {
        const { output, error } = await sshCommand(commands);

        const formattedOutput = output ? `\`\`\`${output.trim()}\`\`\`` : "";
        const formattedError = error ? `\`\`\`${error.trim()}\`\`\`` : "";

        const messages = [formattedOutput, formattedError].filter(Boolean);
        if (messages.length === 0) {
          messages.push("No output or error from command.");
        }

        for (const msg of messages) {
          await interaction.reply({ content: msg });
        }
      } catch (e) {
        console.error("Error executing SSH command:", e);
        await interaction.reply({
          content: `An error occurred: \`\`\`${e.message}\`\`\``,
          ephemeral: true,
        });
      }
    }
  } catch (e) {
    console.error("Error handling interaction:", e);
    await interaction.reply({
      content: `An error occurred while processing your command: \`\`\`${e.message}\`\`\``,
      ephemeral: true,
    });
  }
});

client.once(Events.ClientReady, () => {
  console.log("The bot is running correctly");
});

client.login(DISCORD_TOKEN2);
