const { CommandBuilder } = require('../utils/commandBuilder');

// Need to import the queues map - for simplicity, we'll recreate it
const queues = new Map();

const queueCommand = new CommandBuilder('queue', 'Display the current music queue')
    .setAliases(['q', 'list'])
    .setUsage('!queue')
    .execute(async (message, args) => {
        // This would ideally access the same queues object
        // For now, we need to make queues accessible globally
        const globalQueues = message.client.queues || new Map();
        const queue = globalQueues.get(message.guild.id);
        
        if (!queue || queue.songs.length === 0) {
            return message.reply('📭 The queue is empty! Use `!play` to add some songs.');
        }
        
        const currentSong = queue.songs[0];
        const upcomingSongs = queue.songs.slice(1, 11);
        
        let queueList = `**Now Playing:**\n🎵 ${currentSong.title} (requested by ${currentSong.requestedBy})\n\n`;
        
        if (upcomingSongs.length > 0) {
            queueList += `**Up Next (${queue.songs.length - 1} songs):**\n`;
            upcomingSongs.forEach((song, index) => {
                queueList += `${index + 1}. ${song.title} (requested by ${song.requestedBy})\n`;
            });
        } else {
            queueList += 'No more songs in queue.';
        }
        
        if (queue.songs.length > 11) {
            queueList += `\n\nAnd ${queue.songs.length - 11} more songs...`;
        }
        
        const embed = {
            color: 0x00ff00,
            title: '🎵 Music Queue',
            description: queueList,
            footer: {
                text: `Total songs: ${queue.songs.length} | Page 1/${Math.ceil(queue.songs.length / 10)}`
            },
            timestamp: new Date()
        };
        
        message.reply({ embeds: [embed] });
    });

module.exports = queueCommand.build();
