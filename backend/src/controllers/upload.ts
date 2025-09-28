import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import BadRequestError from '../errors/bad-request-error'
import sharp from 'sharp'

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'))
    }

    if (req.file.size < 2 * 1024) { 
        return next(new BadRequestError('Файл слишком маленький'));
    }

    try {
        await sharp(req.file.path).metadata()
    } catch (error) {
        return next(new BadRequestError('Неверный формат изображения'))
    }

    try {
        const fileName = process.env.UPLOAD_PATH
            ? `/${process.env.UPLOAD_PATH}/${req.file.filename}`
            : `/${req.file?.filename}`
        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
            originalName: req.file?.originalname,
        })
    } catch (error) {
        return next(error)
    }
}

export default {}
