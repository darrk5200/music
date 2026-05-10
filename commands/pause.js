const { CommandBuilder } = require('../utils/commandBuilder');

const pauseCommand = new CommandBuilder('pause', 'Pause the current song')
    .setAliases(['pa'])
    .setUsage('!pause')
    .execute(async (message, args) => {
        const queues = message.client.queues || new Map();
        const queue = queues.get(message.guild.id);
        
        if (!queue || queue.songs.length === 0) {
            return message.reply('❌ No music is currently playing!');
        }
        
        if (!message.member.voice.channel) {
            return message.reply('❌ You need to be in a voice channel to pause music!');
        }
        
        const botVoiceChannel = message.guild.members.me.voice.channel;
        if (!botVoiceChannel || botVoiceChannel.id !== message.member.voice.channel.id) {
            return message.reply('❌ You need to be in the same voice channel as the bot to pause!');
        }
        
        queue.pause();
        message.reply('⏸️ Music paused! Use `!resume` to continue playing.');
    });

module.exports = pauseCommand.build();
