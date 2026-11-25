import type { HostStatsResponse, HostStatsSample } from '@n8n/api-types';
import { createTestingPinia } from '@pinia/testing';
import { useSettingsStore } from '@n8n/stores/settings.store';
import { useUsersStore } from '@n8n/stores/users.store';
import { waitFor } from '@testing-library/vue';

import { createComponentRenderer } from '@/__tests__/render';
import { mockedStore } from '@/__tests__/utils';

import * as hostStatsApi from './hostStats.api';
import { useHostStatsStore } from './hostStats.store';
import HostStatsPanel from './HostStatsPanel.vue';

vi.mock('./hostStats.api', () => ({
	fetchHostStats: vi.fn(),
	fetchHostStatsLatest: vi.fn(),
}));

const GB = 1024 ** 3;

const sample = (overrides: Partial<HostStatsSample> = {}): HostStatsSample => ({
	timestamp: 1_000,
	cpuPercent: 12.5,
	memoryUsedBytes: 2 * GB,
	memoryTotalBytes: 8 * GB,
	diskUsedBytes: 95 * GB,
	diskTotalBytes: 100 * GB,
	...overrides,
});

const response = (samples: HostStatsSample[]): HostStatsResponse => ({
	intervalSeconds: 5,
	cpuCount: 4,
	loadAverage: [0.5, 0.25, 0.1],
	uptimeSeconds: 2 * 86400 + 3 * 3600,
	samples,
});

const renderComponent = createComponentRenderer(HostStatsPanel, {
	// Chart.js needs a real canvas, which jsdom does not have.
	global: { stubs: { HostStatsChart: true } },
});

describe('HostStatsPanel', () => {
	let settingsStore: ReturnType<typeof mockedStore<typeof useSettingsStore>>;
	let usersStore: ReturnType<typeof mockedStore<typeof useUsersStore>>;

	beforeEach(() => {
		vi.clearAllMocks();
		createTestingPinia({ stubActions: false });
		settingsStore = mockedStore(useSettingsStore);
		usersStore = mockedStore(useUsersStore);
		settingsStore.isModuleActive.mockImplementation((name) => name === 'host-stats');
		usersStore.currentUser = { globalScopes: ['orchestration:read'] } as never;
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(response([sample()]));
	});

	it('shows the latest CPU, memory and disk usage', async () => {
		const { getByTestId } = renderComponent();

		await waitFor(() => expect(getByTestId('host-stats-cpu')).toBeInTheDocument());
		expect(getByTestId('host-stats-cpu')).toHaveTextContent('12.5%');
		expect(getByTestId('host-stats-cpu')).toHaveTextContent('4 cores');
		expect(getByTestId('host-stats-memory')).toHaveTextContent('25.0%');
		expect(getByTestId('host-stats-memory')).toHaveTextContent('2.0 of 8.0 GB');
		expect(getByTestId('host-stats-disk')).toHaveTextContent('95.0%');
		expect(getByTestId('host-stats-disk')).toHaveTextContent('5.0 GB free');
		expect(getByTestId('host-stats')).toHaveTextContent('Up 2d 3h');
	});

	it('draws the data of an earlier visit before the request ends', () => {
		useHostStatsStore().stats = response([sample({ cpuPercent: 42 })]);
		vi.mocked(hostStatsApi.fetchHostStats).mockReturnValue(new Promise(() => {}));

		const { getByTestId } = renderComponent();

		expect(getByTestId('host-stats-cpu')).toHaveTextContent('42.0%');
	});

	it('shows -- before the first CPU value exists', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockResolvedValue(
			response([sample({ cpuPercent: null })]),
		);

		const { getByTestId } = renderComponent();

		await waitFor(() => expect(getByTestId('host-stats-cpu')).toHaveTextContent('--%'));
	});

	it('shows a message when the stats cannot be loaded', async () => {
		vi.mocked(hostStatsApi.fetchHostStats).mockRejectedValue(new Error('404'));

		const { getByTestId } = renderComponent();

		await waitFor(() => expect(getByTestId('host-stats-unavailable')).toBeInTheDocument());
	});

	it('renders nothing and makes no request without the scope', () => {
		usersStore.currentUser = { globalScopes: [] } as never;

		const { queryByTestId } = renderComponent();

		expect(queryByTestId('host-stats')).not.toBeInTheDocument();
		expect(hostStatsApi.fetchHostStats).not.toHaveBeenCalled();
	});

	it('renders nothing and makes no request when the module is not active', () => {
		settingsStore.isModuleActive.mockReturnValue(false);

		const { queryByTestId } = renderComponent();

		expect(queryByTestId('host-stats')).not.toBeInTheDocument();
		expect(hostStatsApi.fetchHostStats).not.toHaveBeenCalled();
	});
});
