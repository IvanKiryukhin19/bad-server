import BadRequestError from '../../errors/bad-request-error'
import { sanitizeSearch } from './sanitizeSearch';

export const sanitizeQueryParams = (query: any): any => {
  const sanitizedData: any = {};
  
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      // Защита от операторов $
      if (value.startsWith('$')) {
        throw new BadRequestError('Невалидный запрос');
      }
      sanitizedData[key] = sanitizeSearch(value);
    } else if (typeof value === 'object' && value !== null) {
      // Рекурсивная санитизация для объектов
      sanitizedData[key] = sanitizeQueryParams(value);
    } else {
      sanitizedData[key] = value;
    }
  }
  
  return sanitizedData;
};