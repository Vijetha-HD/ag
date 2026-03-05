/**
 * AWS S3 Upload Utility
 * Handles image uploads to AWS S3 for Flower Emporium
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AppError } from './errorHandler.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// Configure S3 Clients for different domains
const getS3Config = (type) => {
    return {
        region: process.env.LAPTOP_AWS_REGION,
        credentials: {
            accessKeyId: process.env.LAPTOP_AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.LAPTOP_AWS_SECRET_ACCESS_KEY,
        },
        bucket: process.env.LAPTOP_AWS_BUCKET_NAME
    };
};

// Cache clients to avoid recreating them
const clients = {};

const getS3Client = (type = 'laptop') => {
    if (!clients[type]) {
        const config = getS3Config(type);

        clients[type] = new S3Client({
            region: config.region,
            credentials: config.credentials
        });
    }
    return clients[type];
};

const generateFileName = (folder = '', contentType = 'image/jpeg') => {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const cleanFolder = folder.endsWith('/') ? folder : `${folder}/`;

    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('audio/mpeg') || contentType.includes('mp3')) ext = 'mp3';
    else if (contentType.includes('audio/wav') || contentType.includes('wav')) ext = 'wav';
    else if (contentType.includes('audio/mp4') || contentType.includes('m4a')) ext = 'm4a';
    // Add more as needed

    return `${cleanFolder}${timestamp}-${random}.${ext}`;
};

/**
 * Upload single image to S3
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} folder - Folder path in S3
 * @param {Object} options - Additional options including 'account'
 * @returns {Promise<Object>} Upload result with secure_url
 */
export const uploadImage = async (fileBuffer, folder = 'files', options = {}) => {
    try {
        const accountType = 'laptop';
        const s3Client = getS3Client(accountType);
        const config = getS3Config(accountType);

        const contentType = options.contentType || 'image/jpeg';
        const key = generateFileName(folder, contentType);

        const command = new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: fileBuffer,
            ContentType: contentType,
        });

        await s3Client.send(command);

        // Construct URL
        const region = config.region;
        const bucket = config.bucket;
        // Standard Virtual-Hosted-Style URL
        const secure_url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

        return {
            public_id: key, // Using Key as public_id for compatibility
            secure_url: secure_url,
            url: secure_url,
            key: key
        };

    } catch (error) {
        console.error('S3 Upload Error:', error);
        throw new AppError('Failed to upload image to S3: ' + error.message, 500);
    }
};

/**
 * Upload multiple images to S3
 * @param {Array<Buffer|Object>} files - Array of file buffers or multer file objects
 * @param {string} folder - Folder path in S3
 * @param {Object} options - Additional options
 * @returns {Promise<Array<Object>>} Array of upload results
 */
export const uploadMultipleImages = async (
    files,
    folder = 'laptops/products',
    options = {}
) => {
    try {
        const uploadPromises = files.map((file) => {
            const buffer = Buffer.isBuffer(file) ? file : (file.buffer || file);
            // If it's a multer file object, we might want to pass its mimetype
            const fileOptions = { ...options };
            if (file.mimetype) {
                fileOptions.contentType = file.mimetype;
            }
            return uploadImage(buffer, folder, fileOptions);
        });
        return await Promise.all(uploadPromises);
    } catch (error) {
        console.error('Error in uploadMultipleImages S3:', error);
        throw new AppError(`Failed to upload images: ${error.message}`, 500);
    }
};

/**
 * Delete image from S3
 * @param {string} publicId - The Key of the object to delete
 * @param {Object} options - Options containing account
 * @returns {Promise<Object>} Deletion result
 */
export const deleteImage = async (publicId, options = {}) => {
    try {
        const accountType = 'laptop';
        const s3Client = getS3Client(accountType);
        const config = getS3Config(accountType);

        const command = new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: publicId,
        });

        await s3Client.send(command);
        return { result: 'ok' };
    } catch (error) {
        console.error('S3 Delete Error:', error);
        // Don't throw for deletion errors to avoid breaking flows, just log
        return { result: 'error', error };
    }
};

/**
 * Delete multiple images from S3
 * @param {Array<string>} publicIds - Array of Keys
 * @param {Object} options - Options containing account
 * @returns {Promise<Object>} Deletion result
 */
export const deleteMultipleImages = async (publicIds, options = {}) => {
    try {
        const promises = publicIds.map(id => deleteImage(id, options));
        await Promise.all(promises);
        return { result: 'ok' };
    } catch (error) {
        throw new AppError('Failed to delete images', 500);
    }
};

/**
 * Upload audio to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} folder - Folder path
 * @param {Object} options - Options
 * @returns {Promise<Object>} Upload result
 */
export const uploadAudio = async (fileBuffer, folder = 'voice-messages', options = {}) => {
    // Reuse uploadImage logic but ensure content type is set for audio if not provided
    // Common audio types: audio/mpeg, audio/wav, etc.
    // If not provided in options, default to audio/mpeg or use generic binary
    const audioOptions = { ...options };
    if (!audioOptions.contentType) {
        audioOptions.contentType = 'audio/mpeg';
    }

    // Add audio specific suffix if generating name? generateFileName uses .jpg hardcoded.
    // We should fix generateFileName to handle extensions.
    // OR just rely on caller to pass folder/key? 
    // generateFileName is internal.
    // refactor generateFileName to accept extension or infer it?
    // For now, let's just use uploadImage but we need to fix the extension in generateFileName.

    return uploadImage(fileBuffer, folder, audioOptions);
};


////////
