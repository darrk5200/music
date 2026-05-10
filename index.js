const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { Player } = require('discord-player');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Create player instance
client.player = new Player(client);
client.commands = new Collection();

// Command Builder Class
class CommandBuilder {
    constructor(name, description) {
        this.name = name;
        this.description = description;
        this.options = [];
    }

    addStringOption(option) {
        this.options.push({
            type: 3, // STRING type
            name: option.name,
            description: option.description,
            required: option.required || false
        });
        return this;
    }

    execute(fn) {
        this.run = fn;
        return this;
    }

    build() {
        return {
            name: this.name,
            description: this.description,
            options: this.options,
            execute: this.run
        };
    }
}

// Define Commands

// !play command
const playCommand = new CommandBuilder('play', 'Play a song from YouTube')
    .addStringOption({
        name: 'query',
        description: 'YouTube URL or song name',
        required: true
    })
    .execute(async (message, args) => {
        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ Please provide a song name or URL!');
        }

        if (!message.member.voice.channel) {
            return message.reply('❌ You need to be in a voice channel!');
        }

        try {
            // Search for the track
            const searchResult = await client.player.search(query, {
                requestedBy: message.author
            });

            if (!searchResult || !searchResult.tracks.length) {
                return message.reply('❌ No results found!');
            }

            // Create or get queue
            const queue = client.player.nodes.create(message.guild, {
                metadata: {
                    channel: message.channel,
                    client: message.guild.members.me,
                    requestedBy: message.author
                },
                spotifyBridge: false,
                volume: 100,
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 300000,
                leaveOnEnd: true,
                leaveOnEndCooldown: 300000,
            });

            // Connect to voice channel
            if (!queue.connection) {
                await queue.connect(message.member.voice.channel);
            }

            // Add track to queue
            const track = searchResult.tracks[0];
            queue.addTrack(track);

            if (!queue.node.isPlaying()) {
                await queue.node.play();
                message.reply(`🎵 Now playing: **${track.title}**`);
            } else {
                message.reply(`✅ Added to queue: **${track.title}**`);
            }

        } catch (error) {
            console.error(error);
            message.reply('❌ An error occurred while trying to play the song!');
        }
    });

// !queue command
const queueCommand = new CommandBuilder('queue', 'Display the current music queue')
    .execute(async (message, args) => {
        const queue = client.player.nodes.get(message.guild.id);
        
        if (!queue || !queue.tracks.size) {
            return message.reply('❌ The queue is empty!');
        }

        const tracks = queue.tracks.map((track, i) => {
            return `${i + 1}. **${track.title}** - ${track.duration}`;
        });

        const currentTrack = queue.currentTrack;
        const embed = {
            color: 0x0099ff,
            title: 'Music Queue',
            description: currentTrack ? `**Now Playing:** ${currentTrack.title}\n\n**Up Next:**\n${tracks.slice(0, 10).join('\n')}` : `**Up Next:**\n${tracks.slice(0, 10).join('\n')}`,
            footer: { text: `${queue.tracks.size} songs in queue | Page 1/${Math.ceil(queue.tracks.size / 10)}` }
        };

        message.reply({ embeds: [embed] });
    });

// !skip command
const skipCommand = new CommandBuilder('skip', 'Skip the current song')
    .execute(async (message, args) => {
        const queue = client.player.nodes.get(message.guild.id);
        
        if (!queue || !queue.node.isPlaying()) {
            return message.reply('❌ No music is currently playing!');
        }

        if (!message.member.voice.channel) {
            return message.reply('❌ You need to be in a voice channel!');
        }

        const currentTrack = queue.currentTrack;
        queue.node.skip();
        message.reply(`⏭️ Skipped: **${currentTrack.title}**`);
    });

// !pause command
const pauseCommand = new CommandBuilder('pause', 'Pause the current song')
    .execute(async (message, args) => {
        const queue = client.player.nodes.get(message.guild.id);
        
        if (!queue || !queue.node.isPlaying()) {
            return message.reply('❌ No music is currently playing!');
        }

        if (!message.member.voice.channel) {
            return message.reply('❌ You need to be in a voice channel!');
        }

        queue.node.setPaused(true);
        message.reply('⏸️ Music paused! Use `!resume` to continue.');
    });

// !resume command
const resumeCommand = new CommandBuilder('resume', 'Resume the paused song')
    .execute(async (message, args) => {
        const queue = client.player.nodes.get(message.guild.id);
        
        if (!queue || !queue.node.isPlaying()) {
            return message.reply('❌ No music is currently playing!');
        }

        if (!message.member.voice.channel) {
            return message.reply('❌ You need to be in a voice channel!');
        }

        queue.node.setPaused(false);
        message.reply('▶️ Music resumed!');
    });

// Register commands
client.commands.set('play', playCommand.build());
client.commands.set('queue', queueCommand.build());
client.commands.set('skip', skipCommand.build());
client.commands.set('pause', pauseCommand.build());
client.commands.set('resume', resumeCommand.build());

// Message handler
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(error);
        message.reply('❌ There was an error executing that command!');
    }
});

// Event handlers
client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log('🎵 Music Bot is ready!');
    console.log('Commands: !play, !queue, !skip, !pause, !resume');
});

client.player.events.on('error', (queue, error) => {
    console.error(`Player error: ${error.message}`);
    queue.metadata.channel.send('❌ An error occurred while playing!');
});

client.player.events.on('playerStart', (queue, track) => {
    queue.metadata.channel.send(`🎵 Now playing: **${track.title}**`);
});

client.player.events.on('playerFinish', (queue, track) => {
    // Automatically plays next song
});

client.player.events.on('emptyChannel', (queue) => {
    queue.metadata.channel.send('👋 Disconnected because the voice channel is empty!');
});

// Login to Discord
const TOKEN = process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE';
client.login(TOKEN);
