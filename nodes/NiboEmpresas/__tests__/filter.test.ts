import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../resources/shared/filter';
import { filterProperties } from '../resources/shared/filter';

/**
 * The shared filter factory, asked directly rather than through a resource.
 *
 * Every resource's menu is checked in `description.test.ts`, where it belongs —
 * this is about the factory itself, and about the one thing v0.7.0 adds to it:
 * a field whose values come from a closed list.
 */
function rowOf(fields: IFilterField[], defaultField: string): INodeProperties[] {
	const [filters] = filterProperties({ resources: ['thing'], fields, defaultField });
	const collections = (filters.options ?? []) as Array<{ name: string; values: INodeProperties[] }>;

	return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
}

function optionValues(field: INodeProperties | undefined): string[] {
	return ((field?.options ?? []) as INodePropertyOptions[]).map((option) => option.value as string);
}

/** The declaration of a named field drawn for a given path */
function drawnFor(row: INodeProperties[], name: string, path: string): INodeProperties | undefined {
	return row.find(
		(field) =>
			field.name === name && ((field.displayOptions?.show?.field ?? []) as string[]).includes(path),
	);
}

const TYPE: IFilterField = {
	label: 'Type',
	path: 'type',
	type: 'options',
	choices: [
		{ name: 'Expense', value: 'out' },
		{ name: 'Revenue', value: 'in' },
	],
};

describe('filterProperties — a field whose values come from a closed list', () => {
	const row = rowOf([TYPE, { label: 'Name', path: 'name', type: 'text' }], 'name');

	it('collects the value in a list rather than a text box', () => {
		const box = drawnFor(row, 'optionsValue', 'type');

		expect(box?.type).toBe('options');
		expect(box?.displayName).toBe('Value');
		expect(optionValues(box)).toEqual(['out', 'in']);
	});

	// A row added and left untouched has to be a whole condition, so the box
	// starts on a real choice — and on the first, which is the menu's own order.
	it('starts the list on its first choice', () => {
		expect(drawnFor(row, 'optionsValue', 'type')?.default).toBe('out');
	});

	// Two, and no more: a list of a few words has nothing to be greater than.
	it('offers such a field only Is and Is Not', () => {
		expect(optionValues(drawnFor(row, 'operator', 'type'))).toEqual(['eq', 'ne']);
	});

	it('leaves the text field of the same menu exactly as it was', () => {
		expect(drawnFor(row, 'value', 'name')?.type).toBe('string');
		expect(optionValues(drawnFor(row, 'operator', 'name'))).toContain('contains');
	});

	/**
	 * One declaration per field, not one per type. Two lists in one menu do not
	 * hold the same choices, and a single shared box would offer one field the
	 * other's answers — which the API would then reject for a reason nobody could
	 * see on the screen.
	 */
	it('gives each list its own box, so two of them never share choices', () => {
		const second: IFilterField = {
			label: 'Status',
			path: 'status',
			type: 'options',
			choices: [{ name: 'Open', value: 'open' }],
		};
		const both = rowOf([TYPE, second], 'type');

		expect(optionValues(drawnFor(both, 'optionsValue', 'type'))).toEqual(['out', 'in']);
		expect(optionValues(drawnFor(both, 'optionsValue', 'status'))).toEqual(['open']);
	});
});

/**
 * The other half of the promise this factory makes: a kind of field a menu does
 * not have is not declared at all. A box the editor can never draw is a box
 * that can only confuse whoever reads the node.
 */
describe('filterProperties — what a menu without such a field draws', () => {
	const row = rowOf(
		[
			{ label: 'Name', path: 'name', type: 'text' },
			{ label: 'Is Archived', path: 'isArchived', type: 'boolean' },
		],
		'name',
	);

	it.each(['optionsValue', 'numberValue', 'dateValue'])('declares no %s', (name) => {
		expect(row.some((field) => field.name === name)).toBe(false);
	});

	it('still declares the boxes the menu does have', () => {
		expect(row.some((field) => field.name === 'value')).toBe(true);
		expect(row.some((field) => field.name === 'booleanValue')).toBe(true);
	});
});
