import { NextRequest } from 'next/server';
import { customerJson, requireSameOrigin, readCustomerJson } from '@/lib/customer-http';
import { staffFailure } from '@/lib/staff-http';
import { saveOptionTemplate, deleteOptionTemplate, duplicateOptionTemplate } from '@/lib/services/option-templates';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: NextRequest, context: Context) { try { requireSameOrigin(request); return customerJson(await saveOptionTemplate(await readCustomerJson(request), (await context.params).id)); } catch (error) { return staffFailure(error); } }
export async function DELETE(request: NextRequest, context: Context) { try { requireSameOrigin(request); return customerJson(await deleteOptionTemplate((await context.params).id)); } catch (error) { return staffFailure(error); } }
export async function POST(request: NextRequest, context: Context) { try { requireSameOrigin(request); return customerJson(await duplicateOptionTemplate((await context.params).id, await readCustomerJson(request))); } catch (error) { return staffFailure(error); } }
