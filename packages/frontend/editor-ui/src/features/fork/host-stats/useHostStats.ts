// Fork: polls the host resource stats while the section is on the screen.
import { useIntervalFn } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';
import { computed, watch } from 'vue';

import { useDocumentVisibility } from '@/app/composables/useDocumentVisibility';

import { useHostStatsStore } from './hostStats.store';

const DEFAULT_INTERVAL_MS = 5000;

export function useHostStats(enabled: Ref<boolean>) {
	const hostStatsStore = useHostStatsStore();
	const { stats, hasError } = storeToRefs(hostStatsStore);
	const { isVisible, onDocumentVisible, onDocumentHidden } = useDocumentVisibility();

	const intervalMs = computed(() =>
		stats.value?.intervalSeconds ? stats.value.intervalSeconds * 1000 : DEFAULT_INTERVAL_MS,
	);

	const { pause, resume } = useIntervalFn(hostStatsStore.loadLatest, intervalMs, {
		immediate: false,
	});

	// The store may hold data from an earlier visit. It stays on the screen while
	// the full history replaces it, which also fills any gap in the samples.
	function start() {
		void hostStatsStore.loadAll();
		resume();
	}

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

	return { stats, hasError };
}
