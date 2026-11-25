import type { HostStatsResponse } from '@n8n/api-types';
import { Get, GlobalScope, RestController } from '@n8n/decorators';

import { HostStatsService } from './host-stats.service';

/** Only the owner and admins hold `orchestration:read`. */
@RestController('/host-stats')
export class HostStatsController {
	constructor(private readonly hostStatsService: HostStatsService) {}

	@Get('/')
	@GlobalScope('orchestration:read')
	async getStats(): Promise<HostStatsResponse> {
		return this.hostStatsService.getStats();
	}

	@Get('/latest')
	@GlobalScope('orchestration:read')
	async getLatest(): Promise<HostStatsResponse> {
		return this.hostStatsService.getLatest();
	}
}
