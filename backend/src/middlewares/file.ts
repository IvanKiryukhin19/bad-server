import { Request, Express } from 'express'
import multer, { FileFilterCallback } from 'multer'
import path, { join } from 'path'
//import { v4 as uuidv4 } from 'uuid';
import fs from 'fs'

const generateSafeName = () => {
    return Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + Math.round(Math.random() * 1E9);
};

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

const storage = multer.diskStorage({
    destination: (
        _req: Request,
        _file: Express.Multer.File,
        cb: DestinationCallback
    ) => {
        /*cb(
            null,
            join(
                __dirname,
                process.env.UPLOAD_PATH_TEMP
                    ? `../public/${process.env.UPLOAD_PATH_TEMP}`
                    : '../public'
            )
        )*/
       // Используем абсолютный путь для надежности в Docker
        const uploadDir = process.env.UPLOAD_PATH_TEMP || 'temp';
        const fullPath = path.join(process.cwd(), 'public', uploadDir);
        
        // Создаем директорию если не существует
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        
        cb(null, fullPath);
    },

    filename: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileNameCallback
    ) => {
        const safeName = `${generateSafeName()}${path.extname(file.originalname)}`;
        cb(null, safeName);
    },
})

const types = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
]

const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    const allowedMimes = [
        'image/png',
        'image/jpg',
        'image/jpeg',
        'image/gif',
        'image/svg+xml',
    ];

    // Проверка MIME type
    if (!allowedMimes.includes(file.mimetype)) {
        return cb(null, false);
    }

    // Дополнительная проверка расширения файла
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
    
    if (!allowedExt.includes(ext)) {
        return cb(null, false);
    }

    // Проверка соответствия MIME type и расширения
    const mimeToExt: { [key: string]: string[] } = {
        'image/png': ['.png'],
        'image/jpg': ['.jpg'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/gif': ['.gif'],
        'image/svg+xml': ['.svg'],
    };

    if (mimeToExt[file.mimetype] && !mimeToExt[file.mimetype].includes(ext)) {
        return cb(null, false);
    }

    return cb(null, true)
}

export default multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB максимум
        files: 1, // не более 1 файла за раз
    } 
})
