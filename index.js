const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Store queues globally
client.queues = new Map();

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
    console.log(`✅ Loaded command: ${command.name}`);
    
    // Load aliases
    if (command.aliases) {
        command.aliases.forEach(alias => {
            client.commands.set(alias, command);
        });
    }
}

// Event: Ready
client.once('ready', () => {
    console.log(`🎵 ${client.user.tag} is online!`);
    console.log(`📋 Commands loaded: ${client.commands.size}`);
    console.log('--- Available Commands ---');
    client.commands.forEach(cmd => {
        if (cmd.name && !cmd.name.startsWith('!')) {
            console.log(`!${cmd.name} - ${cmd.description}`);
        }
    });
});

// Event: Message Create
client.on('messageCreate', async (message) => {
    // Ignore bot messages and non-prefix messages
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    const command = client.commands.get(commandName);
    if (!command) return;
    
    // Cooldown check (optional)
    if (command.cooldown) {
        if (!client.cooldowns) client.cooldowns = new Map();
        const now = Date.now();
        const timestamps = client.cooldowns;
        const cooldownAmount = command.cooldown * 1000;
        
        if (timestamps.has(command.name)) {
            const expirationTime = timestamps.get(command.name) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return message.reply(`Please wait ${timeLeft.toFixed(1)} more seconds before using ${command.name}!`);
            }
        }
        
        timestamps.set(command.name, now);
        setTimeout(() => timestamps.delete(command.name), cooldownAmount);
    }
    
    // Execute command
    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(`Error executing ${command.name}:`, error);
        message.reply('❌ An error occurred while executing that command!');
    }
});

// Error handling for voice connections
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in .env file!');
    process.exit(1);
}

client.login(TOKEN);
