import type { HostStatsResponse, HostStatsSample } from '@n8n/api-types';
import { createTestingPinia } from '@pinia/testing';
import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import type { Ref } from 'vue';

import * as hostStatsApi from './hostStats.api';
import { useHostStats } from './useHostStats';

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
	const { unmount } = render(
		defineComponent({
			setup() {
				result = useHostStats(enabled);
				return () => h('div');
			},
		}),
	);
	return { ...result, unmount };
}

describe('useHostStats', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		createTestingPinia({ stubActions: false });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('loads the history, then polls for the latest sample', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample(1)]));
		vi.mocked(hostStatsApi.fetchHostStatsLatest).mockResolvedValue(response([sample(2)]));

		const { stats } = mountComposable(ref(true));
		await flushPromises();
		expect(stats.value?.samples.map((s) => s.timestamp)).toEqual([1]);

		await vi.advanceTimersByTimeAsync(5000);
		expect(stats.value?.samples.map((s) => s.timestamp)).toEqual([1, 2]);
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

	it('stops polling after unmount', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample(1)]));
		vi.mocked(hostStatsApi.fetchHostStatsLatest).mockResolvedValue(response([sample(2)]));

		const { unmount } = mountComposable(ref(true));
		await flushPromises();
		unmount();
		await vi.advanceTimersByTimeAsync(20000);

		expect(hostStatsApi.fetchHostStatsLatest).not.toHaveBeenCalled();
	});

	it('keeps the data of an earlier mount', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValueOnce(response([sample(1)]));

		const first = mountComposable(ref(true));
		await flushPromises();
		first.unmount();

		vi.mocked(hostStatsApi.fetchHostStats).mockReturnValueOnce(new Promise(() => {}));
		const { stats } = mountComposable(ref(true));

		expect(stats.value?.samples.map((s) => s.timestamp)).toEqual([1]);
	});
});
