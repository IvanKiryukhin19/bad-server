import { Router } from 'express'
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'
import auth from '../middlewares/auth'
import { roleGuardMiddleware } from '../middlewares/auth'
import { Role } from '../models/user'

const customerRouter = Router()

customerRouter.get('/', auth, roleGuardMiddleware(Role.Admin), getCustomers)
customerRouter.get('/:id', auth, roleGuardMiddleware(Role.Admin), getCustomerById)
customerRouter.patch('/:id', auth, roleGuardMiddleware(Role.Admin), updateCustomer)
customerRouter.delete('/:id', auth, roleGuardMiddleware(Role.Admin), deleteCustomer)
customerRouter.get('/me', auth, getCustomerById)
customerRouter.patch('/me', auth, updateCustomer)

export default customerRouter
