import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import { removeBackground } from './backgroundRemover.js';
import { processImage } from '../utils/imageProcessor.js';
import { AdminService } from './adminService.js';
import { UserService } from './userService.js';

export class TelegramBotService {
    constructor() {
        this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
        this.userLimits = new Map(); // Store user limits
        this.adminService = new AdminService(this.bot, this.userLimits);
        this.userService = new UserService();
        this.setupHandlers();
        this.adminService.setupAdminCommands();
    }

    // Check if user has reached daily limit
    async checkUserLimit(userId) {
        try {
            const dailyUsage = await this.userService.getDailyUsage(userId);
            return (dailyUsage || 0) < config.DAILY_LIMIT;
        } catch (error) {
            console.error('Error checking user limit:', error);
            return false;
        }
    }

    // Increment user's usage count
    async incrementUserUsage(userId) {
        try {
            await this.userService.incrementUserStats(userId);
            const dailyUsage = await this.userService.getDailyUsage(userId);
            return dailyUsage || 0;
        } catch (error) {
            console.error('Error incrementing usage:', error);
            return 0;
        }
    }

    setupHandlers() {
        // Start command handler
        this.bot.onText(/\/start/, (msg) => {
            const welcomeMessage = `
Welcome to Background Remover Bot! 🎨

I can help you remove backgrounds from your images. Here's how to use me:

1. Send me any image
2. Wait for processing
3. Receive your image with background removed

Daily Limit: ${config.DAILY_LIMIT} credits per user

Commands:
/start - Show this message
/help - Get help
/credits - Check your remaining credits
/collect - Collect free daily credits
/redeem - Redeem a code (Usage: /redeem CODE)
/history - View your redemption history
/mystats - View your usage statistics

Send me an image to get started!
            `;
            
            this.bot.sendMessage(msg.chat.id, welcomeMessage, {
                parse_mode: 'Markdown'
            });
        });

        // Help command handler
        this.bot.onText(/\/help/, (msg) => {
            const helpMessage = `
Need help? Here are some tips:

• Send images as photos or files
• Maximum file size: 20MB
• Supported formats: JPEG, PNG, WebP
• Daily limit: ${config.DAILY_LIMIT} credits
• Processing usually takes 5-15 seconds

Having issues? Contact @YourSupportUsername
            `;
            
            this.bot.sendMessage(msg.chat.id, helpMessage);
        });

        // Credits check command
        this.bot.onText(/\/(limit|credits|remaining)/, async (msg) => {
            const userId = msg.from.id;
            
            try {
                const dailyUsage = await this.userService.getDailyUsage(userId);
                const stats = await this.userService.getUserStats(userId);
                
                const used = dailyUsage || 0;
                const dailyRemaining = config.DAILY_LIMIT - used;
                
                const limitMessage = `
📊 *Your Credits Status*

💰 Account Balance: ${stats?.accountBalance || 0} credits
📅 Daily Usage: ${used}/${config.DAILY_LIMIT}
⭐️ Daily Remaining: ${dailyRemaining}

${dailyRemaining === 0 ? '❌ Daily limit reached. Try again tomorrow!' : '✨ You can still remove backgrounds today!'}

📈 *Overall Stats*
🖼 Total processed: ${stats?.totalImages || 0} images
💫 Total credits used: ${stats?.creditsUsed || 0}

ℹ️ Your account balance never expires!
Daily limit resets at midnight.`;
                
                await this.bot.sendMessage(msg.chat.id, limitMessage, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                console.error('Error getting credits:', error);
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ Error checking credits. Please try again.');
            }
        });

        // Handle photo messages
        this.bot.on('photo', async (msg) => {
            if (!await this.checkUserLimit(msg.from.id)) {
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ Daily credit limit reached. Please try again tomorrow.'
                );
                return;
            }
            await this.handleImage(msg);
        });

        // Handle document messages
        this.bot.on('document', async (msg) => {
            if (!await this.checkUserLimit(msg.from.id)) {
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ Daily credit limit reached. Please try again tomorrow.'
                );
                return;
            }
            if (this.isValidImageDocument(msg.document)) {
                await this.handleImage(msg);
            }
        });

