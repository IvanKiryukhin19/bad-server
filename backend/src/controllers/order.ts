import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, Types } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import { cleanHtml } from '../middlewares/sanitize/sanitizeHtml'
import { sanitizeQueryParams } from '../middlewares/sanitize/sanitizeQueryParams'
import { sanitizeAggregationFilters } from '../middlewares/sanitize/sanitizeAggregationParams'
import escapeRegExp from '../utils/escapeRegExp'

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
        
        const user = res.locals.user;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(10, parseInt(req.query.limit as string) || 10);
        const safeQuery = sanitizeQueryParams(req.query);
        const searchTerm = safeQuery.search;
        
        
        if (!user.roles.includes(Role.Admin)) {
            
            const userFilters: FilterQuery<Partial<IOrder>> = { customer: user._id };
            
            if (searchTerm && typeof searchTerm === 'string') {
                const safeSearch = escapeRegExp(searchTerm);
                const searchRegex = new RegExp(safeSearch, 'i');
                const searchNumber = Number(safeSearch);
                
                const products = await Product.find({ title: searchRegex });
                const productIds: Types.ObjectId[] = products.map((product) => product._id as Types.ObjectId);
                
                const userOrders = await Order.find(userFilters).populate('products');
                
                let filteredOrders = userOrders.filter(order => {
                    const matchesProduct = order.products.some(product => 
                        productIds.some((id: Types.ObjectId) => id.equals(product._id))
                    );
                    const matchesOrderNumber = !Number.isNaN(searchNumber) && order.orderNumber === searchNumber;
                    return matchesProduct || matchesOrderNumber;
                });
                
                const totalOrders = filteredOrders.length;
                const totalPages = Math.ceil(totalOrders / limit);
                filteredOrders = filteredOrders.slice(
                    (page - 1) * limit,
                    page * limit
                );
                
                return res.status(200).json({
                    orders: filteredOrders,
                    pagination: {
                        totalOrders,
                        totalPages,
                        currentPage: page,
                        pageSize: limit,
                    },
                });
            }
            
            
            const userOrders = await Order.find(userFilters)
                .populate(['customer', 'products'])
                .skip((page - 1) * limit)
                .limit(limit);
            
            const totalOrders = await Order.countDocuments(userFilters);
            const totalPages = Math.ceil(totalOrders / limit);
                        
            return res.status(200).json({
                orders: userOrders,
                pagination: {
                    totalOrders,
                    totalPages,
                    currentPage: Number(page),
                    pageSize: Number(limit),
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
        } = sanitizeQueryParams(req.query)

        const filters: FilterQuery<Partial<IOrder>> = {}

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

        if (orderDateFrom && typeof orderDateFrom === 'string') {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(orderDateFrom),
            }
        }

        if (orderDateTo && typeof orderDateTo === 'string') {
            filters.createdAt = {
                ...filters.createdAt,
                $lte: new Date(orderDateTo),
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
            const safeSearch = escapeRegExp(searchTerm);
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
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) },
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

        res.status(200).json({
            orders: orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(limit),
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
        const { search, ...otherParams } = req.query;
        const safeQuery = sanitizeQueryParams(req.query);

        const userId = res.locals.user._id
        const searchTerm = safeQuery.search;

        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(10, parseInt(req.query.limit as string) || 10);
        const options = {
            skip: (Number(page) - 1) * Number(limit),
            limit: Number(limit),
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
            const safeSearch = escapeRegExp(searchTerm)
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
        const totalPages = Math.ceil(totalOrders / Number(limit))

        orders = orders.slice(options.skip, options.skip + options.limit)

        return res.send({
            orders: orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(limit),
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
        
        return res.status(200).json(order)
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
        
        return res.status(200).json(order)
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
        
        const { address, payment, phone, total, email, items, comment } = req.body
        const sanitizedAddress = cleanHtml(address.trim())
        const sanitizedPhone = cleanHtml(phone.trim())
        const sanitizedEmail = cleanHtml(email.trim())
        const sanitizedComment = comment ? cleanHtml(comment.trim()) : ''

        if (!Array.isArray(items) || items.length === 0) {
            return next(new BadRequestError('Не указаны товары для заказа'))
        }

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

        return res.status(200).json(populateOrder)
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
        
        return res.status(200).json(updatedOrder)
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
        
        return res.status(200).json(deletedOrder)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}