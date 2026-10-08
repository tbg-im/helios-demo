import type { TBClient } from './client/TBClient';
import type { Collection, Field } from './client/types';

/**
 * Declares the collections and fields an app depends on, and resolves them
 * against an account once — instead of scattering `fields.find(f => f.name === …)`
 * through the code.
 *
 * Names are how you *find* a collection or field the first time; IDs are how
 * you should *keep* it. Admins rename fields ("Location" → "Facility"), and an
 * app that looks everything up by name on every request breaks the moment
 * they do. So each spec can carry the `id` once you know it: a pinned id wins,
 * and the name is only the fallback. Resolve once, copy the ids from the
 * `issues`/`collections` output into the spec, and commit them.
 *
 * Missing fields are reported, not thrown: `issues` lists every collection or
 * field that could not be resolved, and `ready` is false only when a
 * `required` one is missing. Render a setup notice for those (see the demo in
 * `app/page.tsx`) and degrade the feature that needs an optional one.
 *
 * @example
 *   export const schema = defineSchema({
 *     shifts: {
 *       name: 'Shifts',
 *       fields: {
 *         start: { name: 'Start Time', type: 'DATETIME', required: true },
 *         assignee: { name: 'Assignee', type: 'LINK_TO_USER' },
 *       },
 *     },
 *   });
 *
 *   const { accountId } = await getTBContext();
 *   const resolved = await resolveSchema(getTBClient(), schema, { cacheKey: accountId });
 *   const startField = resolved.collections.shifts.fields.start; // Field | null
 */

export interface FieldSpec {
  /** Field name as shown in Teambridge — matched exactly, case-insensitively */
  name: string;
  /** Pinned field UUID. Takes precedence over `name`. */
  id?: string;
  /** Expected public type(s). Used to pick between fields that share a name, and to reject a wrong one. */
  type?: string | string[];
  /** When true, the app cannot work without it and `ready` is false if it is missing. */
  required?: boolean;
}

export interface CollectionSpec {
  name: string;
  id?: string;
  /** Defaults to true — most apps cannot do anything without their collections. */
  required?: boolean;
  fields: Record<string, FieldSpec>;
}

export type SchemaSpec = Record<string, CollectionSpec>;

export type ResolvedSchema<S extends SchemaSpec> = {
  /** True when every required collection and field resolved. */
  ready: boolean;
  collections: {
    [K in keyof S]: {
      /** Null when the collection could not be found. */
      id: string | null;
      name: string;
      fields: { [F in keyof S[K]['fields']]: Field | null };
    };
  };
  issues: SchemaIssue[];
};

export interface SchemaIssue {
  kind: 'missing-collection' | 'missing-field' | 'wrong-type' | 'duplicate-name' | 'pinned-id-not-found' | 'renamed';
  /** Whether this issue stops the app working (a required item is unresolved). */
  blocking: boolean;
  collection: string;
  field?: string;
  /** Plain-language description, safe to show an admin. */
  message: string;
}

export function defineSchema<S extends SchemaSpec>(spec: S): S {
  return spec;
}

const SCHEMA_TTL_MS = 5 * 60_000;
type CacheEntry = { expiresAt: number; value: Promise<unknown> };
// Keyed by the spec object first, so two specs resolved for one account never share an entry.
const schemaCache = new WeakMap<SchemaSpec, Map<string, CacheEntry>>();

/**
 * Resolve a schema spec against the account. Cached per `cacheKey` for five
 * minutes, and concurrent callers share one in-flight resolution — so several
 * components on one page asking at once cost one `collections.list` and one
 * `getFields` per collection, not one each.
 *
 * `cacheKey` should be the `accountId`. Never key on `userContext`: it is
 * re-signed on every request, so every key would be unique and nothing would
 * ever be cached.
 */
