'use strict';
'require view';
'require form';
'require fs';
'require poll';
'require ui';
'require uci';

function fanStatus() {
	return L.resolveDefault(fs.exec_direct('/usr/bin/fancontrol', [ 'status' ], 'json'), {});
}

function n(value) {
	value = Number(value);
	return isFinite(value) ? value : null;
}

function fmtTemp(value) {
	value = n(value);
	return value != null ? '%.1f °C'.format(value / 1000) : '-';
}

function fmtTempInt(value) {
	value = n(value);
	return value != null ? '%d°C'.format(Math.floor(value / 1000)) : '-';
}

function fmtSource(source) {
	if (source == 'CPU')
		return 'CPU';
	if (source == 'Wi-Fi 0')
		return 'Wi-Fi 0';
	if (source == 'Wi-Fi 1')
		return 'Wi-Fi 1';
	if (source == 'Ethernet')
		return 'Ethernet';
	return source ? source : '-';
}

function fmtReason(reason) {
	return (reason || '-');
}

function fmtFan(status) {
	var rpm = n(status.rpm);
	var pct = n(status.target_percent);
	var rpmPct = n(status.rpm_percent);
	var rpmMin = n(status.rpm_min);
	var rpmMax = n(status.rpm_max);
	var maxSource = status.rpm_max_source;
	var label = status.level_label || '-';
	var parts = [ label ];

	if (Number(status.fault) == 1) {
		label = 'Fault protection';
		pct = 100;
		parts = [ label ];
	}
	else if ((status.reason || '').indexOf('Confirming startup') >= 0) {
		label = 'Confirming startup';
		parts = [ label ];
	}
	else if (pct == null) {
		pct = n(status.pwm_percent);
	}

	if (pct != null)
		parts.push('Fan power %d%%'.format(pct));
	if (rpm != null)
		parts.push('~%d RPM'.format(rpm));
	if (rpmPct != null)
		parts.push('RPM ~%d%%'.format(rpmPct));
	if (rpmMin != null && rpmMax != null)
		parts.push('RPM range %d - ~%d%s'.format(
			rpmMin,
			rpmMax,
			maxSource == 'observed' ? ' (measured)' : ' (estimated)'
		));

	return parts.join(' · ');
}

function modeText(mode) {
	if (mode == 'auto')
		return 'Automatic';
	if (mode == 'fixed')
		return 'Fixed fan power';
	return 'System default';
}

function profileText(status) {
	if (status.auto_profile == 'custom' && Number(status.curve_valid) == 1)
		return 'Custom temperature';
	if (status.auto_profile == 'custom' && Number(status.curve_valid) != 1)
		return 'Custom temperature invalid, using recommended curve';
	return 'Recommended curve';
}

function badgeClass(status) {
	if (!status || Number(status.hardware_ready) != 1 || Number(status.fault) == 1 || Number(status.temp_fault) == 1)
		return 'fan-badge fan-badge-red';
	if (status.mode == 'system')
		return 'fan-badge fan-badge-blue';
	if (status.mode == 'fixed')
		return 'fan-badge fan-badge-orange';
	if ((status.reason || '').indexOf('Confirming startup') >= 0)
		return 'fan-badge fan-badge-green';
	if (status.level == 'full')
		return 'fan-badge fan-badge-red';
	if (status.level == 'high')
		return 'fan-badge fan-badge-orange';
	if (status.level == 'medium')
		return 'fan-badge fan-badge-yellow';
	if (status.level == 'low')
		return 'fan-badge fan-badge-cyan';
	return 'fan-badge fan-badge-green';
}

function badgeText(status) {
	if (!status || Number(status.hardware_ready) != 1)
		return 'Fan hardware not detected';
	if (Number(status.temp_fault) == 1)
		return 'Temperature sensor fault';
	if (Number(status.fault) == 1)
		return 'Fan fault protection';
	if (status.mode == 'system')
		return 'Controlled by system default';
	if (status.mode == 'fixed')
		return 'Running in fixed fan power mode';
	if (Number(status.service_running) != 1)
		return 'Automatic control not running';
	if ((status.reason || '').indexOf('Confirming startup') >= 0)
		return 'Automatic control running · confirming startup';
	if (status.level == 'off')
		return 'Automatic control running · currently stopped';
	return 'Automatic control running · ' + (status.level_label || 'cooling');
}

function setText(id, value) {
	var node = document.getElementById(id);
	if (node)
		node.textContent = value;
}

