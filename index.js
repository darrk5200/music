const { Client } = require('discord.js-selfbot-v13');
const client = new Client();

// Configuration
const config = {
    token: 'YOUR_DISCORD_TOKEN_HERE', // Replace with your token
    prefix: '!'
};

// Main command handler
client.on('messageCreate', async (message) => {
    if (message.author.id !== client.user.id) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'check') {
        await handleCheckCommand(message, args);
    }
});

async function handleCheckCommand(message, args) {
    if (args.length < 2) {
        return message.edit(createErrorMessage('Usage: !check <message_id> <guild_id>'));
    }

    const [messageId, guildId] = args;
    
    try {
        // Fetch the guild and channel
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return message.edit(createErrorMessage(`Guild with ID ${guildId} not found. Make sure the bot is in that guild.`));
        }

        // Get all text channels in the guild
        let targetMessage = null;
        let targetChannel = null;

        // Search for the message in all channels
        for (const channel of guild.channels.cache.values()) {
            if (channel.isText() || channel.isThread()) {
                try {
                    const fetchedMessage = await channel.messages.fetch(messageId).catch(() => null);
                    if (fetchedMessage) {
                        targetMessage = fetchedMessage;
                        targetChannel = channel;
                        break;
                    }
                } catch (error) {
                    // Skip channels we can't access
                    continue;
                }
            }
        }

        if (!targetMessage) {
            return message.edit(createErrorMessage(`Message with ID ${messageId} not found in any channel of guild ${guild.name}.`));
        }

        // Extract all information from the message
        const messageInfo = await extractMessageInfo(targetMessage);
        
        // Create formatted output
        const output = formatMessageInfo(messageInfo, targetChannel, guild);
        
        // Send the result (split if too long)
        if (output.length > 2000) {
            const chunks = splitMessage(output, 1900);
            await message.edit(chunks[0]);
            for (let i = 1; i < chunks.length; i++) {
                await message.channel.send(chunks[i]);
            }
        } else {
            await message.edit(output);
        }

    } catch (error) {
        console.error('Error:', error);
        await message.edit(createErrorMessage(`An error occurred: ${error.message}`));
    }
}

