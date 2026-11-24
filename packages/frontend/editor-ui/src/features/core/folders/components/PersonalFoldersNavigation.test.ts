import { createRouter, createMemoryHistory } from 'vue-router';
import { createTestingPinia } from '@pinia/testing';
import { waitFor } from '@testing-library/vue';
import { PROJECT_ROOT } from 'n8n-workflow';
import { createComponentRenderer } from '@/__tests__/render';
import { mockedStore } from '@/__tests__/utils';
import { VIEWS } from '@/app/constants';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import { createTestProject } from '@/features/collaboration/projects/__tests__/utils';
import { useSettingsStore } from '@n8n/stores/settings.store';
import { useFoldersStore } from '../folders.store';
import * as foldersApi from '../folders.api';
import type { ChangeLocationSearchResponseItem, FolderCreateResponse } from '../folders.types';
import PersonalFoldersNavigation from './PersonalFoldersNavigation.vue';

vi.mock('../folders.api', () => ({
	getProjectFolders: vi.fn(),
	createFolder: vi.fn(),
}));

const router = createRouter({
	history: createMemoryHistory(),
	routes: [
		{ path: '/', name: 'home', component: { template: '<div />' } },
		{
			path: '/projects/:projectId/folders/:folderId?/workflows',
			name: VIEWS.PROJECTS_FOLDERS,
			component: { template: '<div />' },
		},
	],
});

const renderComponent = createComponentRenderer(PersonalFoldersNavigation, {
	// The real RouterLink renders the href, the default stub does not.
	global: { plugins: [router], stubs: { RouterLink: false } },
});

const personalProject = createTestProject({ id: 'personal-1', type: 'personal' });
// The section reads only `id` and `name`, the API returns more.
const createFolderItem = (id: string, name: string) =>
	({ id, name, path: [] }) as unknown as ChangeLocationSearchResponseItem;
const rootFolders = [createFolderItem('folder-a', 'Alpha'), createFolderItem('folder-b', 'Beta')];

describe('PersonalFoldersNavigation', () => {
	let settingsStore: ReturnType<typeof mockedStore<typeof useSettingsStore>>;
	let projectsStore: ReturnType<typeof mockedStore<typeof useProjectsStore>>;

	beforeEach(async () => {
		vi.clearAllMocks();
		localStorage.clear();
		// Runs debounced refreshes on the next tick.
		sessionStorage.setItem('N8N_DEBOUNCE_MULTIPLIER', '0');
		createTestingPinia({ stubActions: false });

		settingsStore = mockedStore(useSettingsStore);
		projectsStore = mockedStore(useProjectsStore);
		settingsStore.isFoldersFeatureEnabled = true;
		projectsStore.personalProject = personalProject;

		vi.mocked(foldersApi.getProjectFolders).mockResolvedValue({
			data: rootFolders,
			count: rootFolders.length,
		});

		await router.push('/');
	});

	afterEach(() => {
		sessionStorage.removeItem('N8N_DEBOUNCE_MULTIPLIER');
	});

	it('requests only the root folders of the personal project', async () => {
		renderComponent({ props: { collapsed: false } });

		await waitFor(() => expect(foldersApi.getProjectFolders).toHaveBeenCalledTimes(1));
		expect(foldersApi.getProjectFolders).toHaveBeenCalledWith(
			expect.anything(),
			'personal-1',
			expect.objectContaining({ sortBy: 'name:asc' }),
			{ parentFolderId: PROJECT_ROOT },
			['id', 'name'],
		);
	});

	it('renders a link to each root folder', async () => {
		const { findAllByTestId, getByText } = renderComponent({ props: { collapsed: false } });

		const items = await findAllByTestId('personal-folder-menu-item');
		expect(items).toHaveLength(2);
		expect(getByText('Alpha').closest('a')).toHaveAttribute(
			'href',
			'/projects/personal-1/folders/folder-a/workflows',
		);
	});

	it('hides the section when the sidebar is collapsed', async () => {
		const { queryByTestId } = renderComponent({ props: { collapsed: true } });

		await waitFor(() => expect(foldersApi.getProjectFolders).toHaveBeenCalled());
		expect(queryByTestId('personal-folders-section')).not.toBeInTheDocument();
	});

	it('hides the section when there are no root folders', async () => {
		vi.mocked(foldersApi.getProjectFolders).mockResolvedValue({ data: [], count: 0 });
		const { queryByTestId } = renderComponent({ props: { collapsed: false } });

		await waitFor(() => expect(foldersApi.getProjectFolders).toHaveBeenCalled());
		expect(queryByTestId('personal-folders-section')).not.toBeInTheDocument();
	});

	it('hides the section when the load fails', async () => {
		vi.mocked(foldersApi.getProjectFolders).mockRejectedValue(new Error('Request failed'));
		const { queryByTestId } = renderComponent({ props: { collapsed: false } });

		await waitFor(() => expect(foldersApi.getProjectFolders).toHaveBeenCalled());
		expect(queryByTestId('personal-folders-section')).not.toBeInTheDocument();
	});

	it('does not load folders when the folders feature is disabled', async () => {
		settingsStore.isFoldersFeatureEnabled = false;
		const { queryByTestId } = renderComponent({ props: { collapsed: false } });

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(foldersApi.getProjectFolders).not.toHaveBeenCalled();
		expect(queryByTestId('personal-folders-section')).not.toBeInTheDocument();
	});

	it('collapses the folder list and stores the state', async () => {
		const { findByTestId, queryAllByTestId } = renderComponent({ props: { collapsed: false } });

		const toggle = await findByTestId('personal-folders-toggle');
		toggle.click();

		await waitFor(() => expect(queryAllByTestId('personal-folder-menu-item')).toHaveLength(0));
		expect(localStorage.getItem('n8n:sidebar:personal-folders-collapsed')).toBe('true');
	});

	it('reloads the list after a folder is created', async () => {
		vi.mocked(foldersApi.createFolder).mockResolvedValue({
			id: 'folder-c',
			name: 'Gamma',
		} as FolderCreateResponse);
		const { findAllByTestId } = renderComponent({ props: { collapsed: false } });
		await findAllByTestId('personal-folder-menu-item');

		vi.mocked(foldersApi.getProjectFolders).mockResolvedValue({
			data: [...rootFolders, createFolderItem('folder-c', 'Gamma')],
			count: 3,
		});
		await useFoldersStore().createFolder('Gamma', 'personal-1');

		await waitFor(async () =>
			expect(await findAllByTestId('personal-folder-menu-item')).toHaveLength(3),
		);
	});

	it('marks the root folder as active when a subfolder is open', async () => {
		const foldersStore = useFoldersStore();
		foldersStore.breadcrumbsCache = {
			'folder-a': { id: 'folder-a', name: 'Alpha', parentFolder: undefined },
			'sub-1': { id: 'sub-1', name: 'Sub', parentFolder: 'folder-a' },
		};
		await router.push('/projects/personal-1/folders/sub-1/workflows');

		const { findAllByRole } = renderComponent({ props: { collapsed: false } });

		const links = await findAllByRole('menuitem');
		const alpha = links.find((link) => link.id === 'personal-folder-folder-a');
		const beta = links.find((link) => link.id === 'personal-folder-folder-b');
		expect(alpha?.className).toContain('active');
		expect(beta?.className).not.toContain('active');
	});
});
