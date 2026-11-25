import { instanceTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { HostStatsService, SAMPLE_INTERVAL_SECONDS } from './host-stats.service';

/** Records one host resource sample into the in-memory history. */
@SystemTask()
export class HostStatsSampleTask implements SystemTask {
	readonly name = 'host-stats-sample';

	readonly schedule: SystemTaskSchedule = intervalFromSeconds(SAMPLE_INTERVAL_SECONDS);

	/** Each main keeps its own history, which its own API serves. */
	readonly target = instanceTarget(['main']);

	constructor(private readonly hostStatsService: HostStatsService) {}

	async run(): Promise<void> {
		await this.hostStatsService.sample();
	}
}
