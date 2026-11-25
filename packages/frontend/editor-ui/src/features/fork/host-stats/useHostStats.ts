// Fork: polls the host resource stats while the section is visible.
import type { HostStatsResponse } from '@n8n/api-types';
import { useRootStore } from '@n8n/stores/useRootStore';
import { useIntervalFn } from '@vueuse/core';
import type { Ref } from 'vue';
import { ref, watch } from 'vue';

import { useDocumentVisibility } from '@/app/composables/useDocumentVisibility';

import { fetchHostStats, fetchHostStatsLatest } from './hostStats.api';

/** Matches the backend buffer: one hour of 5 second samples. */
export const MAX_SAMPLES = 720;

const DEFAULT_INTERVAL_MS = 5000;

export function useHostStats(enabled: Ref<boolean>) {
	const rootStore = useRootStore();
	const { isVisible, onDocumentVisible, onDocumentHidden } = useDocumentVisibility();

	const stats = ref<HostStatsResponse | null>(null);
	const hasError = ref(false);
	const intervalMs = ref(DEFAULT_INTERVAL_MS);

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
			const response = await fetchHostStats(rootStore.restApiContext);
			stats.value = response;
			intervalMs.value = response.intervalSeconds * 1000 || DEFAULT_INTERVAL_MS;
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

	const { pause, resume } = useIntervalFn(loadLatest, intervalMs, { immediate: false });

	function start() {
		void loadAll();
		resume();
	}

	// A hidden tab misses samples, so the full history fills the gap on return.
	onDocumentHidden(pause);
	onDocumentVisible(() => {
		if (enabled.value) start();
	});

	watch(
		enabled,
		(isEnabled) => {
			if (isEnabled && isVisible.value) start();
			else pause();
		},
		{ immediate: true },
	);

	return { stats, hasError, refresh: loadAll };
}