export function resolveSchema<S extends SchemaSpec>(
  client: TBClient,
  spec: S,
  options: { cacheKey: string }
): Promise<ResolvedSchema<S>> {
  const key = options.cacheKey;
  let bySpec = schemaCache.get(spec);
  if (!bySpec) {
    bySpec = new Map();
    schemaCache.set(spec, bySpec);
  }
  const now = Date.now();
  const cached = bySpec.get(key);
  if (cached && cached.expiresAt > now) return cached.value as Promise<ResolvedSchema<S>>;

  // Drop every expired entry, not just this one, so accounts that stop
  // calling don't stay in memory for the life of the server.
  for (const [cachedKey, entry] of bySpec) {
    if (entry.expiresAt <= now) bySpec.delete(cachedKey);
  }

  const value = resolveUncached(client, spec);
  bySpec.set(key, { expiresAt: now + SCHEMA_TTL_MS, value });
  value.catch(() => bySpec.delete(key));
  return value;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const typesOf = (spec: FieldSpec) => (spec.type ? (Array.isArray(spec.type) ? spec.type : [spec.type]) : null);

async function resolveUncached<S extends SchemaSpec>(client: TBClient, spec: S): Promise<ResolvedSchema<S>> {
  const issues: SchemaIssue[] = [];
  const allCollections = await client.collections.list();

  const entries = await Promise.all(
    Object.entries(spec).map(async ([key, collectionSpec]) => {
      const collectionRequired = collectionSpec.required ?? true;
      const collection = findCollection(allCollections, collectionSpec, issues, collectionRequired);
      const fields: Record<string, Field | null> = {};

      if (!collection) {
        for (const fieldKey of Object.keys(collectionSpec.fields)) fields[fieldKey] = null;
        return [key, { id: null, name: collectionSpec.name, fields }] as const;
      }

      const available = await client.collections.getFields(collection.id);
      for (const [fieldKey, fieldSpec] of Object.entries(collectionSpec.fields)) {
        fields[fieldKey] = findField(available, collection.name, fieldSpec, issues, collectionRequired);
      }
      return [key, { id: collection.id, name: collection.name, fields }] as const;
    })
  );

  return {
    ready: !issues.some((issue) => issue.blocking),
    collections: Object.fromEntries(entries) as ResolvedSchema<S>['collections'],
    issues,
  };
}

function findCollection(
  all: Collection[],
  spec: CollectionSpec,
  issues: SchemaIssue[],
  required: boolean
): Collection | null {
  if (spec.id) {
    const byId = all.find((c) => c.id === spec.id);
    if (byId) {
      if (!same(byId.name, spec.name)) {
        issues.push({
          kind: 'renamed',
          blocking: false,
          collection: spec.name,
          message: `The "${spec.name}" collection is now called "${byId.name}".`,
        });
      }
      return byId;
    }
    issues.push({
      kind: 'pinned-id-not-found',
      blocking: false,
      collection: spec.name,
      message: `No collection has the pinned id ${spec.id}; falling back to the name "${spec.name}".`,
    });
  }

  const byName = all.filter((c) => same(c.name, spec.name));
  if (byName.length > 1) {
    issues.push({
      kind: 'duplicate-name',
      blocking: false,
      collection: spec.name,
      message: `${byName.length} collections are named "${spec.name}". Pin the right one's id in the schema.`,
    });
  }
  if (byName[0]) return byName[0];

  issues.push({
    kind: 'missing-collection',
    blocking: required,
    collection: spec.name,
    message: `This app needs a "${spec.name}" collection, and the account doesn't have one.`,
  });
  return null;
}

function findField(
  available: Field[],
  collectionName: string,
  spec: FieldSpec,
  issues: SchemaIssue[],
  collectionRequired: boolean
): Field | null {
  const blocking = collectionRequired && Boolean(spec.required);
  const types = typesOf(spec);
  const typeOk = (f: Field) => !types || types.includes(f.type);

  if (spec.id) {
    const byId = available.find((f) => f.id === spec.id);
    if (byId) {
      if (!same(byId.name, spec.name)) {
        issues.push({
          kind: 'renamed',
          blocking: false,
          collection: collectionName,
          field: spec.name,
          message: `"${collectionName} → ${spec.name}" is now called "${byId.name}".`,
        });
      }
      return byId;
    }
    issues.push({
      kind: 'pinned-id-not-found',
      blocking: false,
      collection: collectionName,
      field: spec.name,
      message: `No field on "${collectionName}" has the pinned id ${spec.id}; falling back to the name "${spec.name}".`,
    });
  }

  // Field names are not unique within a collection. Narrow by type before
  // picking, so which field wins never depends on the order the API returns.
  const byName = available.filter((f) => same(f.name, spec.name));
  const candidates = byName.filter(typeOk);

  if (candidates.length > 1) {
    issues.push({
      kind: 'duplicate-name',
      blocking: false,
      collection: collectionName,
      field: spec.name,
      message: `"${collectionName}" has ${candidates.length} fields named "${spec.name}". Pin the right one's id in the schema.`,
    });
  }
  if (candidates[0]) return candidates[0];

  if (byName.length > 0) {
    issues.push({
      kind: 'wrong-type',
      blocking,
      collection: collectionName,
      field: spec.name,
      message: `"${collectionName} → ${spec.name}" is a ${byName[0].type} field; this app expects ${types!.join(' or ')}.`,
    });
    return null;
  }

  issues.push({
    kind: 'missing-field',
    blocking,
    collection: collectionName,
    field: spec.name,
    message: `"${collectionName}" has no "${spec.name}" field${types ? ` (${types.join(' or ')})` : ''}.`,
  });
  return null;
}

/**
 * Encode a value for writing to `field`, following the field's
 * `writeFormatHint` and type. Throws for read-only fields, which the API
 * rejects (often as an unhelpful 500).
 *
 *  - `comma_separated_uuids` (multi link fields such as a user's Locations or
 *    Roles): a single string `"id1,id2"`. A one-element JSON array happens to
 *    work, so an array bug only shows up with two or more ids. Empty → `null`.
 *  - `single_uuid`: one id string.
 *  - DATETIME: an ISO string with a timezone (`…Z`). A bare
 *    `2026-06-01T09:00` from `<input type="datetime-local">` has none.
 */
export function toWriteValue(field: Field, value: unknown): unknown {
  if (field.readOnly) {
    throw new Error(`"${field.name}" is read-only in Teambridge and can't be written by an app.`);
  }
  if (value === undefined || value === null || value === '') return null;

  if (field.writeFormatHint === 'comma_separated_uuids') {
    const ids = readIds(value);
    return ids.length > 0 ? ids.join(',') : null;
  }
  if (field.writeFormatHint === 'single_uuid') {
    return readIds(value)[0] ?? null;
  }
  if (field.type === 'DATETIME') {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error(`"${field.name}" needs a valid date and time.`);
    return date.toISOString();
  }
  return value;
}

/**
 * Read link / select values as a list of ids. Multi-selects and multi links
 * read back as JSON arrays, single ones as a bare string, and some as a
 * comma-joined string — handle all three or values silently resolve to nothing.
 */
export function readIds(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string' ? [item] : item && typeof item === 'object' && 'id' in item ? [String(item.id)] : []
    );
  }
  if (typeof value === 'string') return value.split(',').map((id) => id.trim()).filter(Boolean);
  if (typeof value === 'object' && 'id' in value) return [String((value as { id: unknown }).id)];
  return [];
}
