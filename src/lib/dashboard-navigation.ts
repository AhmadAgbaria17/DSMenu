export const dashboardSections = ['orders', 'tables', 'analytics', 'categories', 'products', 'service-calls', 'qr-codes', 'settings'] as const;
export const dashboardNavigation = ['overview', ...dashboardSections] as const;
