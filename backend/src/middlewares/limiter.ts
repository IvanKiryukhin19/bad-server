import rateLimit from 'express-rate-limit';

export const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    statusCode: 429,
    message: 'Достигнут предел запросов',
})