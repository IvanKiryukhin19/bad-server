import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Types} from 'mongoose'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import { sanitizeUser } from '../middlewares/sanitize/sanitizeUser'
import { sanitizeQueryParams } from '../middlewares/sanitize/sanitizeQueryParams'

enum Role {
  Admin = 'admin',
  Customer = 'customer'
}
// TODO: Добавить guard admin
// eslint-disable-next-line max-len
// Get GET /customers?page=2&limit=5&sort=totalAmount&order=desc&registrationDateFrom=2023-01-01&registrationDateTo=2023-12-31&lastOrderDateFrom=2023-01-01&lastOrderDateTo=2023-12-31&totalAmountFrom=100&totalAmountTo=1000&orderCountFrom=1&orderCountTo=10
export const getCustomers = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = res.locals.user;

        if (!user.roles.includes(Role.Admin)) {
            const currentUser = await User.findById(user._id)
                .select('-password')
                .populate(['orders', 'lastOrder'])
                .orFail(() => new NotFoundError('Пользователь не найден'));
            
            return res.status(200).json({
                customers: [currentUser],
                pagination: {
                    totalUsers: 1,
                    totalPages: 1,
                    currentPage: 1,
                    pageSize: 1,
                },
            });
        }

        const safeQuery=sanitizeQueryParams(req.query)    
        const {
            sortField = 'createdAt',
            sortOrder = 'desc',
            registrationDateFrom,
            registrationDateTo,
            lastOrderDateFrom,
            lastOrderDateTo,
            totalAmountFrom,
            totalAmountTo,
            orderCountFrom,
            orderCountTo,
            search,
        } = safeQuery

        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(10, parseInt(req.query.limit as string) || 10);

        const filters: FilterQuery<Partial<IUser>> = {}

        if (registrationDateFrom) {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(registrationDateFrom as string),
            }
        }

        if (registrationDateTo) {
            const endOfDay = new Date(registrationDateTo as string)
            endOfDay.setHours(23, 59, 59, 999)
            filters.createdAt = {
                ...filters.createdAt,
                $lte: endOfDay,
            }
        }

        if (lastOrderDateFrom) {
            filters.lastOrderDate = {
                ...filters.lastOrderDate,
                $gte: new Date(lastOrderDateFrom as string),
            }
        }

        if (lastOrderDateTo) {
            const endOfDay = new Date(lastOrderDateTo as string)
            endOfDay.setHours(23, 59, 59, 999)
            filters.lastOrderDate = {
                ...filters.lastOrderDate,
                $lte: endOfDay,
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

        if (orderCountFrom) {
            filters.orderCount = {
                ...filters.orderCount,
                $gte: Number(orderCountFrom),
            }
        }

        if (orderCountTo) {
            filters.orderCount = {
                ...filters.orderCount,
                $lte: Number(orderCountTo),
            }
        }

        if (search) {
            const searchRegex = new RegExp(search as string, 'i')
            const orders = await Order.find(
                {
                    $or: [{ deliveryAddress: searchRegex }],
                },
                '_id'
            )

            const orderIds = orders.map((order) => order._id)

            filters.$or = [
                { name: searchRegex },
                { lastOrder: { $in: orderIds } },
            ]
        }

        const sort: { [key: string]: any } = {}

        if (sortField && sortOrder) {
            sort[sortField as string] = sortOrder === 'desc' ? -1 : 1
        }

        const options = {
            sort,
            skip: (Number(page) - 1) * Number(limit),
            limit: Number(limit),
        }

        const users = await User.find(filters, null, options).populate([
            'orders',
            {
                path: 'lastOrder',
                populate: {
                    path: 'products',
                },
            },
            {
                path: 'lastOrder',
                populate: {
                    path: 'customer',
                },
            },
        ])

        const totalUsers = await User.countDocuments(filters)
        const totalPages = Math.ceil(totalUsers / Number(limit))

        res.status(200).json({
            customers: users,
            pagination: {
                totalUsers,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(limit),
            },
        })
    } catch (error) {
        next(error)
    }
}

// TODO: Добавить guard admin
// Get /customers/:id
export const getCustomerById = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id } = sanitizeQueryParams(req.params)
        const userLocal = res.locals.user;

        if (!Types.ObjectId.isValid(id)) {
            return next(new NotFoundError('Невалидный ID пользователя'))
        }

        if (!userLocal.roles.includes(Role.Admin) && userLocal._id.toString() !== id) {
            return next(new NotFoundError('Пользователь не найден'));
        }

        const user = await User.findById(req.params.id).populate([
            'orders',
            'lastOrder',
        ])

        if (!user) {
            return next(new NotFoundError('Пользователь не найден'));
        }

        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

// TODO: Добавить guard admin
// Patch /customers/:id
export const updateCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id } = sanitizeQueryParams(req.params)

         if (!Types.ObjectId.isValid(id)) {
            return next(new NotFoundError('Невалидный ID пользователя'))
        }

        const safeParams = sanitizeQueryParams(req.body)
       /*  const updateData: any = {}
        if (safeParams.name) updateData.name = safeParams.name
        if (req.body.phone) updates.phone = xss(req.body.phone.trim())
        if (req.body.email) updates.email = xss(req.body.email.trim()) */

        const updatedUser = await User.findByIdAndUpdate(
            id,
            safeParams,
            {
                new: true,
            }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )
            .populate(['orders', 'lastOrder'])
        res.status(200).json(updatedUser)
    } catch (error) {
        next(error)
    }
}

// TODO: Добавить guard admin
// Delete /customers/:id
export const deleteCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id } = sanitizeQueryParams(req.params)

        if (!Types.ObjectId.isValid(id)) {
            return next(new NotFoundError('Невалидный ID пользователя'))
        }

        const deletedUser = await User.findByIdAndDelete(id).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(deletedUser)
    } catch (error) {
        next(error)
    }
}
