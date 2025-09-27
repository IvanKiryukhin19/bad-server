import { Router } from 'express'
import { uploadFile } from '../controllers/upload'
import fileMiddleware from '../middlewares/file'
import { checkMinSize } from '../middlewares/sizedata'

const uploadRouter = Router()
uploadRouter.post('/', fileMiddleware.single('file'), checkMinSize(2048),uploadFile)

export default uploadRouter
