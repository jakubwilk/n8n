// @ts-check
/**
 * Fork-only PostCSS plugin (jakubwilk/n8n): animated gradient border on hover
 * and on the focus of input fields.
 *
 * The plugin adds a ring with an animated pink and grey gradient. The element
 * looks the same at rest. No upstream style file changes. The ring shows:
 * - on hover, when a rule changes a border on `:hover`,
 * - on the focus of an input field, when a rule sets the focus border of the
 *   field (`--input--border-color--focus`, `--input--border--shadow--focus`).
 *   The focus glow (`box-shadow`) and the focus `outline` stay,
 * - while a select is open (`[aria-expanded='true']`).
 *
 * - A `border` color: a `::after` ring takes the border widths of its element,
 *   so it covers the same sides and keeps the round corners.
 * - A ring drawn with `box-shadow` (inputs, buttons): a 1px `::after` ring.
 * - A `<input>` or `<textarea>` cannot have `::after`. A hover rule gets a static
 *   `border-image`. Element Plus inputs (`__inner`) are skipped here: the
 *   style file draws their ring on the wrapper.
 *
 * Borders with a meaning keep their color: error, warning, info, success,
 * selected, active, dragging, drop targets, disabled, and the node creator.
 *
 * The tokens, the animation and the Element Plus rings are in
 * `src/app/css/fork/_hover-gradient.scss`.
 */

/** Files that keep their borders: the node canvas, the node creator, third-party styles. */
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

/** A selector part for a state that keeps its look. */
const KEEP_SELECTOR =
	/disabled|selected|active|checked|dragging|connected|warning|error|::?(before|after)\b/i;

/** `var(--input--border--shadow--hover)` gives the ring family `input`. */
const SHADOW_RING_FAMILY = /var\(--([a-z0-9-]+?)--border--shadow--hover\)/;
/** A 1px ring drawn with `box-shadow`, for example `inset 0 0 0 1px var(--border-color--strong)`. */
const SHADOW_RING_PLAIN = /\b0 0 0 1px\s+(var\([^)]*\)|[^,]+)/;
/** `var(--input--border-color--hover)` in a border value gives the ring family `input`. */
const BORDER_HOVER_FAMILY = /var\(--([a-z0-9-]+?)--border-color--hover\)/;

