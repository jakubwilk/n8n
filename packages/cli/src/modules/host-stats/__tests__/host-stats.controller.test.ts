import type { HostStatsResponse } from '@n8n/api-types';
import { mockInstance } from '@n8n/backend-test-utils';
import { ControllerRegistryMetadata } from '@n8n/decorators';
import { Container } from '@n8n/di';

import { HostStatsController } from '../host-stats.controller';
import { HostStatsService } from '../host-stats.service';

const response: HostStatsResponse = {
	intervalSeconds: 5,
	cpuCount: 4,
	loadAverage: [0.5, 0.4, 0.3],
	uptimeSeconds: 100,
	samples: [],
};

describe('HostStatsController', () => {
	const hostStatsService = mockInstance(HostStatsService);

	it('returns the full history', async () => {
		hostStatsService.getStats.mockReturnValue(response);

		await expect(Container.get(HostStatsController).getStats()).resolves.toBe(response);
	});

	it('returns the latest sample', async () => {
		hostStatsService.getLatest.mockReturnValue(response);

		await expect(Container.get(HostStatsController).getLatest()).resolves.toBe(response);
	});

	it('requires the orchestration:read scope on every route', () => {
		const { routes } = Container.get(ControllerRegistryMetadata).getControllerMetadata(
			HostStatsController as never,
		);

		expect(routes.size).toBe(2);
		for (const route of routes.values()) {
			expect(route.accessScope).toEqual({ scope: 'orchestration:read', globalOnly: true });
		}
	});
});
