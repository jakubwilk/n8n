module.exports = {
	plugins: [
		// tailwindcss
		require('autoprefixer'),
		// Fork: animated gradient border on hover, see postcss/fork-hover-gradient.cjs
		require('./postcss/fork-hover-gradient.cjs')(),
	],
};
