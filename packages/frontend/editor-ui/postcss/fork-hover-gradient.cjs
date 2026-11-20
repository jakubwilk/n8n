// @ts-check
/**
 * Fork-only PostCSS plugin (jakubwilk/n8n): animated gradient border on hover.
 *
 * When a rule changes a border on `:hover`, this plugin adds a ring with an
 * animated pink and grey gradient. The element looks the same at rest. No
 * upstream style file changes.
 *
 * - A `border` color on hover: a `::after` ring takes the border widths of its
 *   element, so it covers the same sides and keeps the round corners.
 * - A ring drawn with `box-shadow` on hover (inputs, buttons): a 1px `::after` ring.
 * - An element that cannot have `::after` (`<input>`), or where the file already
 *   styles both `::after` and `::before`: a static `border-image`.
 *
 * Hover borders with a meaning keep their color: error, warning, info, success,
 * selected, active, dragging, drop targets, disabled, and the node creator.
 *
 * The tokens and the animation are in `src/app/css/fork/_hover-gradient.scss`.
 */

/** Files that keep their hover borders: the node canvas, the node creator, third-party styles. */
const EXCLUDED_FILES = [
	/\/features\/workflows\/canvas\//,
	/\/features\/shared\/nodeCreator\//,
	/\/node_modules\//,
];

/** Border shorthands and color longhands. Not width, style, radius or image. */
const BORDER_PROP = /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/;

/** A hover color that carries a meaning, or no visible border. The border keeps it. */
const KEEP_VALUE =
	/transparent|inherit|currentcolor|\$node-creator|--color--(secondary|danger|success|warning|alert|purple)|--(border-color|color)--(info|warning|danger|success|error)|droppable|--color--background\b|^\s*(none|0|0px|unset|initial)\s*$/i;

/** A selector part for a state that keeps its look on hover. */
const KEEP_SELECTOR =
	/disabled|selected|active|checked|dragging|connected|warning|error|::?(before|after)\b/i;

/** `var(--input--border--shadow--hover)` gives the ring family `input`. */
const SHADOW_RING_FAMILY = /var\(--([a-z0-9-]+?)--border--shadow--hover\)/;
/** A 1px ring drawn with `box-shadow`, for example `inset 0 0 0 1px var(--border-color--strong)`. */
const SHADOW_RING_PLAIN = /\b0 0 0 1px\s+(var\([^)]*\)|[^,]+)/;

/** Elements with no `::after`. */
const REPLACED_ELEMENT = /(^|[\s>+~])(input|textarea|select|img)\b|__inner\b/;

/** `--input--border-color--hover` gives the ring family `input`. */
const HOVER_COLOR_VAR = /^--([a-z0-9-]+?)--border-color--hover$/;

const GRADIENT =
	'conic-gradient(from var(--fork-hover-angle), var(--background--brand), var(--border-color--strong), var(--background--brand))';

/**
 * Removes `:not(...)`, `:has(...)`, `:is(...)` and `:where(...)` with their content.
 * @param {string} selector
 */
