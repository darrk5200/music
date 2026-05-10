class CommandBuilder {
    constructor(name, description) {
        this.name = name;
        this.description = description;
        this.aliases = [];
        this.usage = '';
        this.cooldown = 0;
    }

    setAliases(aliases) {
        this.aliases = aliases;
        return this;
    }

    setUsage(usage) {
        this.usage = usage;
        return this;
    }

    setCooldown(cooldown) {
        this.cooldown = cooldown;
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
            aliases: this.aliases,
            usage: this.usage,
            cooldown: this.cooldown,
            execute: this.run
        };
    }
}

module.exports = { CommandBuilder };
