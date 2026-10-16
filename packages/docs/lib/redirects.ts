/**
 * Pages that moved keep their old URL. The static export cannot answer a 301, so after the build
 * scripts/redirects.ts writes a small noindex HTML page per entry into out/ (meta refresh, a script
 * and a canonical link to the new page) and the same list into vercel.json, where the hosted deploy
 * answers a real 308. Add a line here when a page moves; never delete one, and always point at the
 * final page (the script refuses chains).
 */
export const redirects: Record<string, string> = {
  '/docs/senders/senders': '/docs/sending/senders',
  '/docs/senders/connect-google': '/docs/sending/email-gmail',
  '/docs/senders/connect-smtp': '/docs/sending/email-smtp',
  '/docs/senders/connect-allo': '/docs/sending/sms-and-calls-allo',
  '/docs/senders/connect-attio': '/docs/sequences/crm-conditions',
  '/docs/senders/connect-linkedin': '/docs/sending/channels',
  '/docs/sequences/task-node': '/docs/sending/call-tasks',
  '/docs/enrollments/tasks': '/docs/sending/call-tasks',
  '/docs/enrollments/enrolling': '/docs/contacts/enrolling',
  '/docs/enrollments/lifecycle': '/docs/contacts/lifecycle',
  '/docs/enrollments/journey': '/docs/contacts/journey',
  '/docs/security/email-compliance': '/docs/sending/deliverability-and-compliance',
  '/docs/security/sms-compliance': '/docs/sending/deliverability-and-compliance',
  '/docs/security/linkedin-automation': '/docs/sending/channels',
  '/docs/get-started/comparison': '/docs',
  '/docs/analytics/honest-comparisons': '/docs/analytics/comparing-channels',
  '/docs/tutorials/integrate-your-crm': '/docs/use-cases/sales-outbound',
  '/docs/tutorials/migrate-from-a-saas-tool': '/docs/use-cases/sales-outbound',
  '/docs/tutorials/build-a-sequence-editor': '/docs/sequences/building-a-canvas',
  '/docs/tutorials/agent-enrollment': '/sdks/mcp',
};
