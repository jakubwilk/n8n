<script setup lang="ts">
// Fork: CPU, memory and disk usage of the server, shown under the insights summary.
import { N8nText } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { getResourcePermissions } from '@n8n/permissions';
import { useSettingsStore } from '@n8n/stores/settings.store';
import { useUsersStore } from '@n8n/stores/users.store';
import { computed, useCssModule } from 'vue';

import HostStatsChart from './HostStatsChart.vue';
import { useHostStats } from './useHostStats';

const GB = 1024 ** 3;

// Chart lines need plain RGB, because the fill reuses the colour with transparency.
const CPU_RGB = '255, 111, 92';
const MEMORY_RGB = '124, 92, 255';

const i18n = useI18n();
const $style = useCssModule();
const settingsStore = useSettingsStore();
const usersStore = useUsersStore();

const isEnabled = computed(
	() =>
		settingsStore.isModuleActive('host-stats') &&
		getResourcePermissions(usersStore.currentUser?.globalScopes).orchestration.read === true,
);

const { stats, hasError } = useHostStats(isEnabled);

const samples = computed(() => stats.value?.samples ?? []);
const latest = computed(() => samples.value.at(-1));

const labels = computed(() => samples.value.map((s) => new Date(s.timestamp).toLocaleTimeString()));

const percent = (used: number, total: number) => (total > 0 ? (100 * used) / total : 0);

const cpuValues = computed(() => samples.value.map((s) => s.cpuPercent));
const memoryValues = computed(() =>
	samples.value.map((s) => percent(s.memoryUsedBytes, s.memoryTotalBytes)),
);

const cpuPercent = computed(() => latest.value?.cpuPercent ?? null);
const memoryPercent = computed(() =>
	latest.value ? percent(latest.value.memoryUsedBytes, latest.value.memoryTotalBytes) : null,
);
const diskPercent = computed(() =>
	latest.value ? percent(latest.value.diskUsedBytes, latest.value.diskTotalBytes) : null,
);

const toGb = (bytes: number) => (bytes / GB).toFixed(1);

const usedOfTotal = (used: number, total: number) =>
	i18n.baseText('hostStats.usedOfTotal', {
		interpolate: { used: toGb(used), total: toGb(total) },
	});

const formatPercent = (value: number | null) => (value === null ? '--' : value.toFixed(1));

const levelClass = (value: number | null) => {
	if (value === null) return undefined;
	if (value >= 90) return $style.danger;
	if (value >= 80) return $style.warning;
	return undefined;
};

const uptime = computed(() => {
	const seconds = stats.value?.uptimeSeconds ?? 0;
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const value =
		days > 0
			? i18n.baseText('hostStats.duration.days', { interpolate: { days, hours } })
			: i18n.baseText('hostStats.duration.hours', { interpolate: { hours, minutes } });
	return i18n.baseText('hostStats.uptime', { interpolate: { value } });
});

const loadAverage = computed(() =>
	i18n.baseText('hostStats.loadAverage', {
		interpolate: { value: (stats.value?.loadAverage ?? []).map((l) => l.toFixed(2)).join(' ') },
	}),
);

const cores = computed(() =>
	i18n.baseText('hostStats.cores', { interpolate: { count: stats.value?.cpuCount ?? 0 } }),
);
</script>

