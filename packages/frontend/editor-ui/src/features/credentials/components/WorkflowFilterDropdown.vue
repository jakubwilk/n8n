<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import { N8nOption, N8nSelect } from '@n8n/design-system';
import { onMounted, ref } from 'vue';

import { useWorkflowsListStore } from '@/app/stores/workflowsList.store';

/**
 * Multi-select of workflows, for the credential list filters.
 * Without a project id it lists every workflow the user can read.
 */

const props = defineProps<{
	modelValue: string[];
	projectId?: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string[]];
}>();

const i18n = useI18n();
const workflowsListStore = useWorkflowsListStore();

const workflows = ref<Array<{ id: string; name: string }>>([]);
const loading = ref(false);

onMounted(async () => {
	loading.value = true;
	try {
		const result = await workflowsListStore.searchWorkflows({
			projectId: props.projectId,
			isArchived: false,
			select: ['id', 'name'],
		});
		workflows.value = [...result].sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		// The filter stays empty. The credential list still works without it.
		workflows.value = [];
	} finally {
		loading.value = false;
	}
});
</script>

<template>
	<N8nSelect
		:model-value="modelValue"
		size="medium"
		multiple
		filterable
		:loading="loading"
		:placeholder="i18n.baseText('credentials.filters.workflows.placeholder')"
		:class="$style.wrapTags"
		data-test-id="credential-filter-workflows"
		data-attr="credential-filter-workflows"
		@update:model-value="emit('update:modelValue', $event)"
	>
		<N8nOption
			v-for="workflow in workflows"
			:key="workflow.id"
			:value="workflow.id"
			:label="workflow.name"
		/>
	</N8nSelect>
</template>

<style lang="scss" module>
/* Long workflow names wrap inside the chip, so the full name stays visible. */
.wrapTags {
	:global(.el-select__tags .el-tag) {
		height: auto;
		max-width: 100%;
		white-space: normal;
		text-align: left;
	}

	:global(.el-select__tags-text) {
		/* Makes the inline max-width from Element Plus apply */
		display: inline-block;
		white-space: normal;
		/* Breaks names that have no spaces */
		overflow-wrap: anywhere;
		line-height: var(--line-height--md);
	}
}
</style>
