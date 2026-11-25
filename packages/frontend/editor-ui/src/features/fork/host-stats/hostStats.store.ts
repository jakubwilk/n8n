// Fork: host resource stats. The store keeps them between tab switches on
// Overview, so the section draws the last data at once instead of flickering.
import type { HostStatsResponse } from '@n8n/api-types';
import { useRootStore } from '@n8n/stores/useRootStore';
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { fetchHostStats, fetchHostStatsLatest } from './hostStats.api';

/** Matches the backend buffer: one hour of 5 second samples. */
export const MAX_SAMPLES = 720;

export const useHostStatsStore = defineStore('hostStats', () => {
	const rootStore = useRootStore();

	const stats = ref<HostStatsResponse | null>(null);
	const hasError = ref(false);

	let inFlight = false;

	async function request(load: () => Promise<void>) {
		if (inFlight) return;
		inFlight = true;
		try {
			await load();
			hasError.value = false;
		} catch {
			hasError.value = true;
		} finally {
			inFlight = false;
		}
	}

	async function loadAll() {
		await request(async () => {
			stats.value = await fetchHostStats(rootStore.restApiContext);
		});
	}

	async function loadLatest() {
		if (!stats.value) {
			await loadAll();
			return;
		}

		await request(async () => {
			const latest = await fetchHostStatsLatest(rootStore.restApiContext);
			const current = stats.value;
			if (!current) return;

			const lastTimestamp = current.samples.at(-1)?.timestamp ?? 0;
			const newSamples = latest.samples.filter((s) => s.timestamp > lastTimestamp);

			stats.value = {
				...latest,
				samples: [...current.samples, ...newSamples].slice(-MAX_SAMPLES),
			};
		});
	}

	return { stats, hasError, loadAll, loadLatest };
});