function setCurveStep(id, title, body) {
	var titleNode = document.getElementById(id + '-title');
	var bodyNode = document.getElementById(id + '-body');
	if (titleNode)
		titleNode.textContent = title;
	if (bodyNode)
		bodyNode.textContent = body;
}

function updateCurve(status) {
	status = status || {};

	setText('fancontrol-curve-profile', profileText(status));
	setText('fancontrol-hero-main', '%s: starts at %s, stops after staying below %s for %d s.'.format(
		profileText(status),
		fmtTempInt(status.auto_start_low_mC),
		fmtTempInt(status.auto_drop_off_mC),
		n(status.auto_hold_off) || 90
	));

	setCurveStep('curve-off',
		'< ' + fmtTempInt(status.auto_start_low_mC),
		'Stopped; drops to off from low speed at ' + fmtTempInt(status.auto_drop_off_mC) + ', stops once stable for ' + (n(status.auto_hold_off) || 90) + ' s');
	setCurveStep('curve-low',
		'>= ' + fmtTempInt(status.auto_start_low_mC),
		'Low speed 50%; drops back from medium at ' + fmtTempInt(status.auto_drop_low_mC) + ', once stable for ' + (n(status.auto_hold_low) || 60) + ' s');
	setCurveStep('curve-med',
		'>= ' + fmtTempInt(status.auto_start_med_mC),
		'Medium speed 70%; drops back from high at ' + fmtTempInt(status.auto_drop_med_mC) + ', once stable for ' + (n(status.auto_hold_med) || 60) + ' s');
	setCurveStep('curve-high',
		'>= ' + fmtTempInt(status.auto_start_high_mC),
		'High speed 85%; drops back from full at ' + fmtTempInt(status.auto_drop_high_mC) + ', once stable for ' + (n(status.auto_hold_high) || 45) + ' s');
	setCurveStep('curve-full',
		'>= ' + fmtTempInt(status.auto_start_full_mC),
		'Full-speed protection 100%, responds immediately');
}

function updateStatus(status) {
	status = status || {};

	var badge = document.getElementById('fancontrol-badge');
	if (badge) {
		badge.className = badgeClass(status);
		badge.textContent = badgeText(status);
	}

	setText('fancontrol-control-temp', '%s (highest: %s)'.format(fmtTemp(status.control_temp_mC || status.temp_mC), fmtSource(status.control_temp_source)));
	setText('fancontrol-temp', fmtTemp(status.cpu_temp_mC || status.raw_temp_mC));
	setText('fancontrol-wifi', [ fmtTemp(status.wifi0_temp_mC), fmtTemp(status.wifi1_temp_mC) ].join(' / '));
	setText('fancontrol-eth', fmtTemp(status.eth_temp_mC));
	setText('fancontrol-fan', fmtFan(status));
	setText('fancontrol-mode', modeText(status.mode));
	setText('fancontrol-profile', profileText(status));
	setText('fancontrol-reason', fmtReason(status.reason));
	setText('fancontrol-default', 'Kernel policy %s, device tree levels %s'.format(status.thermal_policy || 'step_wise', status.default_levels || '0% / 50% / 75% / 100%'));

	updateCurve(status);
}

function statusRow(label, id) {
	return E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td left', 'style': 'width: 190px' }, label),
		E('td', { 'class': 'td', 'id': id }, '-')
	]);
}

function refreshStatus() {
	return fanStatus().then(function(status) {
		updateStatus(status);
		return status;
	});
}

function fieldValue(name) {
	var node = document.querySelector('[name="cbid.fancontrol.settings.' + name + '"]');
	return node ? node.value : null;
}

function validateCurveUi() {
	var mode = fieldValue('mode');
	var profile = fieldValue('auto_profile');
	var values, names, ranges, i, v;

	if (mode != 'auto' || profile != 'custom')
		return true;

	names = [ 'Stop temperature', 'Low-speed start temperature', 'Medium-speed start temperature', 'High-speed start temperature', 'Full-speed protection temperature' ];
	values = [
		Number(fieldValue('auto_stop_temp')),
		Number(fieldValue('auto_low_temp')),
		Number(fieldValue('auto_med_temp')),
		Number(fieldValue('auto_high_temp')),
		Number(fieldValue('auto_full_temp'))
	];
	ranges = [
		[ 45, 70 ],
		[ 55, 78 ],
		[ 60, 84 ],
		[ 68, 88 ],
		[ 80, 90 ]
	];

	for (i = 0; i < values.length; i++) {
		v = values[i];
		if (!isFinite(v) || Math.floor(v) != v || v < ranges[i][0] || v > ranges[i][1]) {
			ui.addNotification(null, E('p', '%s must be an integer between %d-%d°C.'.format(names[i], ranges[i][0], ranges[i][1])), 'danger');
			return false;
		}
	}

	for (i = 1; i < values.length; i++) {
		if (values[i] - values[i - 1] < 3) {
			ui.addNotification(null, E('p', 'Temperatures must increase as Stop < Low < Medium < High < Full protection, with at least 3°C between adjacent points.'), 'danger');
			return false;
		}
	}

	return true;
}

