import { requireStaffSession } from '@/lib/staff-context';
import { listOptionTemplates } from '@/lib/services/option-templates';
import { OptionTemplateManagement } from '@/components/dashboard/option-template-management';
export default async function Page() { await requireStaffSession(); return <OptionTemplateManagement initial={await listOptionTemplates()} />; }
