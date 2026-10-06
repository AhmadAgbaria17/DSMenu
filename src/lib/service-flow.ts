import { z } from 'zod';
import { serviceTypes, serviceStatuses } from '@/types/domain';
import type { ServiceStatus, ServiceCallDto } from '@/types/service-calls';
export const SERVICE_COOLDOWN_MS = 30_000;
export const serviceInput = z.object({ type: z.enum(serviceTypes) }).strict();
export const serviceStatusInput = z.object({ expectedStatus: z.enum(serviceStatuses), status: z.enum(serviceStatuses) }).strict();
const transitions: Record<ServiceStatus, readonly ServiceStatus[]> = { PENDING: ['ACKNOWLEDGED', 'RESOLVED'], ACKNOWLEDGED: ['RESOLVED'], RESOLVED: [] };
export function canChangeService(from: ServiceStatus, to: ServiceStatus) { return transitions[from].includes(to); }
export function unseenServiceCalls(seen: Set<string>, calls: Pick<ServiceCallDto, 'id' | 'status'>[], silent: boolean) {
  const fresh = calls.filter(call => call.status === 'PENDING' && !seen.has(call.id));
  calls.forEach(call => seen.add(call.id));
  return silent ? [] : fresh.map(call => call.id);
}