function applyFancontrol() {
	return fs.exec('/usr/bin/fancontrol', [ 'apply' ])
		.then(function() {
			return new Promise(function(resolve) {
				window.setTimeout(resolve, 1200);
			});
		})
		.then(refreshStatus);
}

function saveAndApply(map) {
	if (!validateCurveUi())
		return Promise.resolve();

	return map.save(null, true)
		.then(function() {
			return L.resolveDefault(ui.changes.apply(false), null);
		})
		.then(applyFancontrol)
		.catch(function(err) {
			ui.addNotification(null, E('p', 'Apply failed: %s'.format(err.message || err)), 'danger');
		});
}

function styleBlock() {
	return E('style', {}, [
		'.fan-hero{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin:0 0 16px 0;padding:18px 20px;border-radius:8px;background:#222;}',
		'.fan-badge{display:inline-flex;align-items:center;min-height:34px;padding:8px 14px;border-radius:8px;font-size:18px;font-weight:700;letter-spacing:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);}',
		'.fan-badge-blue{background:#183b66;color:#d8ecff}.fan-badge-green{background:#154d2f;color:#d8ffe8}.fan-badge-cyan{background:#0d4b55;color:#d8fbff}.fan-badge-yellow{background:#5a4a12;color:#fff2b8}.fan-badge-orange{background:#633715;color:#ffe2c7}.fan-badge-red{background:#661f24;color:#ffe0e0}',
		'.fan-note{line-height:1.7;color:#ddd}.fan-note strong{color:#fff}.fan-muted{color:#aaa;font-size:12px}',
		'.fan-status-table .td{vertical-align:middle}.fan-status-table .td:first-child{width:190px;text-align:left}.fan-status-table .td:nth-child(2){text-align:left!important}',
		'.fan-curve{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:10px;margin-top:10px}.fan-step{min-height:74px;padding:10px 12px;border-radius:8px;background:#1c1c1c;border:1px solid #444}.fan-step b{display:block;margin-bottom:4px;color:#fff}.fan-step span{color:#bbb;font-size:12px;line-height:1.5}',
		'@media(max-width:900px){.fan-curve{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}}'
	]);
}