function stripFunctionalPseudos(selector) {
	let result = '';
	for (let i = 0; i < selector.length; i++) {
		const match = /^:(not|has|is|where)\(/.exec(selector.slice(i));
		if (!match) {
			result += selector[i];
			continue;
		}
		let depth = 0;
		let j = i + match[0].length - 1;
		for (; j < selector.length; j++) {
			if (selector[j] === '(') depth++;
			else if (selector[j] === ')' && --depth === 0) break;
		}
		i = j;
	}
	return result;
}

/**
 * True when the part itself is in a hover state, not only inside `:not(...)`.
 * @param {string} part
 */
const isHoverPart = (part) => /:hover\b/.test(stripFunctionalPseudos(part));

/**
 * The element at rest: the part without `:hover` and without functional pseudos.
 * @param {string} part
 */
const toBase = (part) =>
	stripFunctionalPseudos(part)
		.replace(/:hover\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * @param {string} prop
 * @param {string} value
 * @returns {'ring' | null}
 */
function classifyHoverBorder(prop, value) {
	if (!BORDER_PROP.test(prop)) return null;
	if (KEEP_VALUE.test(value)) return null;
	// A width or a style alone does not change the color
	if (!/var\(|#|\(|[a-z]{4,}/i.test(value.replace(/\b(solid|dashed|dotted)\b/g, ''))) return null;
	return 'ring';
}

/**
 * @param {string} value
 * @returns {{ family: string } | null}
 */
function classifyHoverShadow(value) {
	const family = SHADOW_RING_FAMILY.exec(value)?.[1];
	if (family) return { family };
	const plain = SHADOW_RING_PLAIN.exec(value)?.[1];
	if (plain && !KEEP_VALUE.test(plain) && !/--color--primary/.test(plain)) return { family: '' };
	return null;
}

/**
 * Bases that already style `::after` or `::before` in this file.
 * @param {import('postcss').Root} root
 */
function pseudoUsage(root) {
	/** @type {{ after: Set<string>; before: Set<string> }} */
	const usage = { after: new Set(), before: new Set() };
	root.walkRules((rule) => {
		for (const part of rule.selectors) {
			const match = /^(.*?)::?(after|before)\b/.exec(part);
			if (match) usage[/** @type {'after' | 'before'} */ (match[2])].add(toBase(match[1]));
		}
	});
	return usage;
}

/** @param {import('postcss').Rule} rule */
function isInKeyframes(rule) {
	/** @type {import('postcss').Container | import('postcss').Document | undefined} */
	let parent = rule.parent;
	while (parent) {
		if (
			parent.type === 'atrule' &&
			/keyframes$/i.test(/** @type {import('postcss').AtRule} */ (parent).name)
		) {
			return true;
		}
		parent = parent.parent;
	}
	return false;
}

/** @type {import('postcss').PluginCreator<{ exclude?: RegExp[] }>} */
const forkHoverGradient = (options = {}) => {
	const excluded = [...EXCLUDED_FILES, ...(options.exclude ?? [])];

	return {
		postcssPlugin: 'fork-hover-gradient',
		Once(root) {
			const file = (root.source?.input.file ?? '').replace(/\\/g, '/');
			if (excluded.some((pattern) => pattern.test(file))) return;

			const usage = pseudoUsage(root);
			/** @type {Set<string>} */
			const positionedBases = new Set();

			root.walkRules((rule) => {
				if (isInKeyframes(rule)) return;

				// A ghost button keeps no ring: its hover border color is transparent
				rule.each((node) => {
					if (node.type !== 'decl') return;
					const family = HOVER_COLOR_VAR.exec(node.prop)?.[1];
					if (!family) return;
					rule.append({
						prop: `--fork-hover-ring--${family}`,
						value: /transparent/i.test(node.value) ? 'transparent' : 'initial',
						important: node.important,
					});
				});

				const hoverParts = rule.selectors.filter(isHoverPart);
				if (!hoverParts.length) return;

				/** @type {'border' | 'shadow' | null} */
				let kind = null;
				let family = '';
				rule.each((node) => {
					if (node.type !== 'decl') return;
					if (BORDER_PROP.test(node.prop)) {
						kind = classifyHoverBorder(node.prop, node.value) ? 'border' : null;
					} else if (node.prop === 'box-shadow') {
						const shadow = classifyHoverShadow(node.value);
						if (shadow) {
							kind = 'shadow';
							family = shadow.family;
						}
					}
				});
				if (!kind) return;

				/** @type {Record<'::after' | '::before', string[]>} */
				const ringParts = { '::after': [], '::before': [] };
				/** @type {string[]} */
				const imageParts = [];

				for (const part of hoverParts) {
					if (KEEP_SELECTOR.test(stripFunctionalPseudos(part))) continue;
					const base = toBase(part);
					// `&, &:hover` sets the same border at rest and on hover
					if (!base || rule.selectors.some((other) => other.trim() === base)) continue;

					const pseudo = !usage.after.has(base)
						? '::after'
						: !usage.before.has(base)
							? '::before'
							: null;
					if (!pseudo || REPLACED_ELEMENT.test(base)) {
						if (kind === 'border') imageParts.push(part);
						continue;
					}
					ringParts[pseudo].push(part);
					if (!positionedBases.has(base)) {
						positionedBases.add(base);
						// Zero specificity: any `position` in the code still wins
						rule.before(rule.clone({ selector: `:where(${base})`, nodes: [] }).append({
							prop: 'position',
							value: 'relative',
						}));
					}
				}

				/** @type {import('postcss').Rule} */
				let last = rule;
				const insert = (/** @type {string[]} */ parts, /** @type {Array<{prop: string; value: string}>} */ decls) => {
					const next = rule.clone({ selector: parts.join(', '), nodes: [] }).append(...decls);
					last.after(next);
					last = next;
				};

				const ring = family ? `var(--fork-hover-ring--${family}, ${GRADIENT})` : GRADIENT;
				for (const pseudo of /** @type {const} */ (['::after', '::before'])) {
					const parts = ringParts[pseudo];
					if (!parts.length) continue;
					// The ring replaces the hover color of a real border
					if (kind === 'border') insert(parts, [{ prop: 'border-color', value: 'transparent' }]);
					insert(
						parts.map((part) => `${part}${pseudo}`),
						[
							{ prop: 'content', value: "''" },
							{ prop: 'position', value: 'absolute' },
							{ prop: 'inset', value: '0' },
							{ prop: 'box-sizing', value: 'border-box' },
							{ prop: 'border-radius', value: 'inherit' },
							{ prop: 'border-style', value: 'solid' },
							{
								prop: 'border-width',
								value: kind === 'border' ? 'inherit' : 'var(--fork-hover-ring-width, 1px)',
							},
							{ prop: 'border-color', value: 'transparent' },
							{ prop: 'background', value: `${ring} border-box` },
							{
								prop: 'mask',
								value: 'linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0) border-box',
							},
							{ prop: 'mask-composite', value: 'exclude' },
							{ prop: 'animation', value: 'var(--fork-hover-animation)' },
							{ prop: 'pointer-events', value: 'none' },
						],
					);
				}

				if (imageParts.length) {
					insert(imageParts, [{ prop: 'border-image', value: `${GRADIENT} 1` }]);
				}
			});
		},
	};
};

forkHoverGradient.postcss = true;

module.exports = forkHoverGradient;
module.exports.stripFunctionalPseudos = stripFunctionalPseudos;
module.exports.isHoverPart = isHoverPart;
module.exports.toBase = toBase;
module.exports.classifyHoverBorder = classifyHoverBorder;
module.exports.classifyHoverShadow = classifyHoverShadow;
