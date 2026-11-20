import { computed, ref, watch, type Ref } from 'vue';

import { useDependencies } from '@/app/composables/useDependencies';

/** A route query value can be a string, an array of strings, or missing. */
export function toStringArray(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * Credential ids used by the selected workflows. The data comes from the
 * workflow dependency index, which also feeds the usage pill on credential cards.
 */
export function useCredentialWorkflowFilter(selectedWorkflowIds: Ref<string[]>) {
	const { fetchDependencies, getDependencies } = useDependencies();
	const loading = ref(false);

	watch(
		() => selectedWorkflowIds.value.join(','),
		async () => {
			if (!selectedWorkflowIds.value.length) return;
			loading.value = true;
			try {
				await fetchDependencies(selectedWorkflowIds.value, 'workflow');
			} finally {
				loading.value = false;
			}
		},
		{ immediate: true },
	);

	const usedCredentialIds = computed(() => {
		const ids = new Set<string>();
		for (const workflowId of selectedWorkflowIds.value) {
			for (const dependency of getDependencies(workflowId, 'workflow')?.dependencies ?? []) {
				if (dependency.type === 'credentialId') ids.add(dependency.id);
			}
		}
		return ids;
	});

	return { usedCredentialIds, loading };
}
