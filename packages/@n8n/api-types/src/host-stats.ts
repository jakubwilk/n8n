/**
 * Fork: resource usage of the host that runs the n8n main process,
 * served by `GET /rest/host-stats` when the `host-stats` module is enabled.
 */
export interface HostStatsSample {
	/** Unix time in milliseconds. */
	timestamp: number;
	/** Busy CPU time since the previous sample, `0`–`100`. `null` for the first sample. */
	cpuPercent: number | null;
	memoryUsedBytes: number;
	memoryTotalBytes: number;
	diskUsedBytes: number;
	diskTotalBytes: number;
}

export interface HostStatsResponse {
	/** Seconds between two samples. */
	intervalSeconds: number;
	cpuCount: number;
	/** 1, 5 and 15 minute load averages. */
	loadAverage: [number, number, number];
	uptimeSeconds: number;
	/** Oldest first. */
	samples: HostStatsSample[];
}
