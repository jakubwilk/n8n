import type { HostStatsResponse, HostStatsSample } from '@n8n/api-types';
import { Service } from '@n8n/di';
import os from 'node:os';

import type { CpuTimes, DiskInfo } from './host-stats.readers';
import { readCpuTimes, readDisk, readMemory } from './host-stats.readers';

export const SAMPLE_INTERVAL_SECONDS = 5;

/** One hour of samples. */
export const MAX_SAMPLES = 720;

const DISK_PATH = '/';

/**
 * Keeps the last hour of host resource samples in memory. Requests read the
 * buffer only, so they never measure anything themselves.
 */
@Service()
export class HostStatsService {
	private samples: HostStatsSample[] = [];

	private previousCpu: CpuTimes | null = null;

	private lastDisk: DiskInfo = { totalBytes: 0, usedBytes: 0 };

	async sample(): Promise<void> {
		const [cpu, memory, disk] = await Promise.all([
			readCpuTimes(),
			readMemory(),
			readDisk(DISK_PATH).catch(() => this.lastDisk),
		]);

		this.lastDisk = disk;
		this.samples.push({
			timestamp: Date.now(),
			cpuPercent: this.cpuPercentSince(cpu),
			memoryUsedBytes: memory.totalBytes - memory.availableBytes,
			memoryTotalBytes: memory.totalBytes,
			diskUsedBytes: disk.usedBytes,
			diskTotalBytes: disk.totalBytes,
		});

		if (this.samples.length > MAX_SAMPLES) {
			this.samples.splice(0, this.samples.length - MAX_SAMPLES);
		}
	}

	getStats(): HostStatsResponse {
		return this.buildResponse([...this.samples]);
	}

	getLatest(): HostStatsResponse {
		return this.buildResponse(this.samples.slice(-1));
	}

	private cpuPercentSince(current: CpuTimes): number | null {
		const previous = this.previousCpu;
		this.previousCpu = current;
		if (!previous) return null;

		const total = current.total - previous.total;
		const idle = current.idle - previous.idle;
		if (total <= 0) return 0;

		const percent = (100 * (total - idle)) / total;
		return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
	}

	private buildResponse(samples: HostStatsSample[]): HostStatsResponse {
		const [one, five, fifteen] = os.loadavg();
		return {
			intervalSeconds: SAMPLE_INTERVAL_SECONDS,
			cpuCount: os.cpus().length,
			loadAverage: [one, five, fifteen],
			uptimeSeconds: Math.floor(os.uptime()),
			samples,
		};
	}
}
