import { NextRequest } from 'next/server';
import { updatePreparationGroup } from '@/lib/services/preparation-groups';
import { customerJson, readCustomerJson, requireSameOrigin } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
export const runtime = 'nodejs';
export async function PATCH(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return customerJson(await updatePreparationGroup(await readCustomerJson(request)));
  } catch (error) { return staffFailure(error); }
}
