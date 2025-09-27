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

app.use(
    rateLimit({
        windowMs: 5 * 60 * 1000,
        max: 50,
        statusCode: 429,
        message: 'The request limit is reached.',
        headers: true,
    })
)

app.use(
    cors({
        origin: 'http://localhost',
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
        methods: ['GET', 'POST', 'PATCH', 'DELETE'] 
    })
);

app.use(serveStatic(path.join(__dirname, 'public')))
app.use(json({ limit: '10mb' }))
app.use(urlencoded({ extended: true, limit: '10mb' }))

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
