import { fal } from '@fal-ai/client';
import { env } from './env.js';

fal.config({ credentials: env.FAL_KEY });

export { fal };
