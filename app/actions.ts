'use server';

import { getTBClient, TBApiError } from '@/lib/teambridge';
import { resolveSchema, toWriteValue } from '@/lib/teambridge/schema';
import { schema } from './schema';

type DemoField = 'firstName' | 'lastName' | 'phone';

export type DemoSignupState =
  | { status: 'idle' }
  | {
      status: 'error';
      message: string;
      fields?: Partial<Record<DemoField, string>>;
      values: Record<DemoField, string>;
    }
  | { status: 'created' | 'existing'; firstName: string };

const MAX_NAME_LENGTH = 60;

// One format for both the write and the duplicate lookup, which matches the stored value exactly.
// Ten digits are read as a US number.
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Adds a demo visitor to the account as a user. The page is public, so this
 * runs with the app's own credentials rather than a signed-in user's.
 */
export async function signUpForDemo(_prev: DemoSignupState, formData: FormData): Promise<DemoSignupState> {
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const phoneInput = String(formData.get('phone') ?? '');
  const values = { firstName, lastName, phone: phoneInput };

  // Hidden from people; bots fill every field. Answer as if it worked.
  if (String(formData.get('company') ?? '') !== '') {
    return { status: 'created', firstName };
  }

  const fields: Partial<Record<DemoField, string>> = {};
  if (!firstName) fields.firstName = 'Enter your first name.';
  else if (firstName.length > MAX_NAME_LENGTH) fields.firstName = 'Use a shorter first name.';
  if (!lastName) fields.lastName = 'Enter your last name.';
  else if (lastName.length > MAX_NAME_LENGTH) fields.lastName = 'Use a shorter last name.';
  const phone = toE164(phoneInput);
  if (!phone) fields.phone = 'Enter a mobile number, like (555) 123-4567.';
  if (Object.keys(fields).length > 0 || !phone) {
    return { status: 'error', message: 'Check the highlighted fields.', fields, values };
  }

  if (!process.env.TB_CLIENT_ID || !process.env.TB_CLIENT_SECRET) {
    console.error('[signUpForDemo] TB_CLIENT_ID and TB_CLIENT_SECRET are not set');
    return { status: 'error', message: "The demo isn't set up yet. Please let the person running it know.", values };
  }

  try {
    const client = getTBClient();
    // The app's credentials belong to one account, so one cache entry covers it.
    const resolved = await resolveSchema(client, schema, { cacheKey: 'app-account' });
    const users = resolved.collections.users;
    const { firstName: firstField, lastName: lastField, phone: phoneField } = users.fields;
    if (!resolved.ready || !users.id || !firstField || !lastField || !phoneField) {
      console.error('[signUpForDemo] schema not ready', resolved.issues);
      return { status: 'error', message: "The demo isn't set up yet. Please let the person running it know.", values };
    }

    if (await client.users.lookup({ phone })) {
      return { status: 'existing', firstName };
    }

    await client.collections.records.create(users.id, {
      [firstField.id]: toWriteValue(firstField, firstName),
      [lastField.id]: toWriteValue(lastField, lastName),
      [phoneField.id]: toWriteValue(phoneField, phone),
    });
    return { status: 'created', firstName };
  } catch (e) {
    console.error('[signUpForDemo]', e);
    if (e instanceof TBApiError && e.status === 403) {
      return {
        status: 'error',
        message: "The demo isn't allowed to add people yet. Please let the person running it know.",
        values,
      };
    }
    if (e instanceof TBApiError && e.status === 400) {
      return { status: 'error', message: "That number couldn't be saved. Check it and try again.", values };
    }
    return { status: 'error', message: "Couldn't add you just now. Try again in a moment.", values };
  }
}
