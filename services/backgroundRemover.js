import pkg from 'remove.bg';
const { removeBackgroundFromImageFile } = pkg;
import { config } from '../config/config.js';
import fs from 'fs/promises';
import path from 'path';

export async function removeBackground(imageBuffer) {
    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp');
        try {
            await fs.mkdir(tempDir);
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
        }

        // Save input image to temp file
        const inputPath = path.join(tempDir, `input-${Date.now()}.png`);
        const outputPath = path.join(tempDir, `output-${Date.now()}.png`);
        await fs.writeFile(inputPath, imageBuffer);

        // Process the image
        console.log('Processing image with remove.bg...');
        await removeBackgroundFromImageFile({
            path: inputPath,
            outputFile: outputPath,
            apiKey: config.REMOVE_BG_API_KEY,
            size: 'regular',
            type: 'auto'
        });

        // Read the processed image
        const resultBuffer = await fs.readFile(outputPath);

        // Clean up temp files
        await Promise.all([
            fs.unlink(inputPath).catch(() => {}),
            fs.unlink(outputPath).catch(() => {})
        ]);

        return resultBuffer;
    } catch (error) {
        console.error('Remove.bg API Error:', {
            message: error.message,
            status: error.status,
            response: error.response?.body,
            type: error.type
        });
        
        if (error.message.includes('402')) {
            throw new Error('API credit exhausted. Please try again later.');
        } else if (error.message.includes('401')) {
            throw new Error('Invalid API key. Please check configuration.');
        }
        throw error;
    }
} 