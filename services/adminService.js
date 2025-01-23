import { config } from '../config/config.js';
import { RedeemService } from './redeemService.js';

export class AdminService {
    constructor(bot, userLimits) {
        this.bot = bot;
        this.userLimits = userLimits;
        this.bannedUsers = new Set();
        this.activeUsers = new Map(); // Track active users
        this.redeemService = new RedeemService();
    }

    isAdmin(userId) {
        return config.ADMIN_IDS.includes(userId.toString());
    }

    isBanned(userId) {
        return this.bannedUsers.has(userId.toString());
    }

    setupAdminCommands() {
        // Admin help command
        this.bot.onText(/\/admin/, (msg) => {
            if (!this.isAdmin(msg.from.id)) return;
            
            let adminHelp = '*Admin Commands:*\n\n';
            Object.entries(config.ADMIN_COMMANDS).forEach(([cmd, desc]) => {
                adminHelp += `${cmd} - ${desc}\n`;
            });
            
            this.bot.sendMessage(msg.chat.id, adminHelp, { parse_mode: 'Markdown' });
        });

        // Set daily limit
        this.bot.onText(/\/setlimit (\d+)/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            const newLimit = parseInt(match[1]);
            config.DAILY_LIMIT = newLimit;
            await this.bot.sendMessage(msg.chat.id, `✅ Daily limit updated to ${newLimit} credits`);
        });

        // Add admin
        this.bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            const newAdminId = match[1];
            config.ADMIN_IDS.push(newAdminId);
            await this.bot.sendMessage(msg.chat.id, `✅ Added user ${newAdminId} as admin`);
        });

        // Ban user
        this.bot.onText(/\/banuser (\d+)/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            const userId = match[1];
            this.bannedUsers.add(userId);
            await this.bot.sendMessage(msg.chat.id, `🚫 User ${userId} has been banned`);
        });

        // Unban user
        this.bot.onText(/\/unbanuser (\d+)/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            const userId = match[1];
            this.bannedUsers.delete(userId);
            await this.bot.sendMessage(msg.chat.id, `✅ User ${userId} has been unbanned`);
        });

        // Add credits to user
        this.bot.onText(/\/addcredits (\d+) (\d+)/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            const userId = match[1];
            const credits = parseInt(match[2]);
            
            const userUsage = this.userLimits.get(userId) || { 
                count: 0, 
                date: new Date().toDateString() 
            };
            userUsage.count = Math.max(0, userUsage.count - credits);
            this.userLimits.set(userId, userUsage);
            
            await this.bot.sendMessage(msg.chat.id, 
                `✅ Added ${credits} credits to user ${userId}`);
            await this.bot.sendMessage(userId, 
                `🎁 You received ${credits} additional credits from admin!`);
        });

        // Broadcast message
        this.bot.onText(/\/broadcast (.+)/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            const message = match[1];
            const failed = [];
            
            for (const [userId] of this.activeUsers) {
                try {
                    await this.bot.sendMessage(userId, 
                        `📢 *Admin Broadcast*\n\n${message}`, 
                        { parse_mode: 'Markdown' });
                } catch (error) {
                    failed.push(userId);
                }
            }
            
            await this.bot.sendMessage(msg.chat.id, 
                `✅ Broadcast sent\nFailed: ${failed.length}`);
        });

        // Stats command
        this.bot.onText(/\/stats/, async (msg) => {
            if (!this.isAdmin(msg.from.id)) return;
            
            const stats = {
                totalUsers: this.activeUsers.size,
                bannedUsers: this.bannedUsers.size,
                activeToday: Array.from(this.userLimits.values())
                    .filter(u => u.date === new Date().toDateString()).length
            };
            
            const statsMessage = `
📊 *Bot Statistics*

👥 Total Users: ${stats.totalUsers}
📅 Active Today: ${stats.activeToday}
🚫 Banned Users: ${stats.bannedUsers}
⚙️ Current Limit: ${config.DAILY_LIMIT} credits
            `;
            
            await this.bot.sendMessage(msg.chat.id, statsMessage, 
                { parse_mode: 'Markdown' });
        });

        // Create redeem code
        this.bot.onText(/\/createcode (\d+) ?(\d+)?/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            
            try {
                const credits = parseInt(match[1]);
                const maxUses = match[2] ? parseInt(match[2]) : config.REDEEM.MAX_USES;
                
                const code = await this.redeemService.createCode(credits, maxUses);
                
                await this.bot.sendMessage(msg.chat.id, 
                    `✅ Created redeem code:\n\n` +
                    `*${code}*\n\n` +
                    `Credits: ${credits}\n` +
                    `Max uses: ${maxUses}`, 
                    { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error creating code:', error);
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ Error creating redeem code. Please try again.');
            }
        });

        // List active codes
        this.bot.onText(/\/listcodes/, async (msg) => {
            if (!this.isAdmin(msg.from.id)) return;
            
            try {
                const codes = await this.redeemService.listCodes();
                if (codes.length === 0) {
                    await this.bot.sendMessage(msg.chat.id, 'No active redeem codes.');
                    return;
                }

                const codesList = codes.map(code => 
                    `Code: *${code.code}*\n` +
                    `Credits: ${code.credits}\n` +
                    `Used: ${code.used}/${code.maxUses}\n` +
                    `Created: ${code.createdAt.toLocaleString()}\n`
                ).join('\n');

                await this.bot.sendMessage(msg.chat.id, 
                    `📋 *Active Redeem Codes*\n\n${codesList}`, 
                    { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error listing codes:', error);
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ Error listing redeem codes. Please try again.');
            }
        });

        // Delete redeem code
        this.bot.onText(/\/deletecode (.+)/, async (msg, match) => {
            if (!this.isAdmin(msg.from.id)) return;
            
            const code = match[1].toUpperCase();
            if (this.redeemService.deleteCode(code)) {
                await this.bot.sendMessage(msg.chat.id, 
                    `✅ Deleted redeem code: ${code}`);
            } else {
                await this.bot.sendMessage(msg.chat.id, 
                    `❌ Code not found: ${code}`);
            }
        });
    }

    // Track active users
    trackUser(userId) {
        this.activeUsers.set(userId.toString(), new Date());
    }
} 