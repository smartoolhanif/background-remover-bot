import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

// Log the current working directory and .env file location
console.log('Current working directory:', process.cwd());
console.log('.env file path:', envPath);
console.log('.env file exists:', fs.existsSync(envPath));

// Load .env file
dotenv.config({ path: envPath });

// Debug: Log environment variables (but mask the actual values)
console.log('TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('REMOVE_BG_API_KEY exists:', !!process.env.REMOVE_BG_API_KEY);

// Validate required environment variables
if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required in .env file');
}

if (!process.env.REMOVE_BG_API_KEY) {
    throw new Error('REMOVE_BG_API_KEY is required in .env file');
}

export const config = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    REMOVE_BG_API_KEY: process.env.REMOVE_BG_API_KEY,
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
    TEMP_DIR: join(process.cwd(), 'temp'),
    DAILY_LIMIT: 10,
    ADMIN_IDS: ['5260441331'], // Your admin ID
    ADMIN_COMMANDS: {
        '/setlimit': 'Set daily credit limit',
        '/addadmin': 'Add new admin',
        '/removeadmin': 'Remove admin',
        '/broadcast': 'Send message to all users',
        '/stats': 'View bot statistics',
        '/banuser': 'Ban a user',
        '/unbanuser': 'Unban a user',
        '/addcredits': 'Add credits to user',
        '/resetlimit': 'Reset user\'s daily limit',
        '/createcode': 'Create a redeem code',
        '/listcodes': 'List all active redeem codes',
        '/deletecode': 'Delete a redeem code'
    },
    REDEEM: {
        CODE_LENGTH: 8,
        MAX_USES: 100
    }
};

// Create temp directory if it doesn't exist
try {
    if (!fs.existsSync(config.TEMP_DIR)) {
        fs.mkdirSync(config.TEMP_DIR);
    }
} catch (error) {
    console.warn('Could not create temp directory:', error.message);
}

// Log confirmation of loaded config
console.log('Configuration loaded successfully'); 