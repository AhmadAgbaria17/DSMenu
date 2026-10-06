import { productionConfigurationIssues } from '../src/lib/production-config';
Object.assign(process.env, { NODE_ENV: 'production' });
const issues = productionConfigurationIssues();
if (issues.length) {
  console.error('Production configuration needs attention:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else console.log('Production configuration syntax is valid. This does not verify provider credentials, database indexes, DNS or live connectivity. Run the launch smoke test.');
