import type { InferSchemaType, Types } from 'mongoose';
import { ServiceCall } from '@/models';
import type { ServiceCallDto } from '@/types/service-calls';
export function serviceDto(call: InferSchemaType<typeof ServiceCall.schema> & { _id: Types.ObjectId }): ServiceCallDto {
  return { id: String(call._id), type: call.type, status: call.status, createdAt: call.createdAt.toISOString(), acknowledgedAt: call.acknowledgedAt?.toISOString() ?? null, resolvedAt: call.resolvedAt?.toISOString() ?? null };
}
