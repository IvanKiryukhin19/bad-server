import { cleanHtml } from "./sanitizeHtml"

export const sanitizeUser = (user: any) => {
  const userObject = user.toObject ? user.toObject() : user
  return {
    ...userObject,
    name: cleanHtml(userObject.name)||'',
    email:cleanHtml(userObject.email)||'',
    phone:userObject.phone ? cleanHtml(userObject.phone) : undefined,
  }
}