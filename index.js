import { TelegramBotService } from './services/telegramBot.js';

try {
    console.log('Starting Background Remover Bot...');
    const bot = new TelegramBotService();
    console.log('Bot is running...');
} catch (error) {
    console.error('Error starting bot:', error);
    process.exit(1);
} 