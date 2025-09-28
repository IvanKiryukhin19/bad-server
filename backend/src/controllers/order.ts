import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, Types } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import { cleanHtml } from '../middlewares/sanitize/sanitizeHtml'
import { sanitizeOrder } from '../middlewares/sanitize/sanitizeOrder'
import { sanitizeSearch } from '../middlewares/sanitize/sanitizeSearch'
import { sanitizeQueryParams } from '../middlewares/sanitize/sanitizeQueryParams'
import { sanitizeAggregationFilters } from '../middlewares/sanitize/sanitizeAggregationParams'

enum Role {
  Admin = 'admin',
  Customer = 'customer'
}

// GET /orders
export const getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверка прав доступа
        const user = res.locals.user;
        const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
        const limitNum = Math.min(10, parseInt(req.query.limit as string) || 10);
        const safeQuery = sanitizeQueryParams(req.query);
        const searchTerm = safeQuery.search;
        
        // Если пользователь не админ, возвращаем ТОЛЬКО его заказы
        if (!user.roles.includes(Role.Admin)) {
            //const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
            //const limitNum = Math.min(10, parseInt(req.query.limit as string) || 10);
            
            // Санитизируем query параметры
            //const safeQuery = sanitizeQueryParams(req.query);
            //const searchTerm = safeQuery.search;
            
            // Базовые фильтры для пользователя
            const userFilters: FilterQuery<Partial<IOrder>> = { customer: user._id };
            
            // Безопасный поиск для пользователя
            if (searchTerm && typeof searchTerm === 'string') {
                const safeSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const searchRegex = new RegExp(safeSearch, 'i');
                const searchNumber = Number(safeSearch);
                
                const products = await Product.find({ title: searchRegex });
                const productIds: Types.ObjectId[] = products.map((product) => product._id as Types.ObjectId);
                
                const userOrders = await Order.find(userFilters).populate('products');
                
                let filteredOrders = userOrders.filter(order => {
                    const matchesProduct = order.products.some(product => 
                        productIds.some((id: Types.ObjectId) => id.equals(product._id))
                    );
                    const matchesOrderNumber = !Number.isNaN(searchNumber) && 
                                             order.orderNumber === searchNumber;
                    return matchesProduct || matchesOrderNumber;
                });
                
                // Пагинация
                const totalOrders = filteredOrders.length;
                const totalPages = Math.ceil(totalOrders / limitNum);
                filteredOrders = filteredOrders.slice(
                    (pageNum - 1) * limitNum,
                    pageNum * limitNum
                );
                
                const sanitizedOrders = filteredOrders.map(sanitizeOrder);
                
                return res.status(200).json({
                    orders: sanitizedOrders,
                    pagination: {
                        totalOrders,
                        totalPages,
                        currentPage: pageNum,
                        pageSize: limitNum,
                    },
                });
            }
            
            // Если нет поиска, просто возвращаем заказы пользователя
            const userOrders = await Order.find(userFilters)
                .populate(['customer', 'products'])
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum);
            
            const totalOrders = await Order.countDocuments(userFilters);
            const totalPages = Math.ceil(totalOrders / limitNum);
            
            const sanitizedOrders = userOrders.map(sanitizeOrder);
            
            return res.status(200).json({
                orders: sanitizedOrders,
                pagination: {
                    totalOrders,
                    totalPages,
                    currentPage: pageNum,
                    pageSize: limitNum,
                },
            });
        }

        //const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
        //const limitNum = Math.min(10, parseInt(req.query.limit as string) || 10);
        
        const { limit, page, search, ...otherParams } = req.query;
        const sanitizedQuery = sanitizeQueryParams({ limit, page, search });
        
        const {
            sortField = 'createdAt',
            sortOrder = 'desc',
            status,
            totalAmountFrom,
            totalAmountTo,
            orderDateFrom,
            orderDateTo,
        } = req.query

        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Санитизируем все query параметры
        //const safeQuery = sanitizeQueryParams(req.query);
        
        // Используем санитизированные значения
        //const searchTerm = safeQuery.search;
        //const safeStatus = safeQuery.status;
        const safeTotalAmountFrom = safeQuery.totalAmountFrom;
        const safeTotalAmountTo = safeQuery.totalAmountTo;
        const safeOrderDateFrom = safeQuery.orderDateFrom;
        const safeOrderDateTo = safeQuery.orderDateTo;

        const filters: FilterQuery<Partial<IOrder>> = {}

        // Безопасная фильтрация статуса
        /* if (safeStatus && typeof safeStatus === 'string') {
            const validStatuses = ['new', 'completed', 'cancelled', 'delivering']
            if (validStatuses.includes(safeStatus)) {
                filters.status = safeStatus
            }
        } */

        // Безопасная фильтрация по сумме
        if (safeTotalAmountFrom) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $gte: Number(safeTotalAmountFrom),
            }
        }

        if (safeTotalAmountTo) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $lte: Number(safeTotalAmountTo),
            }
        }

        // Безопасная фильтрация по дате
        if (safeOrderDateFrom && typeof safeOrderDateFrom === 'string') {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(safeOrderDateFrom),
            }
        }

        if (safeOrderDateTo && typeof safeOrderDateTo === 'string') {
            filters.createdAt = {
                ...filters.createdAt,
                $lte: new Date(safeOrderDateTo),
            }
        }

        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Санитизируем фильтры для агрегации
        const safeFilters = sanitizeAggregationFilters(filters);

        const aggregatePipeline: any[] = [
            { $match: safeFilters }, // Используем санитизированные фильтры
            {
                $lookup: {
                    from: 'products',
                    localField: 'products',
                    foreignField: '_id',
                    as: 'products',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            { $unwind: '$customer' },
            { $unwind: '$products' },
        ]

        // Безопасный поиск
        if (searchTerm && typeof searchTerm === 'string') {
            const safeSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(safeSearch, 'i')
            const searchNumber = Number(safeSearch)

            const searchConditions: any[] = [{ 'products.title': searchRegex }]

            if (!Number.isNaN(searchNumber)) {
                searchConditions.push({ orderNumber: searchNumber })
            }

            aggregatePipeline.push({
                $match: {
                    $or: searchConditions,
                },
            })
        }

        const sort: { [key: string]: any } = {}

        if (sortField && sortOrder) {
            const safeSortField = cleanHtml(sortField as string)
            sort[safeSortField] = sortOrder === 'desc' ? -1 : 1
        }

        aggregatePipeline.push(
            { $sort: sort },
            { $skip: (Number(pageNum) - 1) * Number(limitNum) },
            { $limit: Number(limitNum) },
            {
                $group: {
                    _id: '$_id',
                    orderNumber: { $first: '$orderNumber' },
                    status: { $first: '$status' },
                    totalAmount: { $first: '$totalAmount' },
                    products: { $push: '$products' },
                    customer: { $first: '$customer' },
                    createdAt: { $first: '$createdAt' },
                },
            }
        )

        const orders = await Order.aggregate(aggregatePipeline)
        const totalOrders = await Order.countDocuments(filters)
        const totalPages = Math.ceil(totalOrders / Number(limit))

        // XSS защита при отправке
        const sanitizedOrders = orders.map(sanitizeOrder)

        res.status(200).json({
            orders: sanitizedOrders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(pageNum),
                pageSize: Number(limitNum),
            },
        })
    } catch (error) {
        next(error)
    }
}

