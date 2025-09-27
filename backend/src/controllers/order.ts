import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, Types } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import { cleanHtml } from '../middlewares/sanitize/sanitizeHtml'
import { sanitizeQueryParams } from '../middlewares/sanitize/sanitizeQueryParams'
import { sanitizeSearch } from '../middlewares/sanitize/sanitizeSearch'
import { sanitizeOrder } from '../middlewares/sanitize/sanitizeOrder'
import { sanitizeAggregationFilters } from '../middlewares/sanitize/sanitizeAggregationParams'

// eslint-disable-next-line max-len
// GET /orders?page=2&limit=5&sort=totalAmount&order=desc&orderDateFrom=2024-07-01&orderDateTo=2024-08-01&status=delivering&totalAmountFrom=100&totalAmountTo=1000&search=%2B1

enum Role {
    Admin = 'admin',
    User = 'customer'
}

export const getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {

        const user=res.locals.user;
        const safeQuery=sanitizeQueryParams(req.query);
        const pageNumber = Math.max(1, parseInt(safeQuery.page as string) || 1);
        const limitNumber = Math.min(10, Math.max(1, parseInt(safeQuery.limit as string) || 10));
        const searchTerm = safeQuery.search;
        const safeSearch = sanitizeSearch(searchTerm);
        const searchRegex = new RegExp(safeSearch, 'i');
        const searchNumber = Number(safeSearch);
        const { limit, page, search, ...otherParams } = safeQuery;
       

        if (!user.roles.include(Role.Admin)){
            //const safeQuery=sanitizeQueryParams(req.query);
            

            //const pageNumber = Math.max(1, parseInt(safeQuery.page as string) || 1);
            //const limitNumber = Math.min(10, Math.max(1, parseInt(safeQuery.limit as string) || 10));

            // Базовые фильтры для пользователя
            const userFilters: FilterQuery<Partial<IOrder>> = { customer: user._id };
            if (searchTerm && typeof searchTerm === 'string') {
                
                
                
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
                const totalPages = Math.ceil(totalOrders / limitNumber);
                filteredOrders = filteredOrders.slice(
                    (pageNumber - 1) * limitNumber,
                    pageNumber * limitNumber
                );
                
                const sanitizedOrders = filteredOrders.map(sanitizeOrder);
                
                return res.status(200).json({
                    orders: sanitizedOrders,
                    pagination: {
                        totalOrders,
                        totalPages,
                        currentPage: pageNumber,
                        pageSize: limitNumber,
                    },
                });
            }
            
            const userOrders = await Order.find(userFilters)
                .populate(['customer', 'products'])
                .skip((pageNumber - 1) * limitNumber)
                .limit(limitNumber);
            
            const totalOrders = await Order.countDocuments(userFilters);
            const totalPages = Math.ceil(totalOrders / limitNumber);
            
            const sanitizedOrders = userOrders.map(sanitizeOrder);
            
            return res.status(200).json({
                orders: sanitizedOrders,
                pagination: {
                    totalOrders,
                    totalPages,
                    currentPage: pageNumber,
                    pageSize: limitNumber,
                },
            });
        }

        const {
            sortField = 'createdAt',
            sortOrder = 'desc',
            status,
            totalAmountFrom,
            totalAmountTo,
            orderDateFrom,
            orderDateTo,
        } = safeQuery

        const filters: FilterQuery<Partial<IOrder>> = {}

        if (status) {
            if (typeof status === 'object') {
                Object.assign(filters, status)
            }
            if (typeof status === 'string') {
                filters.status = status
            }
        }

        if (totalAmountFrom) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $gte: Number(totalAmountFrom),
            }
        }

        if (totalAmountTo) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $lte: Number(totalAmountTo),
            }
        }

        if (orderDateFrom) {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(orderDateFrom as string),
            }
        }

        if (orderDateTo) {
            filters.createdAt = {
                ...filters.createdAt,
                $lte: new Date(orderDateTo as string),
            }
        }

        const safeFilters = sanitizeAggregationFilters(filters);   

        const aggregatePipeline: any[] = [
            { $match: safeFilters },
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


        if (searchTerm && typeof searchTerm === 'string') {
            const searchConditions: any[] = [{ 'products.title': searchRegex }]

            if (!Number.isNaN(searchNumber)) {
                searchConditions.push({ orderNumber: searchNumber })
            }

            aggregatePipeline.push({
                $match: {
                    $or: searchConditions,
                },
            })

            filters.$or = searchConditions
        }

        const sort: { [key: string]: any } = {}

        if (sortField && sortOrder) {
            sort[sortField as string] = sortOrder === 'desc' ? -1 : 1
        }

        aggregatePipeline.push(
            { $sort: sort },
            { $skip: (Number(pageNumber) - 1) * Number(limitNumber) },
            { $limit: Number(limitNumber) },
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
        const totalPages = Math.ceil(totalOrders / Number(limitNumber))

        const sanitizedOrders = orders.map(sanitizeOrder)

        res.status(200).json({
            sanitizedOrders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(pageNumber),
                pageSize: Number(limitNumber),
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

        const safeQuery=sanitizeQueryParams(req.query);
        const userId = res.locals.user._id
        const pageNumber = Math.max(1, parseInt(safeQuery.page as string) || 1);
        const limitNumber = Math.min(5, Math.max(1, parseInt(safeQuery.limit as string) || 5));
        const searchTerm = safeQuery.search;
        const safeSearch = sanitizeSearch(searchTerm);
        const searchRegex = new RegExp(safeSearch, 'i');
        const searchNumber = Number(safeSearch);
        //const { limit, page, search, ...otherParams } = safeQuery;
        const options = {
            skip: (Number(pageNumber) - 1) * Number(limitNumber),
            limit: Number(limitNumber),
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
            // если не экранировать то получаем Invalid regular expression: /+1/i: Nothing to repeat
            //const searchRegex = new RegExp(search as string, 'i')
            //const searchNumber = Number(search)
            const products = await Product.find({ title: searchRegex })
            const productIds:Types.ObjectId[] = products.map((product) => product._id as Types.ObjectId)

            orders = orders.filter((order) => {
                // eslint-disable-next-line max-len
                const matchesProductTitle = order.products.some((product) =>
                    productIds.some((id:Types.ObjectId) => id.equals(product._id))
                )
                // eslint-disable-next-line max-len
                const matchesOrderNumber =
                    !Number.isNaN(searchNumber) &&
                    order.orderNumber === searchNumber

                return matchesOrderNumber || matchesProductTitle
            })
        }

        const totalOrders = orders.length
        const totalPages = Math.ceil(totalOrders / Number(limitNumber))

        orders = orders.slice(options.skip, options.skip + options.limit)

        const sanitizedOrders = orders.map(sanitizeOrder);

        return res.send({
            sanitizedOrders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(pageNumber),
                pageSize: Number(limitNumber),
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

        const orderNumber = Number(cleanHtml(req.params.orderNumber))
        if (Number.isNaN(orderNumber)) {
            return next(new BadRequestError('Невалидный номер заказа'))
        }

        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        
        const sanitizedOrder = sanitizeOrder(order);
        return res.status(200).json(sanitizedOrder)
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
        const orderNumber = Number(cleanHtml(req.params.orderNumber))
        if (Number.isNaN(orderNumber)) {
            return next(new BadRequestError('Невалидный номер заказа'))
        }

        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        if (!order.customer._id.equals(userId)) {
            // Если нет доступа не возвращаем 403, а отдаем 404
            return next(
                new NotFoundError('Заказ по заданному id отсутствует в базе')
            )
        }

        const sanitizedOrder = sanitizeOrder(order);
        return res.status(200).json(sanitizeOrder)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// POST /product
export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const basket: IProduct[] = []
        const products = await Product.find<IProduct>({})
        const userId = res.locals.user._id

        const cleanOrderData: { [key: string]: any } ={}
        for (let prop in req.body) {
            cleanOrderData[prop]=cleanHtml(req.body[prop])
        }
        
        const { address, payment, phone, total, email, items, comment } =
            cleanOrderData

        const cleanPhone = sanitizeSearch(phone);
        /* const { address, payment, phone, total, email, items, comment } =
            req.body */

        if (!Array.isArray(items) || items.length === 0) {
            return next(new BadRequestError('Нет товаров для заказа'))
        }

        const validItems = items.filter((id: any) => Types.ObjectId.isValid(id))
        if (validItems.length !== items.length) {
            return next(new BadRequestError('Невалидные ID товаров'))
        }

        items.forEach((id: Types.ObjectId) => {
            const product = products.find((p) => (p._id as Types.ObjectId).equals(id))
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
            products: items,
            payment,
            phone:cleanPhone,
            email,
            comment,
            customer: userId,
            deliveryAddress: address,
        })
        const populateOrder = await newOrder.populate(['customer', 'products'])
        await populateOrder.save()

        const sanitizedOrder=sanitizeOrder(populateOrder);
        return res.status(200).json(sanitizedOrder)
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
        const orderNumber = Number(cleanHtml(req.params.orderNumber))
        if (Number.isNaN(orderNumber)) {
            return next(new BadRequestError('Невалидный номер заказа'))
        }

        const safeQuery=sanitizeQueryParams(req.body);
        const { status } = safeQuery

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
        
        const sanitizedOrder=sanitizeOrder(updateOrder)
        return res.status(200).json(sanitizedOrder)
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
        const safeQuery=sanitizeQueryParams(req.params)
        const { id } = safeQuery

         if (!Types.ObjectId.isValid(id)) {
            return next(new BadRequestError('Невалидный ID заказа'))
        }

        const deletedOrder = await Order.findByIdAndDelete(req.params.id)
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])

        const sanitizedOrder=sanitizeOrder(deleteOrder);    
        return res.status(200).json(sanitizedOrder)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}
