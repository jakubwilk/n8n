<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import { N8nOption, N8nSelect } from '@n8n/design-system';
import { ref, watch } from 'vue';

import type { ChangeLocationSearchResult } from '../folders.types';
import { useFoldersStore } from '../folders.store';

/**
 * Multi-select of the folders in one project, for the workflow list filters.
 * The backend adds the subfolders of each selected folder.
 */

const props = defineProps<{
	modelValue: string[];
	projectId: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string[]];
}>();

const i18n = useI18n();
const foldersStore = useFoldersStore();

const folders = ref<ChangeLocationSearchResult[]>([]);
const loading = ref(false);

const fetchFolders = async () => {
	loading.value = true;
	try {
		folders.value = await foldersStore.fetchFoldersAvailableForMove(props.projectId);
	} catch {
		// The filter stays empty. The list itself still loads and shows its own errors.
		folders.value = [];
	} finally {
		loading.value = false;
	}
};

const getLabel = (folder: ChangeLocationSearchResult) =>
	folder.path.length ? folder.path.join(' / ') : folder.name;

watch(
	() => props.projectId,
	() => {
		folders.value = [];
		void fetchFolders();
	},
	{ immediate: true },
);
</script>

<template>
	<N8nSelect
		:model-value="modelValue"
		size="medium"
		multiple
		filterable
		:loading="loading"
		:placeholder="i18n.baseText('workflows.filters.folders.placeholder')"
		data-test-id="folder-filter-dropdown"
		data-attr="folder-filter-dropdown"
		@update:model-value="emit('update:modelValue', $event)"
	>
		<N8nOption
			v-for="folder in folders"
			:key="folder.id"
			:value="folder.id"
			:label="getLabel(folder)"
			data-test-id="folder-filter-option"
		/>
	</N8nSelect>
</template>
