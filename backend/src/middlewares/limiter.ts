import rateLimit from 'express-rate-limit'

export const limiter=rateLimit({
    windowMs: 5 * 60 * 1000, // 15 minutes
	//limit: 10, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
	//standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	//legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
	//ipv6Subnet: 60, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
    max: 50,
    statusCode: 429,
    message: 'The request limit is reached.',
})