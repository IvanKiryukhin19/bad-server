import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded } from 'express'
import mongoose from 'mongoose'
import path from 'path'
import { DB_ADDRESS } from './config'
import errorHandler from './middlewares/error-handler'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'
import rateLimit from 'express-rate-limit'
//import { limiter } from './middlewares/limiter'

const { PORT = 3000 } = process.env
const app = express()

app.use(cookieParser())
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
app.use(limiter)

app.use(cors({
  origin: 'http://localhost',
  credentials: true
}));

//app.use(cors())
// app.use(cors({ origin: ORIGIN_ALLOW, credentials: true }));
// app.use(express.static(path.join(__dirname, 'public')));

app.use(serveStatic(path.join(__dirname, 'public')))
app.use(json({ limit: '10mb' }))
app.use(urlencoded({ extended: true, limit: '10mb' }))

//app.use(urlencoded({ extended: true }))
//app.use(json())

//app.options('*', cors())
app.use(routes)
app.use(errors())
app.use(errorHandler)

// eslint-disable-next-line no-console

const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        await app.listen(PORT, () => console.log('ok'))
    } catch (error) {
        console.error(error)
    }
}

bootstrap()
