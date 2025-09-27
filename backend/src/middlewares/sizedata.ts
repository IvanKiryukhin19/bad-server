import { NextFunction, Request, Response } from 'express'

// Определение middleware для проверки минимального размера данных
export const checkMinSize = (minSize:number) => (req:Request, res:Response, next:NextFunction) => {
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength, 10) < minSize) {
    return res.status(400).send('Данные слишком малы');
  }
  next();
};