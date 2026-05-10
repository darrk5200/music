const { CommandBuilder } = require('../utils/commandBuilder');

const skipCommand = new CommandBuilder('skip', 'Skip the current song')
    .setAliases(['s', 'next'])
    .setUsage('!skip')
    .execute(async (message, args) => {
        const queues = message.client.queues || new Map();
        const queue = queues.get(message.guild.id);
        
        if (!queue || queue.songs.length === 0) {
            return message.reply('❌ No music is currently playing!');
        }
        
        if (!message.member.voice.channel) {
            return message.reply('❌ You need to be in a voice channel to skip songs!');
        }
        
        const botVoiceChannel = message.guild.members.me.voice.channel;
        if (!botVoiceChannel || botVoiceChannel.id !== message.member.voice.channel.id) {
            return message.reply('❌ You need to be in the same voice channel as the bot to skip!');
        }
        
        const skippedSong = queue.songs[0];
        queue.skip();
        
        if (skippedSong) {
            message.reply(`⏭️ Skipped: **${skippedSong.title}**`);
        } else {
            message.reply('⏭️ Skipped the current song!');
        }
    });

module.exports = skipCommand.build();
