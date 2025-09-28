import { cleanHtml } from "./sanitizeHtml"

export const sanitizeOrder = (order: any) => {
  const orderObject = order.toObject ? order.toObject() : order
  return {
    ...orderObject,
    deliveryAddress: cleanHtml(orderObject.deliveryAddress)||'',
    comment: cleanHtml(orderObject)||'',
    email:cleanHtml(orderObject.email)||'',
    phone:cleanHtml(orderObject.phone)||'',
  }
}