async function extractMessageInfo(message) {
    const info = {
        // Basic message info
        basic: {
            id: message.id,
            channelId: message.channelId,
            guildId: message.guildId,
            author: {
                id: message.author.id,
                username: message.author.username,
                discriminator: message.author.discriminator,
                bot: message.author.bot,
                tag: message.author.tag
            },
            content: message.content,
            createdAt: message.createdAt.toISOString(),
            editedAt: message.editedAt ? message.editedAt.toISOString() : null,
            type: message.type,
            tts: message.tts,
            pinned: message.pinned,
            url: message.url
        },

        // Embeds
        embeds: [],
        
        // Components (buttons, select menus, etc)
        components: {
            buttons: [],
            selectMenus: [],
            actionRows: []
        },
        
        // Attachments
        attachments: [],
        
        // Reactions
        reactions: [],
        
        // Stickers
        stickers: [],
        
        // Mentions
        mentions: {
            users: [],
            roles: [],
            channels: []
        }
    };

    // Extract embed information
    if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            const embedInfo = {
                type: embed.type,
                title: embed.title,
                description: embed.description,
                url: embed.url,
                timestamp: embed.timestamp,
                color: embed.color ? `#${embed.color.toString(16)}` : null,
                footer: embed.footer ? {
                    text: embed.footer.text,
                    iconURL: embed.footer.iconURL
                } : null,
                image: embed.image ? {
                    url: embed.image.url,
                    width: embed.image.width,
                    height: embed.image.height
                } : null,
                thumbnail: embed.thumbnail ? {
                    url: embed.thumbnail.url,
                    width: embed.thumbnail.width,
                    height: embed.thumbnail.height
                } : null,
                video: embed.video ? {
                    url: embed.video.url,
                    width: embed.video.width,
                    height: embed.video.height
                } : null,
                author: embed.author ? {
                    name: embed.author.name,
                    url: embed.author.url,
                    iconURL: embed.author.iconURL
                } : null,
                fields: embed.fields ? embed.fields.map(field => ({
                    name: field.name,
                    value: field.value,
                    inline: field.inline
                })) : []
            };
            info.embeds.push(embedInfo);
        }
    }

    // Extract component information (buttons, select menus, etc)
    if (message.components && message.components.length > 0) {
        for (const row of message.components) {
            const actionRow = {
                type: row.type,
                components: []
            };

            if (row.components) {
                for (const component of row.components) {
                    if (component.type === 'BUTTON') {
                        const buttonInfo = {
                            type: 'button',
                            style: component.style,
                            label: component.label,
                            customId: component.customId,
                            disabled: component.disabled,
                            emoji: component.emoji ? {
                                name: component.emoji.name,
                                id: component.emoji.id,
                                animated: component.emoji.animated
                            } : null,
                            url: component.url || null
                        };
                        info.components.buttons.push(buttonInfo);
                        actionRow.components.push(buttonInfo);
                    }
                    else if (component.type === 'SELECT_MENU') {
                        const selectInfo = {
                            type: 'select_menu',
                            customId: component.customId,
                            placeholder: component.placeholder,
                            minValues: component.minValues,
                            maxValues: component.maxValues,
                            disabled: component.disabled,
                            options: component.options ? component.options.map(opt => ({
                                label: opt.label,
                                value: opt.value,
                                description: opt.description,
                                emoji: opt.emoji ? {
                                    name: opt.emoji.name,
                                    id: opt.emoji.id
                                } : null,
                                default: opt.default
                            })) : []
                        };
                        info.components.selectMenus.push(selectInfo);
                        actionRow.components.push(selectInfo);
                    }
                    else if (component.type === 'TEXT_INPUT') {
                        const textInputInfo = {
                            type: 'text_input',
                            customId: component.customId,
                            label: component.label,
                            style: component.style,
                            placeholder: component.placeholder,
                            required: component.required,
                            value: component.value,
                            minLength: component.minLength,
                            maxLength: component.maxLength
                        };
                        actionRow.components.push(textInputInfo);
                    }
                }
            }
            info.components.actionRows.push(actionRow);
        }
    }

    // Extract attachment information
    if (message.attachments && message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
            info.attachments.push({
                id: attachment.id,
                name: attachment.name,
                url: attachment.url,
                proxyURL: attachment.proxyURL,
                size: attachment.size,
                width: attachment.width || null,
                height: attachment.height || null,
                contentType: attachment.contentType || null
            });
        }
    }

    // Extract reaction information
    if (message.reactions && message.reactions.cache.size > 0) {
        for (const reaction of message.reactions.cache.values()) {
            info.reactions.push({
                emoji: reaction.emoji.name,
                emojiId: reaction.emoji.id,
                count: reaction.count,
                me: reaction.me
            });
        }
    }

    // Extract sticker information
    if (message.stickers && message.stickers.size > 0) {
        for (const sticker of message.stickers.values()) {
            info.stickers.push({
                id: sticker.id,
                name: sticker.name,
                formatType: sticker.formatType,
                description: sticker.description || null,
                url: sticker.url || null
            });
        }
    }

    // Extract mention information
    if (message.mentions) {
        // User mentions
        if (message.mentions.users && message.mentions.users.size > 0) {
            for (const user of message.mentions.users.values()) {
                info.mentions.users.push({
                    id: user.id,
                    username: user.username,
                    discriminator: user.discriminator,
                    tag: user.tag
                });
            }
        }

        // Role mentions
        if (message.mentions.roles && message.mentions.roles.size > 0) {
            for (const role of message.mentions.roles.values()) {
                info.mentions.roles.push({
                    id: role.id,
                    name: role.name,
                    color: role.color ? `#${role.color.toString(16)}` : null
                });
            }
        }

        // Channel mentions
        if (message.mentions.channels && message.mentions.channels.size > 0) {
            for (const channel of message.mentions.channels.values()) {
                info.mentions.channels.push({
                    id: channel.id,
                    name: channel.name,
                    type: channel.type
                });
            }
        }
    }

    return info;
}

