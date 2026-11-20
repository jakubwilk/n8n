import { describe, expect, it } from 'vitest';

import forkHoverGradient from './fork-hover-gradient.cjs';

type Ring = { family: string };

const {
	stripFunctionalPseudos,
	isHoverPart,
	isFocusPart,
	toBase,
	classifyHoverBorder,
	classifyHoverShadow,
	classifyFocusBorder,
} = forkHoverGradient as unknown as {
	stripFunctionalPseudos: (selector: string) => string;
	isHoverPart: (part: string) => boolean;
	isFocusPart: (part: string) => boolean;
	toBase: (part: string) => string;
	classifyHoverBorder: (prop: string, value: string) => Ring | null;
	classifyHoverShadow: (value: string) => Ring | null;
	classifyFocusBorder: (
		prop: string,
		value: string,
	) => { kind: 'border' | 'shadow'; family: string } | null;
};

describe('fork-hover-gradient', () => {
	describe('selectors', () => {
		it('removes functional pseudo-classes with nested parentheses', () => {
			expect(stripFunctionalPseudos('.a:hover:not(:has(.b:hover)) .c')).toBe('.a:hover .c');
		});

		it('finds a hover state outside of `:not(...)` only', () => {
			expect(isHoverPart('.card:hover:not(.selected)')).toBe(true);
			expect(isHoverPart('.borderless:not(:hover, :focus-within) .inner')).toBe(false);
		});

		it('finds a focus state outside of `:not(...)` only', () => {
			expect(isFocusPart('.inputWrapper:focus-within')).toBe(true);
			expect(isFocusPart('.selectTrigger:not([data-disabled]):focus-visible')).toBe(true);
			expect(isFocusPart('.inputWrapper:hover:not(:focus-within)')).toBe(false);
		});

		it('gives the element at rest', () => {
			expect(toBase('.inputWrapper:hover:not(.disabled):not(:focus-within)')).toBe('.inputWrapper');
			expect(toBase('.wrapper:hover:has(button) .buttonUp')).toBe('.wrapper .buttonUp');
			expect(toBase('.selectTrigger:not([data-disabled]):focus-visible')).toBe('.selectTrigger');
		});
	});

	describe('classifyHoverBorder', () => {
		it.each([
			['border-color', 'var(--border-color--strong)'],
			['border-color', 'var(--color--primary)'],
			['border-color', 'var(--background--brand)'],
			[
				'border-color',
				'color-mix(in srgb, var(--background--brand) 28%, var(--border-color--subtle))',
			],
		])('adds the ring for %s: %s', (prop, value) => {
			expect(classifyHoverBorder(prop, value)).toEqual({ family: '' });
		});

		it('takes the ring color of a component from its hover variable', () => {
			expect(classifyHoverBorder('border-color', 'var(--input--border-color--hover)')).toEqual({
				family: 'input',
			});
		});

		it.each([
			['border-color', 'transparent'],
			['border-right-color', 'inherit'],
			['border', '0'],
			['border-color', 'var(--border-color--info)'],
			['border-color', 'var(--border-color--warning)'],
			['border-color', 'var(--color--purple-400)'],
			['border', 'var(--border-width) var(--border-style) var(--color--secondary)'],
			['border-color', 'var(--ndv--droppable-parameter--color)'],
			['border-radius', 'var(--radius)'],
		])('keeps the hover look for %s: %s', (prop, value) => {
			expect(classifyHoverBorder(prop, value)).toBeNull();
		});
	});

	describe('classifyHoverShadow', () => {
		it('finds the ring family of a component', () => {
			expect(
				classifyHoverShadow(
					'var(--input--shadow--hover), inset var(--input--border--shadow--hover)',
				),
			).toEqual({ family: 'input' });
		});

		it('accepts a plain 1px ring and skips a selected ring', () => {
			expect(classifyHoverShadow('inset 0 0 0 1px var(--border-color--strong)')).toEqual({
				family: '',
			});
			expect(classifyHoverShadow('inset 0 0 0 1px var(--color--primary)')).toBeNull();
		});
	});

	describe('classifyFocusBorder', () => {
		it('finds the focus border of an input field', () => {
			expect(
				classifyFocusBorder(
					'box-shadow',
					'var(--input--shadow--focus), inset var(--input--border--shadow--focus)',
				),
			).toEqual({ kind: 'shadow', family: 'input' });
			expect(
				classifyFocusBorder(
					'border-color',
					'var(--input--border-color--focus, var(--color--secondary))',
				),
			).toEqual({ kind: 'border', family: 'input' });
		});

		it('ignores a focus rule that keeps the border of the field', () => {
			expect(
				classifyFocusBorder(
					'box-shadow',
					'var(--input--shadow), inset var(--input--border--shadow)',
				),
			).toBeNull();
			expect(classifyFocusBorder('outline', 'var(--focus--border-width) solid red')).toBeNull();
		});
	});
});
