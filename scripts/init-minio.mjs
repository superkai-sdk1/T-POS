#!/usr/bin/env node

/**
 * Инициализация MinIO: создание bucket для client-photos
 */

import { S3Client, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const BUCKET_NAME = 'client-photos';

const s3Client = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  region: 'us-east-1',
  forcePathStyle: true,
});

async function initMinio() {
  console.log('=== Инициализация MinIO ===');
  
  try {
    // Создание bucket
    console.log(`Создание bucket: ${BUCKET_NAME}`);
    await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    console.log('✓ Bucket создан');
  } catch (error) {
    if (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists') {
      console.log('⚠ Bucket уже существует');
    } else {
      console.error('✗ Ошибка создания bucket:', error.message);
      throw error;
    }
  }
  
  // Установка политики публичного доступа
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
      },
    ],
  };
  
  try {
    console.log('Установка политики публичного доступа...');
    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(policy),
    }));
    console.log('✓ Политика установлена');
  } catch (error) {
    console.error('✗ Ошибка установки политики:', error.message);
    throw error;
  }
  
  console.log('\n=== Готово ===');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Console: http://${process.env.MINIO_ENDPOINT}:9001`);
  console.log(`API: http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
}

initMinio().catch(console.error);