<template>
	<section v-if="isEnabled" :class="$style.hostStats" data-test-id="host-stats">
		<header :class="$style.header">
			<N8nText bold color="text-dark">{{ i18n.baseText('hostStats.title') }}</N8nText>
			<N8nText v-if="stats" color="text-light">
				{{ i18n.baseText('hostStats.lastHour') }} · {{ uptime }}
			</N8nText>
		</header>

		<p v-if="hasError && !latest" :class="$style.unavailable" data-test-id="host-stats-unavailable">
			{{ i18n.baseText('hostStats.unavailable') }}
		</p>

		<ul v-else-if="latest" :class="$style.cards">
			<li data-test-id="host-stats-cpu">
				<strong>{{ i18n.baseText('hostStats.cpu') }}</strong>
				<em :class="levelClass(cpuPercent)">{{ formatPercent(cpuPercent) }}<i>%</i></em>
				<small>{{ loadAverage }} · {{ cores }}</small>
				<HostStatsChart
					:label="i18n.baseText('hostStats.cpu')"
					:labels="labels"
					:values="cpuValues"
					:rgb="CPU_RGB"
				/>
			</li>
			<li data-test-id="host-stats-memory">
				<strong>{{ i18n.baseText('hostStats.memory') }}</strong>
				<em :class="levelClass(memoryPercent)">{{ formatPercent(memoryPercent) }}<i>%</i></em>
				<small>{{ usedOfTotal(latest.memoryUsedBytes, latest.memoryTotalBytes) }}</small>
				<HostStatsChart
					:label="i18n.baseText('hostStats.memory')"
					:labels="labels"
					:values="memoryValues"
					:rgb="MEMORY_RGB"
				/>
			</li>
			<li data-test-id="host-stats-disk">
				<strong>{{ i18n.baseText('hostStats.disk') }}</strong>
				<em :class="levelClass(diskPercent)">{{ formatPercent(diskPercent) }}<i>%</i></em>
				<small>{{ usedOfTotal(latest.diskUsedBytes, latest.diskTotalBytes) }}</small>
				<div :class="$style.bar">
					<span
						:class="levelClass(diskPercent)"
						:style="{ width: `${Math.min(100, diskPercent ?? 0)}%` }"
					/>
				</div>
				<small>
					{{
						i18n.baseText('hostStats.free', {
							interpolate: { value: toGb(latest.diskTotalBytes - latest.diskUsedBytes) },
						})
					}}
				</small>
			</li>
		</ul>
	</section>
</template>

<style lang="scss" module>
.hostStats {
	margin-bottom: var(--spacing--lg);
}

/* Same text and spacing as the Overview description above the insights summary. */
.header {
	display: flex;
	align-items: baseline;
	gap: var(--spacing--xs);
	margin-bottom: var(--spacing--md);
}

.unavailable {
	padding: var(--spacing--sm) var(--spacing--lg);
	border: var(--border);
	border-radius: 6px;
	color: var(--color--text--tint-1);
	font-size: var(--font-size--2xs);
}

.cards {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	border: var(--border);
	border-radius: 6px;
	list-style: none;
	overflow: hidden;

	li {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: var(--spacing--xs) var(--spacing--lg);
		background-color: var(--background--surface);
		border-left: var(--border);

		&:first-child {
			border-left: 0;
		}
	}

	strong {
		color: var(--color--text--shade-1);
		font-size: var(--font-size--sm);
		font-weight: var(--font-weight--regular);
		margin-bottom: var(--spacing--3xs);
	}

	em {
		display: flex;
		align-items: baseline;
		gap: var(--spacing--5xs);
		color: var(--color--text--shade-1);
		font-size: var(--font-size--xl);
		font-style: normal;
		font-weight: var(--font-weight--medium);
		line-height: 100%;

		i {
			font-size: var(--font-size--md);
			font-style: normal;
		}
	}

	small {
		margin-top: var(--spacing--4xs);
		color: var(--color--text--tint-1);
		font-size: var(--font-size--2xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
}

.bar {
	height: var(--spacing--2xs);
	margin-top: var(--spacing--xs);
	border-radius: var(--spacing--5xs);
	background-color: var(--color--foreground);
	overflow: hidden;

	span {
		display: block;
		height: 100%;
		background-color: var(--color--success);

		&.warning {
			background-color: var(--color--warning);
		}

		&.danger {
			background-color: var(--color--danger);
		}
	}
}

em.warning {
	color: var(--color--warning);
}

em.danger {
	color: var(--color--danger);
}
</style>