function formatMessageInfo(info, channel, guild) {
    let output = '═══════════════════════════════════\n';
    output += '📨 MESSAGE INFORMATION\n';
    output += '═══════════════════════════════════\n\n';

    // Basic Information
    output += '📌 BASIC INFO\n';
    output += '───────────────\n';
    output += `Message ID: ${info.basic.id}\n`;
    output += `Channel: #${channel.name} (${channel.id})\n`;
    output += `Guild: ${guild.name} (${guild.id})\n`;
    output += `Author: ${info.basic.author.tag}${info.basic.author.bot ? ' 🤖' : ''}\n`;
    output += `Author ID: ${info.basic.author.id}\n`;
    output += `Created: ${new Date(info.basic.createdAt).toLocaleString()}\n`;
    if (info.basic.editedAt) output += `Edited: ${new Date(info.basic.editedAt).toLocaleString()}\n`;
    if (info.basic.content) output += `Content: ${info.basic.content.substring(0, 500)}${info.basic.content.length > 500 ? '...' : ''}\n`;
    output += `Message URL: ${info.basic.url}\n\n`;

    // Embeds
    if (info.embeds.length > 0) {
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += `🎨 EMBEDS (${info.embeds.length})\n`;
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        for (let i = 0; i < info.embeds.length; i++) {
            const embed = info.embeds[i];
            output += `📦 Embed #${i + 1}\n`;
            output += `───────────────\n`;
            if (embed.title) output += `Title: ${embed.title}\n`;
            if (embed.description) output += `Description: ${embed.description.substring(0, 300)}${embed.description.length > 300 ? '...' : ''}\n`;
            if (embed.url) output += `URL: ${embed.url}\n`;
            if (embed.color) output += `Color: ${embed.color}\n`;
            if (embed.author) output += `Author: ${embed.author.name}\n`;
            if (embed.footer) output += `Footer: ${embed.footer.text}\n`;
            if (embed.thumbnail) output += `Thumbnail: ${embed.thumbnail.url}\n`;
            if (embed.image) output += `Image: ${embed.image.url}\n`;
            
            if (embed.fields && embed.fields.length > 0) {
                output += `\n📋 Fields (${embed.fields.length}):\n`;
                for (const field of embed.fields) {
                    output += `  • ${field.name}: ${field.value.substring(0, 100)}${field.value.length > 100 ? '...' : ''}\n`;
                }
            }
            output += `\n`;
        }
    }

    // Buttons
    if (info.components.buttons.length > 0) {
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += `🔘 BUTTONS (${info.components.buttons.length})\n`;
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        for (let i = 0; i < info.components.buttons.length; i++) {
            const button = info.components.buttons[i];
            output += `🎯 Button #${i + 1}\n`;
            output += `───────────────\n`;
            output += `Label: ${button.label || 'No label'}\n`;
            output += `Style: ${getButtonStyle(button.style)}\n`;
            output += `Custom ID: ${button.customId || 'N/A'}\n`;
            output += `Disabled: ${button.disabled ? 'Yes' : 'No'}\n`;
            if (button.url) output += `URL: ${button.url}\n`;
            if (button.emoji) output += `Emoji: ${button.emoji.name} ${button.emoji.id ? `(ID: ${button.emoji.id})` : ''}\n`;
            output += `\n`;
        }
    }

    // Select Menus
    if (info.components.selectMenus.length > 0) {
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += `📋 SELECT MENUS (${info.components.selectMenus.length})\n`;
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        for (let i = 0; i < info.components.selectMenus.length; i++) {
            const menu = info.components.selectMenus[i];
            output += `📌 Select Menu #${i + 1}\n`;
            output += `───────────────\n`;
            output += `Custom ID: ${menu.customId}\n`;
            output += `Placeholder: ${menu.placeholder || 'None'}\n`;
            output += `Min Values: ${menu.minValues || 1}\n`;
            output += `Max Values: ${menu.maxValues || 1}\n`;
            output += `Disabled: ${menu.disabled ? 'Yes' : 'No'}\n`;
            
            if (menu.options && menu.options.length > 0) {
                output += `\n📎 Options (${menu.options.length}):\n`;
                for (const option of menu.options) {
                    output += `  • ${option.label} (Value: ${option.value})\n`;
                    if (option.description) output += `    Description: ${option.description}\n`;
                    if (option.emoji) output += `    Emoji: ${option.emoji.name}\n`;
                    if (option.default) output += `    Default: Yes\n`;
                }
            }
            output += `\n`;
        }
    }

    // Attachments
    if (info.attachments.length > 0) {
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += `📎 ATTACHMENTS (${info.attachments.length})\n`;
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        for (const attachment of info.attachments) {
            output += `📄 ${attachment.name}\n`;
            output += `  URL: ${attachment.url}\n`;
            output += `  Size: ${(attachment.size / 1024).toFixed(2)} KB\n`;
            if (attachment.width) output += `  Dimensions: ${attachment.width}x${attachment.height}\n`;
            output += `\n`;
        }
    }

    // Reactions
    if (info.reactions.length > 0) {
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += `😀 REACTIONS (${info.reactions.length})\n`;
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        const reactionList = info.reactions.map(r => `${r.emoji} (${r.count})`).join('  |  ');
        output += `${reactionList}\n\n`;
    }

    // Stickers
    if (info.stickers.length > 0) {
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += `🎯 STICKERS (${info.stickers.length})\n`;
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        for (const sticker of info.stickers) {
            output += `  • ${sticker.name} (${sticker.formatType})\n`;
            if (sticker.description) output += `    Description: ${sticker.description}\n`;
        }
        output += `\n`;
    }

    // Mentions
    if (info.mentions.users.length > 0 || info.mentions.roles.length > 0 || info.mentions.channels.length > 0) {
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += `👥 MENTIONS\n`;
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (info.mentions.users.length > 0) {
            output += `Users: ${info.mentions.users.map(u => u.tag).join(', ')}\n`;
        }
        if (info.mentions.roles.length > 0) {
            output += `Roles: ${info.mentions.roles.map(r => r.name).join(', ')}\n`;
        }
        if (info.mentions.channels.length > 0) {
            output += `Channels: ${info.mentions.channels.map(c => `#${c.name}`).join(', ')}\n`;
        }
    }

    output += '\n═══════════════════════════════════';
    return output;
}

function getButtonStyle(style) {
    const styles = {
        1: 'Primary (Blurple)',
        2: 'Secondary (Grey)',
        3: 'Success (Green)',
        4: 'Danger (Red)',
        5: 'Link'
    };
    return styles[style] || `Unknown (${style})`;
}

function createErrorMessage(error) {
    return `❌ **Error:** ${error}`;
}

function splitMessage(text, maxLength = 2000) {
    const chunks = [];
    let currentChunk = '';
    
    const lines = text.split('\n');
    for (const line of lines) {
        if ((currentChunk + line + '\n').length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

// Event handlers
client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📡 Bot is ready to check messages!`);
    console.log(`💡 Use !check <message_id> <guild_id> to analyze a message\n`);
});

client.on('error', (error) => {
    console.error('Client error:', error);
});

// Login to Discord
if (config.token === 'YOUR_DISCORD_TOKEN_HERE') {
    console.error('❌ Please set your Discord token in the config object!');
    process.exit(1);
}

client.login(config.token).catch(error => {
    console.error('Failed to login:', error);
});
