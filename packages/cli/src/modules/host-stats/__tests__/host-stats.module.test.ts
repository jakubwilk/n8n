import { ModuleMetadata } from '@n8n/decorators';
import { Container } from '@n8n/di';

import { HostStatsModule } from '../host-stats.module';
import { HostStatsSampleTask } from '../host-stats.task';

describe('HostStatsModule', () => {
	it('is registered for main instances only', () => {
		const entry = Container.get(ModuleMetadata).get('host-stats');

		expect(entry?.class).toBe(HostStatsModule);
		expect(entry?.instanceTypes).toEqual(['main']);
	});

	it('schedules the sample task', async () => {
		await expect(new HostStatsModule().systemTasks()).resolves.toEqual([HostStatsSampleTask]);
	});
});
