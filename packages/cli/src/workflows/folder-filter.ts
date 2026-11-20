import { FolderFinderService } from '@n8n/backend-services';
import { Container } from '@n8n/di';

import type { ListQuery } from '@/requests';

/**
 * Adds the subfolders of each folder in `filter.parentFolderIds`, so the folder
 * filter on the workflow list covers the whole tree under each selected folder.
 *
 * Only the REST list endpoint calls this. Internal callers of `getMany` pass
 * `parentFolderIds` that they already resolved.
 */
export async function expandFolderFilterToSubtrees(
	options?: ListQuery.Options,
): Promise<ListQuery.Options | undefined> {
	const parentFolderIds = options?.filter?.parentFolderIds;
	if (!Array.isArray(parentFolderIds) || parentFolderIds.length === 0) return options;

	const folderFinderService = Container.get(FolderFinderService);
	const folderIds = parentFolderIds.filter((id): id is string => typeof id === 'string');
	const expanded = await Promise.all(
		folderIds.map(
			async (id) => await folderFinderService.findFolderFilterIdsWithoutAccessCheck(id, true),
		),
	);

	// Keep the selected ids, so an unknown folder still matches nothing.
	// An empty list would remove the filter and show every workflow.
	return {
		...options,
		filter: {
			...options?.filter,
			parentFolderIds: [...new Set([...folderIds, ...expanded.flat()])],
		},
	};
}
