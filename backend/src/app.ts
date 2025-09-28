import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded } from 'express'
import mongoose from 'mongoose'
import mongoSanitize from 'express-mongo-sanitize'
import helmet from 'helmet'
import path from 'path'
import { DB_ADDRESS } from './config'
import errorHandler from './middlewares/error-handler'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'
import { limiter } from '../src/middlewares/limiter'

const { PORT = 3000 } = process.env
const app = express()

app.use(cookieParser())

app.use(limiter)

app.use(
    cors({
        origin: 'http://localhost:5173',
        credentials: true,
    })
)
app.use(mongoSanitize())
app.use(helmet())
app.use(serveStatic(path.join(__dirname, 'public')))
app.use(json({ limit: '1mb' }))
app.use(urlencoded({ extended: true, limit: '10mb' }))

app.use(routes)

app.use(errors())
app.use(errorHandler)

const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        await app.listen(PORT, () => console.log('Server started on port', PORT))
    } catch (error) {
        console.error(error)
    }
}

bootstrap()