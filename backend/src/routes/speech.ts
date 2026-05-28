import type { Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';

import { speechRateLimiter } from '../middleware/rateLimit.js';
import { transcribeAudioBuffer } from '../services/whisperService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

export const speechRouter = Router();

speechRouter.post(
  '/speech/transcribe',
  speechRateLimiter,
  upload.single('audio'),
  async (request: Request, response: Response) => {
    const audioFile = request.file;

    if (!audioFile) {
      return response.status(400).json({
        message: 'Audio file is required.',
        code: 'SPEECH_AUDIO_MISSING',
      });
    }

    const language =
      typeof request.body?.language === 'string' ? request.body.language : undefined;

    try {
      const transcript = await transcribeAudioBuffer({
        buffer: audioFile.buffer,
        mimeType: audioFile.mimetype,
        originalName: audioFile.originalname,
        language,
      });

      return response.status(200).json({
        transcript,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Speech transcription failed.';

      if (errorMessage === 'OPENAI_API_KEY_MISSING') {
        return response.status(500).json({
          message: 'Backend OpenAI API key is missing.',
          code: 'BACKEND_OPENAI_API_KEY_MISSING',
        });
      }

      if (errorMessage === 'WHISPER_EMPTY_TRANSCRIPT') {
        return response.status(422).json({
          message: 'No speech detected in the recording.',
          code: 'SPEECH_EMPTY_TRANSCRIPT',
        });
      }

      return response.status(500).json({
        message: errorMessage,
        code: 'SPEECH_TRANSCRIBE_ERROR',
      });
    }
  },
);
