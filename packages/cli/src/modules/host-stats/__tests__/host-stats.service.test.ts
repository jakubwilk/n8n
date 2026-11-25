import { HostStatsService, MAX_SAMPLES } from '../host-stats.service';
import { readCpuTimes, readDisk, readMemory } from '../host-stats.readers';

vi.mock('../host-stats.readers', () => ({
	readCpuTimes: vi.fn(),
	readMemory: vi.fn(),
	readDisk: vi.fn(),
}));

const GB = 1024 ** 3;

describe('HostStatsService', () => {
	let service: HostStatsService;

	beforeEach(() => {
		vi.mocked(readCpuTimes).mockReset();
		vi.mocked(readMemory).mockResolvedValue({ totalBytes: 8 * GB, availableBytes: 6 * GB });
		vi.mocked(readDisk).mockResolvedValue({ totalBytes: 100 * GB, usedBytes: 40 * GB });
		service = new HostStatsService();
	});

	it('has no CPU value for the first sample', async () => {
		vi.mocked(readCpuTimes).mockResolvedValue({ total: 1000, idle: 800 });

		await service.sample();

		const [sample] = service.getStats().samples;
		expect(sample.cpuPercent).toBeNull();
		expect(sample.memoryUsedBytes).toBe(2 * GB);
		expect(sample.memoryTotalBytes).toBe(8 * GB);
		expect(sample.diskUsedBytes).toBe(40 * GB);
		expect(sample.diskTotalBytes).toBe(100 * GB);
	});

	it('computes CPU usage from the difference between two samples', async () => {
		vi.mocked(readCpuTimes)
			.mockResolvedValueOnce({ total: 1000, idle: 800 })
			.mockResolvedValueOnce({ total: 1200, idle: 950 });

		await service.sample();
		await service.sample();

		expect(service.getLatest().samples).toHaveLength(1);
		expect(service.getLatest().samples[0].cpuPercent).toBe(25);
	});

	it('reports 0% when the CPU counters did not move', async () => {
		vi.mocked(readCpuTimes).mockResolvedValue({ total: 1000, idle: 800 });

		await service.sample();
		await service.sample();

		expect(service.getLatest().samples[0].cpuPercent).toBe(0);
	});

	it('keeps the previous disk values when the disk cannot be read', async () => {
		vi.mocked(readCpuTimes).mockResolvedValue({ total: 1000, idle: 800 });
		await service.sample();
		vi.mocked(readDisk).mockRejectedValueOnce(new Error('ENOENT'));

		await service.sample();

		expect(service.getLatest().samples[0].diskUsedBytes).toBe(40 * GB);
	});

	it('keeps only the newest samples', async () => {
		let total = 0;
		vi.mocked(readCpuTimes).mockImplementation(async () => ({ total: (total += 100), idle: 0 }));

		for (let i = 0; i < MAX_SAMPLES + 5; i++) await service.sample();

		const { samples } = service.getStats();
		expect(samples).toHaveLength(MAX_SAMPLES);
		expect(samples.every((s) => s.cpuPercent === 100)).toBe(true);
	});

	it('returns no samples before the first sample', () => {
		const stats = service.getStats();

		expect(stats.samples).toEqual([]);
		expect(stats.intervalSeconds).toBe(5);
		expect(stats.loadAverage).toHaveLength(3);
	});
});
