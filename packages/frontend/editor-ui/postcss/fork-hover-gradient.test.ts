import { describe, expect, it } from 'vitest';

import forkHoverGradient from './fork-hover-gradient.cjs';

const { stripFunctionalPseudos, isHoverPart, toBase, classifyHoverBorder, classifyHoverShadow } =
	forkHoverGradient as unknown as {
		stripFunctionalPseudos: (selector: string) => string;
		isHoverPart: (part: string) => boolean;
		toBase: (part: string) => string;
		classifyHoverBorder: (prop: string, value: string) => 'ring' | null;
		classifyHoverShadow: (value: string) => { family: string } | null;
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

		it('gives the element at rest', () => {
			expect(toBase('.inputWrapper:hover:not(.disabled):not(:focus-within)')).toBe('.inputWrapper');
			expect(toBase('.wrapper:hover:has(button) .buttonUp')).toBe('.wrapper .buttonUp');
		});
	});

	describe('classifyHoverBorder', () => {
		it.each([
			['border-color', 'var(--border-color--strong)'],
			['border-color', 'var(--color--primary)'],
			['border-color', 'var(--background--brand)'],
			['border-left-color', 'var(--input--border-color--hover)'],
			[
				'border-color',
				'color-mix(in srgb, var(--background--brand) 28%, var(--border-color--subtle))',
			],
		])('adds the ring for %s: %s', (prop, value) => {
			expect(classifyHoverBorder(prop, value)).toBe('ring');
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
});
