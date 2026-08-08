import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * A dictionary keyed by where a label sits, not by what it says.
 *
 * Keying by the English text would collapse everything the API calls "Name" or
 * "Description" into one entry, and those read differently per resource. The
 * key is a path instead:
 *
 *   `<resource>.<parameter>`                 a field's own labels
 *   `<resource>.<parameter>.<option value>`  one entry of a dropdown
 *   `<resource>.<parameter>.<field>`         a field inside a collection
 *
 * The resource comes from `displayOptions.show.resource`, which every
 * per-resource parameter already carries; parameters shown for every resource
 * (Authentication, Resource itself) sit under `_`.
 */
export type Translations = Record<string, Record<string, string>>;

/** Translatable on a parameter. `name` is absent by design: it is the key n8n stores. */
const PROPERTY_FIELDS = ['displayName', 'description', 'placeholder', 'hint'] as const;

/** Translatable on a dropdown entry. `value` is absent for the same reason. */
const OPTION_FIELDS = ['name', 'description', 'action'] as const;

const SHARED_SCOPE = '_';

/**
 * Returns properties with every known label swapped, and the originals
 * untouched: nothing is mutated, and any subtree with no translation is
 * returned by reference. With an empty dictionary this is the identity
 * function, which is what the English build pays.
 */
export function localizeProperties(
	properties: INodeProperties[],
	dictionary: Translations,
): INodeProperties[] {
	if (Object.keys(dictionary).length === 0) return properties;

	return properties.map((property) =>
		localizeProperty(property, dictionary, `${scopeOf(property)}.${property.name}`),
	);
}

function scopeOf(property: INodeProperties): string {
	const resources = property.displayOptions?.show?.resource;

	return typeof resources?.[0] === 'string' ? resources[0] : SHARED_SCOPE;
}

function localizeProperty(
	property: INodeProperties,
	dictionary: Translations,
	path: string,
): INodeProperties {
	const translated = translateFields(property, PROPERTY_FIELDS, dictionary[path]);

	if (!Array.isArray(property.options)) return translated;

	let changed = translated !== property;
	const options = property.options.map((entry) => {
		const localized = isDropdownEntry(entry)
			? translateFields(entry, OPTION_FIELDS, dictionary[`${path}.${String(entry.value)}`])
			: localizeProperty(entry as INodeProperties, dictionary, `${path}.${entry.name}`);

		changed = changed || localized !== entry;

		return localized;
	});

	if (!changed) return property;

	return { ...translated, options } as INodeProperties;
}

/** A dropdown entry carries a `value`; anything else in `options` is a nested field. */
function isDropdownEntry(entry: unknown): entry is INodePropertyOptions {
	return typeof entry === 'object' && entry !== null && 'value' in entry;
}

function translateFields<T>(
	target: T,
	fields: readonly string[],
	texts: Record<string, string> | undefined,
): T {
	if (!texts) return target;

	const source = target as unknown as Record<string, unknown>;
	let copy: Record<string, unknown> | undefined;

	for (const field of fields) {
		// A dictionary entry for a field the parameter does not have is a
		// mistake in the dictionary, not a new label to invent.
		if (texts[field] === undefined || source[field] === undefined) continue;

		copy = copy ?? { ...source };
		copy[field] = texts[field];
	}

	return (copy ?? source) as unknown as T;
}
