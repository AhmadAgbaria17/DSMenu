import type { serviceTypes, serviceStatuses } from './domain';
import type { RealtimeConfig } from './live-orders';
export type ServiceType = (typeof serviceTypes)[number];
export type ServiceStatus = (typeof serviceStatuses)[number];
export type ServiceCallDto = { id: string; type: ServiceType; status: ServiceStatus; createdAt: string; acknowledgedAt: string | null; resolvedAt: string | null };
export type StaffServiceCall = ServiceCallDto & { tableNumber: number | null; tableSessionId: string };
export type ServiceSnapshot = { calls: StaffServiceCall[]; realtime: RealtimeConfig | null; fetchedAt: string };
export type CustomerServiceSnapshot = { calls: ServiceCallDto[] };