        // Direct code collection command
        this.bot.onText(/\/collect/, async (msg) => {
            const userId = msg.from.id;
            const chatId = msg.chat.id;

            try {
                // Check if user can collect
                if (!await this.adminService.redeemService.canCollectDaily(userId)) {
                    await this.bot.sendMessage(chatId, 
                        '❌ You have already collected today.\nCome back in 24 hours!');
                    return;
                }

                // Generate and use collection code
                const code = await this.adminService.redeemService.createCode(5, 1);
                const credits = await this.adminService.redeemService.useCode(code, userId);
                
                if (credits) {
                    // Record collection
                    await this.adminService.redeemService.recordCollection(userId);

                    // Get updated stats
                    const stats = await this.userService.getUserStats(userId);
                    
                    await this.bot.sendMessage(chatId, 
                        `🎁 You collected 5 free credits!\n\n` +
                        `💰 Current balance: ${stats.accountBalance} credits\n` +
                        `Use /credits to check your balance.\n\n` +
                        `Come back in 24 hours to collect again!`);
                } else {
                    await this.bot.sendMessage(chatId, 
                        '❌ Error collecting credits. Please try again.');
                }
            } catch (error) {
                console.error('Error collecting credits:', error);
                await this.bot.sendMessage(chatId, 
                    '❌ Error collecting credits. Please try again later.');
            }
        });

        // Redeem code command
        this.bot.onText(/\/redeem (.+)/, async (msg, match) => {
            const userId = msg.from.id;
            const code = match[1].toUpperCase();
            
            try {
                // Check if code exists and can be used
                if (!await this.adminService.redeemService.isValidCode(code)) {
                    await this.bot.sendMessage(msg.chat.id, 
                        '❌ Invalid redeem code.');
                    return;
                }

                if (!await this.adminService.redeemService.canUseCode(code, userId)) {
                    await this.bot.sendMessage(msg.chat.id, 
                        '❌ You have already used this code or it has reached maximum uses.');
                    return;
                }

                // Try to redeem the code
                const credits = await this.adminService.redeemService.useCode(code, userId);
                
                if (credits) {
                    // Get updated stats to show new balance
                    const stats = await this.userService.getUserStats(userId);
                    
                    await this.bot.sendMessage(msg.chat.id, 
                        `✨ Success! You received ${credits} credits!\n\n` +
                        `💰 Current balance: ${stats.accountBalance} credits\n` +
                        `Use /credits to check your detailed balance.`);
                } else {
                    await this.bot.sendMessage(msg.chat.id, 
                        '❌ Error redeeming code. Please try again.');
                }
            } catch (error) {
                console.error('Error redeeming code:', error);
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ Error redeeming code. Please try again later.');
            }
        });

        // Stats command
        this.bot.onText(/\/mystats/, async (msg) => {
            const userId = msg.from.id;
            const stats = await this.userService.getUserStats(userId);
            
            if (!stats) {
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ No stats available. Try processing some images first!');
                return;
            }

            const statsMessage = `
📊 *Your Statistics*

🖼 Total images processed: ${stats.totalImages}
💫 Credits used: ${stats.creditsUsed}
📅 Today's usage: ${stats.dailyUsage}/${config.DAILY_LIMIT}
⭐️ Remaining today: ${config.DAILY_LIMIT - stats.dailyUsage}
🕐 Last active: ${new Date(stats.lastActive).toLocaleString()}
📆 Joined: ${new Date(stats.joinedAt).toLocaleString()}
            `;

            await this.bot.sendMessage(msg.chat.id, statsMessage, {
                parse_mode: 'Markdown'
            });
        });