export const getOrdersCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { limit, page, search, ...otherParams } = req.query;
        const safeQuery = sanitizeQueryParams(req.query);

        const userId = res.locals.user._id
        const searchTerm = safeQuery.search;

        const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
        const limitNum = Math.min(10, parseInt(req.query.limit as string) || 10);
        const options = {
            skip: (Number(pageNum) - 1) * Number(limitNum),
            limit: Number(limitNum),
        }

        const user = await User.findById(userId)
            .populate({
                path: 'orders',
                populate: [
                    {
                        path: 'products',
                    },
                    {
                        path: 'customer',
                    },
                ],
            })
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )

        let orders = user.orders as unknown as IOrder[]

        if (searchTerm && typeof searchTerm === 'string') {
            const safeSearch = sanitizeSearch(searchTerm)
            const searchRegex = new RegExp(safeSearch, 'i')
            const searchNumber = Number(safeSearch)
            const products = await Product.find({ title: searchRegex })
            const productIds = products.map((product) => product._id)

            orders = orders.filter((order) => {
                const matchesProductTitle = order.products.some((product) =>
                    (productIds as Types.ObjectId[]).some((id) => id.equals(product._id))
                )
                const matchesOrderNumber =
                    !Number.isNaN(searchNumber) &&
                    order.orderNumber === searchNumber

                return matchesOrderNumber || matchesProductTitle
            })
        }

        const totalOrders = orders.length
        const totalPages = Math.ceil(totalOrders / Number(limitNum))

        orders = orders.slice(options.skip, options.skip + options.limit)

        // XSS защита
        const sanitizedOrders = orders.map(sanitizeOrder)

        return res.send({
            orders: sanitizedOrders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(pageNum),
                pageSize: Number(limitNum),
            },
        })
    } catch (error) {
        next(error)
    }
}

