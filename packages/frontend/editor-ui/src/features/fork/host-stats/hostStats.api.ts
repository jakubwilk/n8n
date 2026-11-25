// Fork: host resource stats, served by the backend `host-stats` module.
import type { HostStatsResponse } from '@n8n/api-types';
import type { IRestApiContext } from '@n8n/rest-api-client';
import { makeRestApiRequest } from '@n8n/rest-api-client';

export const fetchHostStats = async (context: IRestApiContext): Promise<HostStatsResponse> =>
	await makeRestApiRequest(context, 'GET', '/host-stats');

export const fetchHostStatsLatest = async (context: IRestApiContext): Promise<HostStatsResponse> =>
	await makeRestApiRequest(context, 'GET', '/host-stats/latest');