/** The focus border of an input field: the color or the shadow ring. */
const FOCUS_BORDER_COLOR = /var\(--([a-z0-9-]+?)--border-color--focus\b/;
const FOCUS_BORDER_SHADOW = /var\(--([a-z0-9-]+?)--border--shadow--focus\)/;

/** Elements with no `::after`. */
const REPLACED_ELEMENT = /(^|[\s>+~])(input|textarea|select|img)\b/;
/** Element Plus inputs. `_hover-gradient.scss` draws their ring on the wrapper. */
const ELEMENT_PLUS_INPUT = /__inner\b/;

/** A select trigger. It keeps the ring while its list is open. */
const SELECT_TRIGGER = /selectTrigger|comboboxAnchor/;

/** `--input--border-color--hover` gives the ring family `input`. */
const STATE_COLOR_VAR = /^--([a-z0-9-]+?)--border-color--(hover|focus)$/;

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
 * True when the part itself is in a focus state, not only inside `:not(...)`.
 * @param {string} part
 */
const isFocusPart = (part) => /:focus(-within|-visible)?\b/.test(stripFunctionalPseudos(part));

/**
 * The element at rest: the part without hover, focus and functional pseudos.
 * @param {string} part
 */
const toBase = (part) =>
	stripFunctionalPseudos(part)
		.replace(/:(hover|focus-within|focus-visible|focus)\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * @param {string} prop
 * @param {string} value
 * @returns {{ family: string } | null}
 */
function classifyHoverBorder(prop, value) {
	if (!BORDER_PROP.test(prop)) return null;
	if (KEEP_VALUE.test(value)) return null;
	// A width or a style alone does not change the color
	if (!/var\(|#|\(|[a-z]{4,}/i.test(value.replace(/\b(solid|dashed|dotted)\b/g, ''))) return null;
	return { family: BORDER_HOVER_FAMILY.exec(value)?.[1] ?? '' };
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
 * The focus border of an input field.
 * @param {string} prop
 * @param {string} value
 * @returns {{ kind: 'border' | 'shadow'; family: string } | null}
 */
function classifyFocusBorder(prop, value) {
	if (BORDER_PROP.test(prop)) {
		const family = FOCUS_BORDER_COLOR.exec(value)?.[1];
		return family ? { kind: 'border', family } : null;
	}
	if (prop === 'box-shadow') {
		const family = FOCUS_BORDER_SHADOW.exec(value)?.[1];
		return family ? { kind: 'shadow', family } : null;
	}
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

/**
 * @param {string} ring
 * @param {'border' | 'shadow'} kind
 */
const ringDeclarations = (ring, kind) => [
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
];

/**
 * Finds what a rule changes. Hover wins over focus when a rule has both.
 * @param {import('postcss').Rule} rule
 * @returns {{ state: 'hover' | 'focus'; kind: 'border' | 'shadow'; family: string; parts: string[] } | null}
 */
function analyzeRule(rule) {
	const hoverParts = rule.selectors.filter(isHoverPart);
	const focusParts = rule.selectors.filter((part) => !isHoverPart(part) && isFocusPart(part));

	/** @type {{ kind: 'border' | 'shadow'; family: string } | null} */
	let hover = null;
	/** @type {{ kind: 'border' | 'shadow'; family: string } | null} */
	let focus = null;
	rule.each((node) => {
		if (node.type !== 'decl') return;
		if (hoverParts.length) {
			if (BORDER_PROP.test(node.prop)) {
				const border = classifyHoverBorder(node.prop, node.value);
				hover = border ? { kind: 'border', family: border.family } : null;
			} else if (node.prop === 'box-shadow') {
				const shadow = classifyHoverShadow(node.value);
				if (shadow) hover = { kind: 'shadow', family: shadow.family };
			}
		}
		if (focusParts.length) {
			const result = classifyFocusBorder(node.prop, node.value);
			if (result) focus = result;
		}
	});

	if (hover) return { state: 'hover', ...hover, parts: hoverParts };
	if (focus) return { state: 'focus', ...focus, parts: focusParts };
	return null;
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

				// A ghost variant keeps no ring: its hover or focus border color is transparent
				rule.each((node) => {
					if (node.type !== 'decl') return;
					const match = STATE_COLOR_VAR.exec(node.prop);
					if (!match) return;
					rule.append({
						prop: `--fork-${match[2]}-ring--${match[1]}`,
						value: /transparent/i.test(node.value) ? 'transparent' : 'initial',
						important: node.important,
					});
				});

				const change = analyzeRule(rule);
				if (!change) return;
				const { state, kind, family } = change;

				/** @type {Record<'::after' | '::before', string[]>} */
				const ringParts = { '::after': [], '::before': [] };
				/** @type {string[]} */
				const imageParts = [];

				for (const part of change.parts) {
					if (KEEP_SELECTOR.test(stripFunctionalPseudos(part))) continue;
					const base = toBase(part);
					// `&, &:hover` sets the same border at rest and in the state
					if (!base || rule.selectors.some((other) => other.trim() === base)) continue;
					if (ELEMENT_PLUS_INPUT.test(base)) continue;

					const pseudo = !usage.after.has(base)
						? '::after'
						: !usage.before.has(base)
							? '::before'
							: null;
					if (!pseudo || REPLACED_ELEMENT.test(base)) {
						if (state === 'hover' && kind === 'border') imageParts.push(part);
						continue;
					}
					ringParts[pseudo].push(part);
					// The list of an open select keeps the ring on its trigger
					if (state === 'hover' && SELECT_TRIGGER.test(base)) {
						ringParts[pseudo].push(`${base}[aria-expanded='true']`);
					}
					if (!positionedBases.has(base)) {
						positionedBases.add(base);
						// Zero specificity: any `position` in the code still wins
						rule.before(
							rule.clone({ selector: `:where(${base})`, nodes: [] }).append({
								prop: 'position',
								value: 'relative',
							}),
						);
					}
				}

				/** @type {import('postcss').Rule} */
				let last = rule;
				const insert = (
					/** @type {string[]} */ parts,
					/** @type {Array<{prop: string; value: string}>} */ decls,
				) => {
					const next = rule.clone({ selector: parts.join(', '), nodes: [] }).append(...decls);
					last.after(next);
					last = next;
				};

				const ring = family ? `var(--fork-${state}-ring--${family}, ${GRADIENT})` : GRADIENT;
				for (const pseudo of /** @type {const} */ (['::after', '::before'])) {
					const parts = ringParts[pseudo];
					if (!parts.length) continue;
					if (kind === 'border') {
						// The ring replaces the color of a real border
						insert(parts, [{ prop: 'border-color', value: 'transparent' }]);
					} else if (state === 'focus') {
						// Only the border line goes. The focus glow and the outline stay.
						insert(parts, [
							{ prop: `--${family}--border--shadow--focus`, value: '0 0 0 0 transparent' },
						]);
					}
					insert(
						parts.map((part) => `${part}${pseudo}`),
						ringDeclarations(ring, kind),
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
module.exports.isFocusPart = isFocusPart;
module.exports.toBase = toBase;
module.exports.classifyHoverBorder = classifyHoverBorder;
module.exports.classifyHoverShadow = classifyHoverShadow;
module.exports.classifyFocusBorder = classifyFocusBorder;