// Get order by ID
export const getOrderByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const orderNumber = Number(req.params.orderNumber)
        if (Number.isNaN(orderNumber)) {
            return next(new BadRequestError('Невалидный номер заказа'))
        }

        const order = await Order.findOne({ orderNumber })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        
        // XSS защита
        return res.status(200).json(sanitizeOrder(order))
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

export const getOrderCurrentUserByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const orderNumber = Number(req.params.orderNumber)
        if (Number.isNaN(orderNumber)) {
            return next(new BadRequestError('Невалидный номер заказа'))
        }

        const order = await Order.findOne({ orderNumber })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        
        if (!order.customer._id.equals(userId)) {
            return next(
                new NotFoundError('Заказ по заданному id отсутствует в базе')
            )
        }
        
        // XSS защита
        return res.status(200).json(sanitizeOrder(order))
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// POST /order
export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const basket: IProduct[] = []
        const products = await Product.find<IProduct>({})
        const userId = res.locals.user._id
        
        // XSS защита входных данных
        const { address, payment, phone, total, email, items, comment } = req.body
        const sanitizedAddress = cleanHtml(address.trim())
        const sanitizedPhone = cleanHtml(phone.trim())
        const sanitizedEmail = cleanHtml(email.trim())
        const sanitizedComment = comment ? cleanHtml(comment.trim()) : ''

        // Валидация items
        if (!Array.isArray(items) || items.length === 0) {
            return next(new BadRequestError('Не указаны товары для заказа'))
        }

        // Проверяем что все items - валидные ObjectId
        const validItems = items.filter((id: any) => Types.ObjectId.isValid(id))
        if (validItems.length !== items.length) {
            return next(new BadRequestError('Невалидные ID товаров'))
        }

        validItems.forEach((id: Types.ObjectId) => {
            const product = products.find((p) => 
                (p._id as Types.ObjectId).equals(id)
            )
            if (!product) {
                throw new BadRequestError(`Товар с id ${id} не найден`)
            }
            if (product.price === null) {
                throw new BadRequestError(`Товар с id ${id} не продается`)
            }
            return basket.push(product)
        })

        const totalBasket = basket.reduce((a, c) => a + c.price, 0)
        if (totalBasket !== total) {
            return next(new BadRequestError('Неверная сумма заказа'))
        }

        const newOrder = new Order({
            totalAmount: total,
            products: validItems,
            payment,
            phone: sanitizedPhone,
            email: sanitizedEmail,
            comment: sanitizedComment,
            customer: userId,
            deliveryAddress: sanitizedAddress,
        })

        const populateOrder = await newOrder.populate(['customer', 'products'])
        await populateOrder.save()

        // XSS защита при отправке
        return res.status(200).json(sanitizeOrder(populateOrder))
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        return next(error)
    }
}

// Update an order
export const updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const orderNumber = Number(req.params.orderNumber)
        if (Number.isNaN(orderNumber)) {
            return next(new BadRequestError('Невалидный номер заказа'))
        }

        const { status } = req.body
        
        // Валидация статуса
        const validStatuses = ['new', 'completed', 'cancelled', 'delivering']
        if (!validStatuses.includes(status)) {
            return next(new BadRequestError('Невалидный статус заказа'))
        }

        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber },
            { status },
            { new: true, runValidators: true }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        
        // XSS защита при отправке
        return res.status(200).json(sanitizeOrder(updatedOrder))
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// Delete an order
export const deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id } = req.params
        
        // Валидация ID
        if (!Types.ObjectId.isValid(id)) {
            return next(new BadRequestError('Невалидный ID заказа'))
        }

        const deletedOrder = await Order.findByIdAndDelete(id)
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        
        // XSS защита при отправке
        return res.status(200).json(sanitizeOrder(deletedOrder))
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}