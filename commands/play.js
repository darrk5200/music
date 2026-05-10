const { CommandBuilder } = require('../utils/commandBuilder');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');

// Store queues for different guilds
const queues = new Map();

class Queue {
    constructor(guildId, voiceChannel, textChannel) {
        this.guildId = guildId;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        this.songs = [];
        this.playing = false;
        this.player = createAudioPlayer();
        this.connection = null;
        
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.playNext();
        });
        
        this.player.on('error', error => {
            console.error('Player error:', error);
            if (this.textChannel) {
                this.textChannel.send('❌ An error occurred while playing!');
            }
            this.playNext();
        });
    }
    
    async playNext() {
        if (this.songs.length === 0) {
            this.playing = false;
            if (this.connection) {
                this.connection.destroy();
                this.connection = null;
            }
            if (this.textChannel) {
                this.textChannel.send('📭 Queue is empty! Leaving voice channel.');
            }
            queues.delete(this.guildId);
            return;
        }
        
        const song = this.songs[0];
        this.playing = true;
        
        try {
            const stream = ytdl(song.url, { 
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25
            });
            
            const resource = createAudioResource(stream);
            this.player.play(resource);
            
            if (this.textChannel) {
                this.textChannel.send(`🎵 Now playing: **${song.title}**`);
            }
        } catch (error) {
            console.error('Error playing song:', error);
            if (this.textChannel) {
                this.textChannel.send(`❌ Failed to play: ${song.title}`);
            }
            this.songs.shift();
            this.playNext();
        }
    }
    
    addSong(song) {
        this.songs.push(song);
        if (!this.playing) {
            this.playNext();
        }
    }
    
    skip() {
        if (this.songs.length > 0) {
            const skipped = this.songs.shift();
            this.player.stop();
            return skipped;
        }
        return null;
    }
    
    pause() {
        this.player.pause();
    }
    
    resume() {
        this.player.unpause();
    }
    
    getQueue() {
        return this.songs;
    }
}

const playCommand = new CommandBuilder('play', 'Play a song from YouTube')
    .setAliases(['p', 'ply'])
    .setUsage('!play <song name or URL>')
    .execute(async (message, args) => {
        if (!args.length) {
            return message.reply('❌ Please provide a song name or YouTube URL!\nUsage: `!play <song name or URL>`');
        }
        
        const query = args.join(' ');
        
        // Check if user is in a voice channel
        if (!message.member.voice.channel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }
        
        let url = query;
        let title = query;
        
        // Check if it's a YouTube URL
        if (ytdl.validateURL(query)) {
            try {
                const info = await ytdl.getInfo(query);
                title = info.videoDetails.title;
                url = query;
            } catch (error) {
                return message.reply('❌ Invalid YouTube URL!');
            }
        } else {
            // Search for the song
            const searchQuery = `ytsearch:${query}`;
            try {
                const { exec } = require('child_process');
                // Note: For full search functionality, you'd need youtube-search or similar
                // For now, we'll just use the query as is and let ytdl handle it
                title = query;
                url = query;
            } catch (error) {
                return message.reply('❌ Could not find the song. Please try a YouTube URL instead.');
            }
        }
        
        // Get or create queue for this guild
        let queue = queues.get(message.guild.id);
        
        if (!queue) {
            // Create new queue
            queue = new Queue(
                message.guild.id,
                message.member.voice.channel,
                message.channel
            );
            
            // Join voice channel
            try {
                const connection = joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });
                
                queue.connection = connection;
                connection.subscribe(queue.player);
                queues.set(message.guild.id, queue);
            } catch (error) {
                console.error('Voice connection error:', error);
                return message.reply('❌ Could not join your voice channel!');
            }
        } else {
            // Check if bot is in the same voice channel as user
            const botVoiceChannel = message.guild.members.me.voice.channel;
            if (botVoiceChannel && botVoiceChannel.id !== message.member.voice.channel.id) {
                return message.reply('❌ You need to be in the same voice channel as the bot!');
            }
        }
        
        // Add song to queue
        const song = {
            title: title,
            url: url,
            requestedBy: message.author.tag
        };
        
        queue.addSong(song);
        
        if (queue.songs.length > 1) {
            message.reply(`✅ Added to queue: **${title}**\nPosition: ${queue.songs.length}`);
        }
    });

module.exports = playCommand.build();