        // Redemption history command
        this.bot.onText(/\/history/, async (msg) => {
            const userId = msg.from.id;
            
            try {
                const history = await this.adminService.redeemService.getRedemptionHistory(userId);
                
                if (history.length === 0) {
                    await this.bot.sendMessage(msg.chat.id, 
                        '📝 You haven\'t redeemed any codes yet.\n' +
                        'Use /redeem CODE to redeem a code!');
                    return;
                }

                const historyMessage = `
📋 *Your Redemption History*

${history.map(item => 
    `Code: *${item.code}*\n` +
    `Credits: +${item.credits}\n` +
    `Date: ${new Date(item.redeemedAt).toLocaleString()}\n`
).join('\n')}

Total codes redeemed: ${history.length}
Total credits earned: ${history.reduce((sum, item) => sum + item.credits, 0)}

Use /credits to check your current balance.`;

                await this.bot.sendMessage(msg.chat.id, historyMessage, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                console.error('Error getting redemption history:', error);
                await this.bot.sendMessage(msg.chat.id, 
                    '❌ Error getting redemption history. Please try again.');
            }
        });
    }

    async handleImage(msg) {
        const userId = msg.from.id;
        const chatId = msg.chat.id;

        try {
            // Create or update user data
            await this.userService.createOrUpdateUser(userId, {
                username: msg.from.username,
                firstName: msg.from.first_name,
                lastName: msg.from.last_name
            });

            // Get user stats
            const stats = await this.userService.getUserStats(userId);
            const dailyUsage = await this.userService.getDailyUsage(userId);

            // Check daily limit
            if ((dailyUsage || 0) >= config.DAILY_LIMIT) {
                await this.bot.sendMessage(chatId, 
                    '❌ Daily limit reached. Please try again tomorrow.');
                return;
            }

            // Check account balance
            if ((stats?.accountBalance || 0) <= 0) {
                await this.bot.sendMessage(chatId, 
                    '❌ Insufficient credits. Use /redeem to add more credits!');
                return;
            }

            // Track active user
            this.adminService.trackUser(userId);

            // Check if user is banned
            if (this.adminService.isBanned(userId)) {
                await this.bot.sendMessage(chatId, 
                    '❌ You are banned from using this bot. Contact support if you think this is a mistake.');
                return;
            }

            // Send processing message
            const processingMsg = await this.bot.sendMessage(chatId, 
                '🔄 Processing your image...\n\n' +
                'This may take a few moments.'
            );

            // Get file ID
            const fileId = msg.photo ? 
                msg.photo[msg.photo.length - 1].file_id : 
                msg.document.file_id;

            // Get file path
            const file = await this.bot.getFile(fileId);
            const filePath = file.file_path;

            // Process image
            const processedImageBuffer = await processImage(filePath);
            
            // Remove background
            const resultBuffer = await removeBackground(processedImageBuffer);

            // After processing, increment usage and get stats
            await this.userService.incrementUserStats(userId);
            const updatedStats = await this.userService.getUserStats(userId);
            const dailyRemaining = config.DAILY_LIMIT - (updatedStats.dailyUsage || 0);

            // Send processed image
            await this.bot.sendDocument(chatId, resultBuffer, {
                caption: `✨ Image processed successfully!\n\n` +
                        `💰 Credits remaining: ${updatedStats.accountBalance}\n` +
                        `📅 Daily remaining: ${dailyRemaining}\n` +
                        `📊 Total processed: ${updatedStats.totalImages}`
            });

            // Delete processing message
            await this.bot.deleteMessage(chatId, processingMsg.message_id);

        } catch (error) {
            console.error('Error:', error);
            await this.bot.sendMessage(chatId, 
                '❌ Error processing image. Please try again.');
        }
    }

    isValidImageDocument(document) {
        return config.ALLOWED_FORMATS.includes(document.mime_type) && 
               document.file_size <= config.MAX_FILE_SIZE;
    }
} 