function curveStep(id) {
	return E('div', { 'class': 'fan-step' }, [
		E('b', { 'id': id + '-title' }, '-'),
		E('span', { 'id': id + '-body' }, '-')
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('fancontrol'),
			fanStatus()
		]);
	},

	render: function(data) {
		var m, s, o;
		var initialStatus = data[1] || {};

		var statusBox = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'fan-hero' }, [
				E('div', { 'id': 'fancontrol-badge', 'class': 'fan-badge fan-badge-blue' }, 'Loading...'),
				E('div', { 'class': 'fan-note' }, [
					E('div', {}, [ E('strong', {}, 'Fan curve: '), E('span', { 'id': 'fancontrol-hero-main' }, 'Loading...') ]),
					E('div', { 'class': 'fan-muted' }, 'Control temperature uses the highest reading among CPU, Wi-Fi, Ethernet, and other key sensors. Startup and downshifts wait for temperature stability to protect the fan.')
				])
			]),
			E('h3', {}, 'Live Status'),
			E('table', { 'class': 'table fan-status-table' }, [
				statusRow('Control temperature', 'fancontrol-control-temp'),
				statusRow('CPU temperature', 'fancontrol-temp'),
				statusRow('Wi-Fi temperature', 'fancontrol-wifi'),
				statusRow('Ethernet temperature', 'fancontrol-eth'),
				statusRow('Fan state', 'fancontrol-fan'),
				statusRow('Control mode', 'fancontrol-mode'),
				statusRow('Curve profile', 'fancontrol-profile'),
				statusRow('Current reason', 'fancontrol-reason'),
				statusRow('System default', 'fancontrol-default')
			])
		]);

		var curveBox = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, 'Automatic Fan Curve'),
			E('div', { 'class': 'fan-note' }, [
				'Current profile: ',
				E('strong', { 'id': 'fancontrol-curve-profile' }, 'Loading...'),
				'. Automatic mode only allows adjusting temperature points; fan power levels are fixed at 50% / 70% / 85% / 100% to prevent accidental fan damage.'
			]),
			E('div', { 'class': 'fan-curve' }, [
				curveStep('curve-off'),
				curveStep('curve-low'),
				curveStep('curve-med'),
				curveStep('curve-high'),
				curveStep('curve-full')
			])
		]);

		m = new form.Map('fancontrol', 'Fan Control');
		m.description = 'Uses system control by default. Automatic mode can use the recommended curve or custom temperature points only; fixed fan power is intended for temporary debugging only.';
		m.submit = false;
		m.reset = false;

		s = m.section(form.NamedSection, 'settings', 'settings', 'Settings');
		s.addremove = false;

		o = s.option(form.ListValue, 'mode', 'Control mode');
		o.value('system', 'System default');
		o.value('auto', 'Automatic');
		o.value('fixed', 'Fixed fan power (debug)');
		o.default = 'system';
		o.rmempty = false;

		o = s.option(form.ListValue, 'auto_profile', 'Curve profile');
		o.value('preset', 'Recommended curve');
		o.value('custom', 'Custom temperature');
		o.default = 'preset';
		o.rmempty = false;
		o.depends('mode', 'auto');
		o.description = 'Recommended curve is suitable for most GL-MT3600BE routers; custom temperature only adjusts temperature points and does not allow changing fan power levels.';

		o = s.option(form.Value, 'auto_stop_temp', 'Stop temperature');
		o.datatype = 'range(45,70)';
		o.default = '60';
		o.placeholder = '60';
		o.rmempty = false;
		o.depends({ mode: 'auto', auto_profile: 'custom' });
		o.description = 'After downshifting to low speed and reaching this temperature, it must stay stable for 90 seconds before the fan stops.';

		o = s.option(form.Value, 'auto_low_temp', 'Low-speed start');
		o.datatype = 'range(55,78)';
		o.default = '65';
		o.placeholder = '65';
		o.rmempty = false;
		o.depends({ mode: 'auto', auto_profile: 'custom' });
		o.description = 'Once this temperature is reached, the fan waits about 6 seconds to confirm before starting at low speed, to avoid frequent on/off cycling.';

		o = s.option(form.Value, 'auto_med_temp', 'Medium-speed start');
		o.datatype = 'range(60,84)';
		o.default = '72';
		o.placeholder = '72';
		o.rmempty = false;
		o.depends({ mode: 'auto', auto_profile: 'custom' });

		o = s.option(form.Value, 'auto_high_temp', 'High-speed start');
		o.datatype = 'range(68,88)';
		o.default = '79';
		o.placeholder = '79';
		o.rmempty = false;
		o.depends({ mode: 'auto', auto_profile: 'custom' });

		o = s.option(form.Value, 'auto_full_temp', 'Full-speed protection');
		o.datatype = 'range(80,90)';
		o.default = '86';
		o.placeholder = '86';
		o.rmempty = false;
		o.depends({ mode: 'auto', auto_profile: 'custom' });
		o.description = 'Reaching the full-speed protection temperature immediately sets 100% speed, without waiting for confirmation.';

		o = s.option(form.Value, 'fixed_percent', 'Fixed fan power');
		o.datatype = 'range(50,100)';
		o.default = '70';
		o.placeholder = '70';
		o.rmempty = false;
		o.depends('mode', 'fixed');
		o.description = 'Fixed mode has a minimum of 50% to avoid small fans stalling at low speed; automatic mode is recommended for long-term use.';

		o = s.option(form.Button, '_apply', 'Apply');
		o.inputstyle = 'apply';
		o.inputtitle = 'Save & Apply';
		o.onclick = function() {
			return saveAndApply(this.map);
		};

		o = s.option(form.Button, '_system', 'Restore system default');
		o.inputstyle = 'reset';
		o.inputtitle = 'Hand control back to system';
		o.onclick = function() {
			return fs.exec('/usr/bin/fancontrol', [ 'system' ])
				.then(function() {
					return new Promise(function(resolve) {
						window.setTimeout(resolve, 800);
					});
				})
				.then(function() {
					return uci.load('fancontrol');
				})
				.then(refreshStatus)
				.catch(function(err) {
					ui.addNotification(null, E('p', 'Operation failed: %s'.format(err.message || err)), 'danger');
				});
		};

		return m.render().then(function(mapEl) {
			var root = E('div', {}, [ styleBlock(), statusBox, curveBox, mapEl ]);

			updateStatus(initialStatus);
			poll.add(refreshStatus, 3);

			return root;
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
