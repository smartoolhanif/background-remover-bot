import sharp from 'sharp';
import axios from 'axios';
import { config } from '../config/config.js';

export async function processImage(filePath) {
    try {
        // Construct the full Telegram file URL
        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`;
        console.log('Downloading image from:', fileUrl);

        // Download image
        const response = await axios.get(fileUrl, { 
            responseType: 'arraybuffer',
            validateStatus: false
        });

        if (response.status !== 200) {
            throw new Error(`Failed to download image: ${response.status}`);
        }

        const buffer = Buffer.from(response.data);

        // Process image with sharp
        const processedBuffer = await sharp(buffer)
            .resize(1500, 1500, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .toFormat('png')
            .toBuffer();

        return processedBuffer;
    } catch (error) {
        console.error('Error processing image:', error.message);
        throw error;
    }
} 