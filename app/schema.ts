/**
 * Everything this app writes in Teambridge: a demo visitor becomes a user in
 * the account the app's credentials belong to. These are the Users
 * collection's built-in fields, so every account has them under these names
 * unless an admin renamed one. See AGENTS.md → "Field mapping".
 */
import { defineSchema } from '@/lib/teambridge/schema';

export const schema = defineSchema({
  users: {
    name: 'Users',
    fields: {
      firstName: { name: 'First Name', required: true },
      lastName: { name: 'Last Name', required: true },
      phone: { name: 'Phone', type: 'PHONE', required: true },
    },
  },
});
