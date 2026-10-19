import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
import { copyTemplateGroup } from '@/lib/services/option-templates';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireSameOrigin(request); return customerJson(await copyTemplateGroup((await context.params).id)); } catch (error) { return staffFailure(error); } }
