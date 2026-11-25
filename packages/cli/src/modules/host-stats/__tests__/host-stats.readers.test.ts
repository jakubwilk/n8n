import { parseMeminfo, parseProcStat } from '../host-stats.readers';

describe('parseProcStat', () => {
	it('sums user to steal and counts iowait as idle', () => {
		const content = [
			'cpu  100 10 50 800 40 5 5 0 0 0',
			'cpu0 50 5 25 400 20 2 3 0 0 0',
			'intr 12345',
		].join('\n');

		expect(parseProcStat(content)).toEqual({ total: 1010, idle: 840 });
	});

	it('returns null without an aggregate cpu line', () => {
		expect(parseProcStat('cpu0 1 2 3 4 5\n')).toBeNull();
	});

	it('returns null for values that are not numbers', () => {
		expect(parseProcStat('cpu  a b c d e\n')).toBeNull();
	});
});

describe('parseMeminfo', () => {
	it('reads MemTotal and MemAvailable in bytes', () => {
		const content = [
			'MemTotal:        8000000 kB',
			'MemFree:          500000 kB',
			'MemAvailable:    3000000 kB',
		].join('\n');

		expect(parseMeminfo(content)).toEqual({
			totalBytes: 8000000 * 1024,
			availableBytes: 3000000 * 1024,
		});
	});

	it('returns null when MemAvailable is missing', () => {
		expect(parseMeminfo('MemTotal:        8000000 kB\n')).toBeNull();
	});
});
