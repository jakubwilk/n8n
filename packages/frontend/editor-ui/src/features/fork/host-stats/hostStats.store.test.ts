import type { HostStatsResponse, HostStatsSample } from '@n8n/api-types';
import { createPinia, setActivePinia } from 'pinia';

import * as hostStatsApi from './hostStats.api';
import { MAX_SAMPLES, useHostStatsStore } from './hostStats.store';

vi.mock('./hostStats.api', () => ({
	fetchHostStats: vi.fn(),
	fetchHostStatsLatest: vi.fn(),
}));

const sample = (timestamp: number): HostStatsSample => ({
	timestamp,
	cpuPercent: 10,
	memoryUsedBytes: 1,
	memoryTotalBytes: 2,
	diskUsedBytes: 1,
	diskTotalBytes: 2,
});

const response = (samples: HostStatsSample[]): HostStatsResponse => ({
	intervalSeconds: 5,
	cpuCount: 2,
	loadAverage: [0, 0, 0],
	uptimeSeconds: 1,
	samples,
});

const timestamps = (store: ReturnType<typeof useHostStatsStore>) =>
	store.stats?.samples.map((s) => s.timestamp);

describe('useHostStatsStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
	});

	it('appends only samples that are newer than the last one', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample(1), sample(2)]));
		vi.mocked(hostStatsApi.fetchHostStatsLatest)
			.mockResolvedValueOnce(response([sample(2)]))
			.mockResolvedValueOnce(response([sample(3)]));
		const store = useHostStatsStore();

		await store.loadAll();
		await store.loadLatest();
		expect(timestamps(store)).toEqual([1, 2]);

		await store.loadLatest();
		expect(timestamps(store)).toEqual([1, 2, 3]);
	});

	it('loads the full history when there is no data yet', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample(1)]));
		const store = useHostStatsStore();

		await store.loadLatest();

		expect(hostStatsApi.fetchHostStatsLatest).not.toHaveBeenCalled();
		expect(timestamps(store)).toEqual([1]);
	});

	it('keeps at most one hour of samples', async () => {
		const history = Array.from({ length: MAX_SAMPLES }, (_, i) => sample(i + 1));
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response(history));
		vi.mocked(hostStatsApi.fetchHostStatsLatest).mockResolvedValue(
			response([sample(MAX_SAMPLES + 1)]),
		);
		const store = useHostStatsStore();

		await store.loadAll();
		await store.loadLatest();

		expect(store.stats?.samples).toHaveLength(MAX_SAMPLES);
		expect(store.stats?.samples.at(0)?.timestamp).toBe(2);
		expect(store.stats?.samples.at(-1)?.timestamp).toBe(MAX_SAMPLES + 1);
	});

	it('sends one request at a time', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample(1)]));
		const store = useHostStatsStore();

		await Promise.all([store.loadAll(), store.loadAll()]);

		expect(hostStatsApi.fetchHostStats).toHaveBeenCalledTimes(1);
	});

	it('keeps the last data and reports an error when a request fails', async () => {
		vi.mocked(hostStatsApi.fetchHostStats)
			.mockResolvedValueOnce(response([sample(1)]))
			.mockRejectedValueOnce(new Error('500'));
		const store = useHostStatsStore();

		await store.loadAll();
		await store.loadAll();

		expect(store.hasError).toBe(true);
		expect(timestamps(store)).toEqual([1]);
	});
});
