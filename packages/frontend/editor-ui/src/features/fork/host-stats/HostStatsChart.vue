<script setup lang="ts">
// Fork: one-hour usage line of the host stats section.
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { Chart as ChartJS, Filler } from 'chart.js';
import { computed } from 'vue';
import { Line } from 'vue-chartjs';

// The global chart plugin does not register the area fill.
ChartJS.register(Filler);

const props = defineProps<{
	label: string;
	labels: string[];
	values: Array<number | null>;
	/** `r, g, b`, so the fill can reuse it with transparency. */
	rgb: string;
}>();

const data = computed<ChartData<'line'>>(() => ({
	labels: props.labels,
	datasets: [
		{
			label: props.label,
			data: props.values,
			borderColor: `rgb(${props.rgb})`,
			backgroundColor: `rgba(${props.rgb}, 0.15)`,
			borderWidth: 1.5,
			fill: 'origin',
			pointRadius: 0,
			pointHoverRadius: 3,
			tension: 0.3,
			spanGaps: true,
		},
	],
}));

const options = computed<ChartOptions<'line'>>(() => ({
	responsive: true,
	maintainAspectRatio: false,
	animation: false,
	interaction: { mode: 'index', intersect: false },
	plugins: {
		legend: { display: false },
		tooltip: {
			displayColors: false,
			callbacks: {
				label: (item: TooltipItem<'line'>) => `${props.label}: ${item.parsed.y.toFixed(1)}%`,
			},
		},
	},
	scales: {
		x: { display: false },
		y: { display: false, min: 0, max: 100 },
	},
}));
</script>

<template>
	<div :class="$style.chart">
		<Line :data="data" :options="options" />
	</div>
</template>

<style lang="scss" module>
.chart {
	position: relative;
	height: 56px;
	margin-top: var(--spacing--2xs);
}
</style>
