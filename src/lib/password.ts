import { compare, hash } from 'bcryptjs';
import { passwordSchema } from './validators/staff';

export const BCRYPT_COST = 12;
export async function hashPassword(password: string) {
  return hash(passwordSchema.parse(password), BCRYPT_COST);
}
export async function verifyPassword(password: string, passwordHash: string) {
  return passwordSchema.safeParse(password).success && compare(password, passwordHash);
}
