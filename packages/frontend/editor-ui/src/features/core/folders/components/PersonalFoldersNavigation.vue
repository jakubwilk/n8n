<script lang="ts" setup>
// Fork: sidebar section with the root folders of the Personal project.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { PROJECT_ROOT } from 'n8n-workflow';
import { N8nIcon, N8nMenuItem, N8nText } from '@n8n/design-system';
import type { IMenuItem } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useRootStore } from '@n8n/stores/useRootStore';
import { useSettingsStore } from '@n8n/stores/settings.store';
import { getDebounceTime } from '@n8n/composables/useDebounce';
import { DEBOUNCE_TIME, VIEWS } from '@/app/constants';
import { useDocumentVisibility } from '@/app/composables/useDocumentVisibility';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import { sourceControlEventBus } from '@/features/integrations/sourceControl.ee/sourceControl.eventBus';
import { useFoldersStore } from '../folders.store';
import { foldersEventBus } from '../folders.eventBus';
import * as foldersApi from '../folders.api';

const COLLAPSED_KEY = 'n8n:sidebar:personal-folders-collapsed';
// The section is a shortcut, so one page of folders is enough.
const MAX_FOLDERS = 100;
const REFRESH_ACTIONS = new Set([
	'createFolder',
	'deleteFolder',
	'renameFolder',
	'moveFolder',
	'moveFolderToProject',
]);

type RootFolder = { id: string; name: string };

const props = defineProps<{
	collapsed: boolean;
}>();

const locale = useI18n();
const route = useRoute();
const rootStore = useRootStore();
const settingsStore = useSettingsStore();
const projectsStore = useProjectsStore();
const foldersStore = useFoldersStore();

const folders = ref<RootFolder[]>([]);
const sectionCollapsed = ref(localStorage.getItem(COLLAPSED_KEY) === 'true');

watch(sectionCollapsed, (val) => localStorage.setItem(COLLAPSED_KEY, String(val)));

const personalProjectId = computed(() => projectsStore.personalProject?.id);
const isEnabled = computed(
	() => settingsStore.isFoldersFeatureEnabled && personalProjectId.value !== undefined,
);

const isVisible = computed(() => isEnabled.value && !props.collapsed && folders.value.length > 0);

let requestId = 0;

async function loadFolders() {
	const projectId = personalProjectId.value;
	if (!isEnabled.value || !projectId) {
		folders.value = [];
		return;
	}

	// Only the latest response is applied, so a slow request cannot overwrite a newer list.
	const currentRequest = ++requestId;
	try {
		const { data } = await foldersApi.getProjectFolders(
			rootStore.restApiContext,
			projectId,
			{ sortBy: 'name:asc', take: MAX_FOLDERS },
			{ parentFolderId: PROJECT_ROOT },
			['id', 'name'],
		);
		if (currentRequest !== requestId) return;
		folders.value = data.map(({ id, name }) => ({ id, name }));
	} catch {
		// The section is only a navigation shortcut, so a failed load hides it without a toast.
		if (currentRequest === requestId) folders.value = [];
	}
}

const refreshFolders = useDebounceFn(
	loadFolders,
	getDebounceTime(DEBOUNCE_TIME.API.RESOURCE_SEARCH),
);

function scheduleRefresh() {
	void refreshFolders();
}

watch(
	[isEnabled, personalProjectId],
	() => {
		void loadFolders();
	},
	{ immediate: true },
);

// Pinia removes this listener when the component unmounts.
foldersStore.$onAction(({ name, after }) => {
	if (!REFRESH_ACTIONS.has(name)) return;
	after(scheduleRefresh);
});

const { onDocumentVisible } = useDocumentVisibility();
onDocumentVisible(scheduleRefresh);

onMounted(() => {
	foldersEventBus.on('folder-created', scheduleRefresh);
	sourceControlEventBus.on('pull', scheduleRefresh);
});

onBeforeUnmount(() => {
	foldersEventBus.off('folder-created', scheduleRefresh);
	sourceControlEventBus.off('pull', scheduleRefresh);
});

/** Walks up the cached breadcrumbs, so a subfolder highlights its root folder. */
const activeRootFolderId = computed(() => {
	if (route.name !== VIEWS.PROJECTS_FOLDERS) return undefined;
	if (route.params.projectId !== personalProjectId.value) return undefined;

	const folderId = route.params.folderId;
	if (typeof folderId !== 'string' || !folderId) return undefined;

	let currentId = folderId;
	const visited = new Set<string>();
	while (!visited.has(currentId)) {
		visited.add(currentId);
		const parentId = foldersStore.getCachedFolder(currentId)?.parentFolder;
		if (!parentId) break;
		currentId = parentId;
	}
	return currentId;
});

const getFolderMenuItem = (folder: RootFolder): IMenuItem => ({
	id: `personal-folder-${folder.id}`,
	label: folder.name,
	icon: 'folder',
	route: {
		to: {
			name: VIEWS.PROJECTS_FOLDERS,
			params: { projectId: personalProjectId.value, folderId: folder.id },
		},
	},
});
</script>

<template>
	<div v-if="isVisible" data-test-id="personal-folders-section">
		<button
			type="button"
			:class="$style.sectionHeader"
			:aria-expanded="!sectionCollapsed"
			data-test-id="personal-folders-toggle"
			@click="sectionCollapsed = !sectionCollapsed"
		>
			<N8nText size="small" bold color="text-light">
				{{ locale.baseText('projects.menu.folders') }}
			</N8nText>
			<N8nIcon
				icon="chevron-down"
				size="small"
				:class="[$style.chevron, sectionCollapsed ? $style.chevronCollapsed : '']"
			/>
		</button>
		<div v-if="!sectionCollapsed" :class="$style.items">
			<N8nMenuItem
				v-for="folder in folders"
				:key="folder.id"
				:item="getFolderMenuItem(folder)"
				:active="activeRootFolderId === folder.id"
				data-test-id="personal-folder-menu-item"
			/>
		</div>
	</div>
</template>

<style lang="scss" module>
@use '@n8n/design-system/css/mixins/_focus.scss' as focus;

.items {
	padding: var(--spacing--2xs) var(--spacing--3xs);
}

.sectionHeader {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
	width: calc(100% - var(--spacing--3xs) * 2);
	box-sizing: border-box;
	padding: var(--spacing--4xs) var(--spacing--3xs);
	margin: var(--spacing--4xs) var(--spacing--3xs) 0;
	background: none;
	border: none;
	border-radius: var(--spacing--4xs);
	cursor: pointer;
	color: inherit;

	&:hover {
		background-color: var(--color--background--light-1);
		color: var(--color--text--shade-1);

		.chevron {
			color: var(--color--text--shade-1);
		}
	}

	&:focus-visible {
		@include focus.focus-ring;
	}
}

.chevron {
	color: var(--color--text--tint-1);
	transition: transform 0.15s ease;
	flex-shrink: 0;
}

.chevronCollapsed {
	transform: rotate(-90deg);
}
</style>
