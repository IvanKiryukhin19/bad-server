import BadRequestError from '../../errors/bad-request-error'

export const sanitizeAggregationFilters=(filters: any): any => {
    if (!filters || typeof filters !== 'object') return filters;
            
    const sanitized: any = {};
            
    for (const [key, value] of Object.entries(filters)) {
        // Защита от операторов $ в ключах
        if (key.startsWith('$')) {
            throw new BadRequestError('Невалидный запрос');
        }
                
        if (typeof value === 'string') {
            // Защита от операторов $ в значениях
            if (value.startsWith('$')) {
                throw new BadRequestError('Невалидный запрос');
            }
                    
            sanitized[key] = value;
        } else if (typeof value === 'object' && value !== null) {
            // Рекурсивная санитизация для вложенных объектов
            sanitized[key] = sanitizeAggregationFilters(value);
        } else {
            sanitized[key] = value;
        }
    }
    
    if (sanitized.$expr) {
        throw new BadRequestError('Невалидный запрос');
    }

    if (sanitized.$function) {
        throw new BadRequestError('Невалидный запрос');
    }

    return sanitized;
};

