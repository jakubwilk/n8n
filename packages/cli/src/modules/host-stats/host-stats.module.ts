import type { ModuleInterface, SystemTaskClass } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';
import { Container } from '@n8n/di';

/**
 * Fork: CPU, memory and disk usage of the host, shown on the Overview page.
 * The module is off by default. Enable it with `N8N_ENABLED_MODULES=host-stats`.
 */
@BackendModule({ name: 'host-stats', instanceTypes: ['main'] })
export class HostStatsModule implements ModuleInterface {
	async init() {
		await import('./host-stats.controller.js');

		// The first sample only primes the CPU counters, so take it now.
		const { HostStatsService } = await import('./host-stats.service.js');
		await Container.get(HostStatsService).sample();
	}

	async systemTasks(): Promise<SystemTaskClass[]> {
		const { HostStatsSampleTask } = await import('./host-stats.task.js');
		return [HostStatsSampleTask];
	}
}
