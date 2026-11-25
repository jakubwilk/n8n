import type { HostStatsResponse, HostStatsSample } from '@n8n/api-types';
import { createTestingPinia } from '@pinia/testing';
import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import type { Ref } from 'vue';

import * as hostStatsApi from './hostStats.api';
import { MAX_SAMPLES, useHostStats } from './useHostStats';

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

function mountComposable(enabled: Ref<boolean>) {
	let result!: ReturnType<typeof useHostStats>;
	render(
		defineComponent({
			setup() {
				result = useHostStats(enabled);
				return () => h('div');
			},
		}),
	);
	return result;
}

const timestamps = (stats: Ref<HostStatsResponse | null>) =>
	stats.value?.samples.map((s) => s.timestamp);

describe('useHostStats', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		createTestingPinia();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('loads the history, then appends only new samples', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample(1), sample(2)]));
		vi.mocked(hostStatsApi.fetchHostStatsLatest)
			.mockResolvedValueOnce(response([sample(2)]))
			.mockResolvedValueOnce(response([sample(3)]));

		const { stats } = mountComposable(ref(true));
		await flushPromises();
		expect(timestamps(stats)).toEqual([1, 2]);

		await vi.advanceTimersByTimeAsync(5000);
		expect(timestamps(stats)).toEqual([1, 2]);

		await vi.advanceTimersByTimeAsync(5000);
		expect(timestamps(stats)).toEqual([1, 2, 3]);
	});

	it('keeps at most one hour of samples', async () => {
		const history = Array.from({ length: MAX_SAMPLES }, (_, i) => sample(i + 1));
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response(history));
		vi.mocked(hostStatsApi.fetchHostStatsLatest).mockResolvedValue(
			response([sample(MAX_SAMPLES + 1)]),
		);

		const { stats } = mountComposable(ref(true));
		await flushPromises();
		await vi.advanceTimersByTimeAsync(5000);

		expect(stats.value?.samples).toHaveLength(MAX_SAMPLES);
		expect(stats.value?.samples.at(0)?.timestamp).toBe(2);
		expect(stats.value?.samples.at(-1)?.timestamp).toBe(MAX_SAMPLES + 1);
	});

	it('does not poll while disabled', async () => {
		const enabled = ref(false);
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample(1)]));

		mountComposable(enabled);
		await vi.advanceTimersByTimeAsync(20000);
		expect(hostStatsApi.fetchHostStats).not.toHaveBeenCalled();

		enabled.value = true;
		await flushPromises();
		expect(hostStatsApi.fetchHostStats).toHaveBeenCalledTimes(1);
	});

	it('reports an error when the request fails', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockRejectedValue(new Error('403'));

		const { hasError, stats } = mountComposable(ref(true));
		await flushPromises();

		expect(hasError.value).toBe(true);
		expect(stats.value).toBeNull();
	});
});
