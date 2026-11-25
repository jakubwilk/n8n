import { readFile, statfs } from 'node:fs/promises';
import os from 'node:os';

/** Cumulative CPU time of all cores, in arbitrary ticks. */
export interface CpuTimes {
	total: number;
	idle: number;
}

export interface MemoryInfo {
	totalBytes: number;
	availableBytes: number;
}

export interface DiskInfo {
	totalBytes: number;
	usedBytes: number;
}

/**
 * Parses the aggregate `cpu` line of `/proc/stat`. The total is user to steal,
 * and idle time includes iowait, so the result matches `top` and `vmstat`.
 * See https://docs.kernel.org/filesystems/proc.html#miscellaneous-kernel-statistics-in-proc-stat
 */
export function parseProcStat(content: string): CpuTimes | null {
	const line = content.split('\n').find((l) => l.startsWith('cpu '));
	if (!line) return null;

	const fields = line.trim().split(/\s+/).slice(1, 9).map(Number);
	if (fields.length < 5 || fields.some((f) => !Number.isFinite(f))) return null;

	const [, , , idle, iowait] = fields;
	return { total: fields.reduce((sum, f) => sum + f, 0), idle: idle + iowait };
}

/** Parses `MemTotal` and `MemAvailable` (in kB) from `/proc/meminfo`. */
export function parseMeminfo(content: string): MemoryInfo | null {
	const kilobytes = (key: string) => {
		const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm').exec(content);
		return match ? Number(match[1]) * 1024 : null;
	};

	const totalBytes = kilobytes('MemTotal');
	const availableBytes = kilobytes('MemAvailable');
	if (totalBytes === null || availableBytes === null) return null;

	return { totalBytes, availableBytes };
}

async function readProcFile(path: string): Promise<string | null> {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

/**
 * Docker does not namespace `/proc/stat`, so inside a container this is the
 * CPU time of the whole host. Other platforms (local development) use `os`.
 */
export async function readCpuTimes(): Promise<CpuTimes> {
	const content = await readProcFile('/proc/stat');
	const parsed = content === null ? null : parseProcStat(content);
	if (parsed) return parsed;

	return os.cpus().reduce(
		(acc, { times }) => ({
			total: acc.total + times.user + times.nice + times.sys + times.idle + times.irq,
			idle: acc.idle + times.idle,
		}),
		{ total: 0, idle: 0 },
	);
}

/** Like `readCpuTimes`, inside a container this is the memory of the whole host. */
export async function readMemory(): Promise<MemoryInfo> {
	const content = await readProcFile('/proc/meminfo');
	const parsed = content === null ? null : parseMeminfo(content);
	if (parsed) return parsed;

	return { totalBytes: os.totalmem(), availableBytes: os.freemem() };
}

/** Same numbers as the `Size` and `Used` columns of `df`. */
export async function readDisk(path: string): Promise<DiskInfo> {
	const { blocks, bfree, bsize } = await statfs(path);
	return { totalBytes: blocks * bsize, usedBytes: (blocks - bfree) * bsize };
}
