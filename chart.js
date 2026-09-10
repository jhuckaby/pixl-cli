// Unicode Braille timeseries area charts for pixl-cli.
// Copyright (c) 2016 - 2026 Joseph Huckaby
// Released under the MIT License

var Width = require('./width');

var stringWidth = Width.stringWidth;
var numberFormatter = new Intl.NumberFormat();

// Braille characters contain two columns of four dots.  The Unicode bit order
// is not linear across the rows, so keep an explicit map for each column.
var brailleBits = {
	left: [0x01, 0x02, 0x04, 0x40],
	right: [0x08, 0x10, 0x20, 0x80]
};

function wholeNumber(value, defaultValue, minimum) {
	// Normalize layout options to safe, whole terminal cells.
	value = Math.floor( Number(value) );
	if (!isFinite(value)) value = defaultValue;
	return Math.max(minimum, value);
}

function styleList(value, defaultValue) {
	// The rest of pixl-cli uses arrays of chalk style names or functions.  Also
	// accept one style directly because chart colors are commonly a single name.
	if (typeof(value) == 'undefined') return defaultValue;
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function prepareData(data) {
	// Copy and normalize the caller's data without modifying their objects.
	// Invalid samples are ignored so a malformed row cannot crash a report.
	var rows = [];
	(data || []).forEach( function(row) {
		if (!row || (typeof(row) != 'object')) return;
		var x = Number(row.x);
		var y = Number(row.y);
		if (!isFinite(x) || !isFinite(y)) return;
		rows.push({ x: x, y: y });
	} );
	
	// Interpolation requires ascending, unique X coordinates.  If two samples
	// share a timestamp, preserve the last one supplied by the caller.
	rows.sort( function(a, b) { return a.x - b.x; } );
	var uniqueRows = [];
	rows.forEach( function(row) {
		var last = uniqueRows[ uniqueRows.length - 1 ];
		if (last && (last.x == row.x)) uniqueRows[ uniqueRows.length - 1 ] = row;
		else uniqueRows.push(row);
	} );
	
	return uniqueRows;
}

function applyDelta(rows, args) {
	// Match pixl-chart's delta preprocessing exactly.  Work backward so each
	// subtraction still sees the unmodified value from the previous sample.
	if (!args.delta || !rows.length) return;
	var deltaMinValue = false;
	if (('deltaMinValue' in args) && (args.deltaMinValue !== false)) {
		deltaMinValue = Number(args.deltaMinValue);
		if (!isFinite(deltaMinValue)) deltaMinValue = false;
	}
	
	for (var idx = rows.length - 1; idx >= 1; idx--) {
		rows[idx].y -= rows[idx - 1].y;
		
		// Clamp the raw delta before converting it into a rate.  This ordering is
		// important when deltaMinValue and divideByDelta are both enabled.
		if ((deltaMinValue !== false) && (rows[idx].y < deltaMinValue)) {
			rows[idx].y = deltaMinValue;
		}
		if (args.divideByDelta) {
			rows[idx].y /= ((rows[idx].x - rows[idx - 1].x) || 1);
		}
	}
	
	// There is no preceding value for the first sample.  pixl-chart fills this
	// gap by copying the second computed delta, keeping the original time range.
	rows[0].y = 0;
	if (rows.length > 1) rows[0].y = rows[1].y;
}

function createLinearInterpolant(xs, ys) {
	// Create a simple piecewise-linear interpolator for reducing large datasets.
	// This samples the complete time range uniformly into the available dots.
	if (!xs.length) return function() { return 0; };
	if (xs.length == 1) return function() { return ys[0]; };
	
	return function(x) {
		if (x <= xs[0]) return ys[0];
		if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
		
		// Locate the two source samples surrounding this output timestamp.
		var low = 0;
		var high = xs.length - 1;
		while ((high - low) > 1) {
			var mid = Math.floor( (low + high) / 2 );
			if (xs[mid] <= x) low = mid;
			else high = mid;
		}
		
		var ratio = (x - xs[low]) / (xs[high] - xs[low]);
		return ys[low] + ((ys[high] - ys[low]) * ratio);
	};
}

function createInterpolant(xs, ys) {
	// Adapted from: https://en.wikipedia.org/wiki/Monotone_cubic_interpolation
	// This is copied from pixl-chart.  The xs array MUST be pre-sorted!
	var i, length = xs.length;
	
	// Deal with length issues.
	if (length != ys.length) throw new Error('Need an equal count of xs and ys.');
	if (length === 0) return function() { return 0; };
	if (length === 1) {
		var result = +ys[0];
		return function() { return result; };
	}
	
	// Get consecutive differences and slopes.
	var dys = [];
	var dxs = [];
	var ms = [];
	for (i = 0; i < length - 1; i++) {
		var dx = xs[i + 1] - xs[i];
		var dy = ys[i + 1] - ys[i];
		dxs.push(dx);
		dys.push(dy);
		ms.push(dy / dx);
	}
	
	// Get degree-1 coefficients.
	var c1s = [ms[0]];
	for (i = 0; i < dxs.length - 1; i++) {
		var m = ms[i];
		var mNext = ms[i + 1];
		if ((m * mNext) <= 0) {
			c1s.push(0);
		}
		else {
			var dxCurrent = dxs[i];
			var dxNext = dxs[i + 1];
			var common = dxCurrent + dxNext;
			c1s.push( 3 * common / (((common + dxNext) / m) + ((common + dxCurrent) / mNext)) );
		}
	}
	c1s.push( ms[ms.length - 1] );
	
	// Get degree-2 and degree-3 coefficients.
	var c2s = [];
	var c3s = [];
	for (i = 0; i < c1s.length - 1; i++) {
		var c1 = c1s[i];
		var slope = ms[i];
		var invDx = 1 / dxs[i];
		var commonValue = c1 + c1s[i + 1] - slope - slope;
		c2s.push( (slope - c1 - commonValue) * invDx );
		c3s.push( commonValue * invDx * invDx );
	}
	
	// Return the interpolation function.
	return function(x) {
		// The rightmost point in the dataset should give an exact result.
		var idx = xs.length - 1;
		if (x == xs[idx]) return ys[idx];
		
		// Search for the interval containing x.
		var low = 0;
		var mid = 0;
		var high = c3s.length - 1;
		while (low <= high) {
			mid = Math.floor( 0.5 * (low + high) );
			var xHere = xs[mid];
			if (xHere < x) low = mid + 1;
			else if (xHere > x) high = mid - 1;
			else return ys[mid];
		}
		idx = Math.max(0, high);
		
		// Interpolate the value from the precomputed coefficients.
		var diff = x - xs[idx];
		var diffSq = diff * diff;
		return ys[idx] + (c1s[idx] * diff) + (c2s[idx] * diffSq) + (c3s[idx] * diff * diffSq);
	};
}

function resampleData(rows, sampleCount) {
	// Every Braille cell represents two uniformly spaced timestamps.  Smooth a
	// sparse series with monotone cubic interpolation, and reduce a dense series
	// with linear interpolation as requested by the chart API.
	if ((rows.length < 2) || (sampleCount < 1)) return [];
	
	var xs = rows.map( function(row) { return row.x; } );
	var ys = rows.map( function(row) { return row.y; } );
	var interpolate = (rows.length < sampleCount) ?
		createInterpolant(xs, ys) : createLinearInterpolant(xs, ys);
	var xMin = xs[0];
	var xMax = xs[ xs.length - 1 ];
	var values = [];
	
	for (var idx = 0; idx < sampleCount; idx++) {
		var ratio = (sampleCount == 1) ? 0 : (idx / (sampleCount - 1));
		values.push( interpolate(xMin + ((xMax - xMin) * ratio)) );
	}
	
	return values;
}

function getColumnMask(value, rowIndex, height, yMax, side) {
	// Quantize one sample to the chart's four-dots-per-line vertical resolution,
	// then turn on every dot from the baseline up to the sample height.
	if (!(yMax > 0)) return 0;
	var totalDots = height * 4;
	var ratio = Math.max(0, Math.min(Number(value) / yMax, 1));
	var filledDots = Math.round(ratio * totalDots);
	var firstFilledDot = totalDots - filledDots;
	var rowStart = rowIndex * 4;
	var mask = 0;
	
	for (var dot = 0; dot < 4; dot++) {
		if ((rowStart + dot) >= firstFilledDot) mask |= brailleBits[side][dot];
	}
	
	return mask;
}

function renderBrailleRow(values, rowIndex, height, width, yMax) {
	// Combine each adjacent pair of samples into one Unicode Braille character.
	var output = '';
	for (var col = 0; col < width; col++) {
		var mask = getColumnMask(values[col * 2], rowIndex, height, yMax, 'left');
		mask |= getColumnMask(values[(col * 2) + 1], rowIndex, height, yMax, 'right');
		output += mask ? String.fromCharCode(0x2800 + mask) : ' ';
	}
	return output;
}

function shortFloat(value, precision) {
	// Match pixl-chart's compact floating-point axis labels.
	precision = precision || 2;
	var power = Math.pow(10, precision);
	value = Math.round(parseFloat(value || 0) * power) / power;
	if (value == Math.round(value)) value += '.0';
	return '' + value;
}

function getTextFromBytes(value, precision) {
	// Format byte quantities using binary units and compact decimals.
	precision = precision || 10;
	var prefix = '';
	value = Math.floor(value);
	if (value < 0) {
		value = -value;
		prefix = '-';
	}
	if (value < 1024) return prefix + value + ' B';
	value = Math.floor((value / 1024) * precision) / precision;
	if (value < 1024) return prefix + value + ' K';
	value = Math.floor((value / 1024) * precision) / precision;
	if (value < 1024) return prefix + value + ' MB';
	value = Math.floor((value / 1024) * precision) / precision;
	if (value < 1024) return prefix + value + ' GB';
	value = Math.floor((value / 1024) * precision) / precision;
	return prefix + value + ' TB';
}

function getTextFromSeconds(value, abbreviated) {
	// Format elapsed seconds using the largest practical unit.
	var prefix = '';
	if (value < 0) {
		value = -value;
		prefix = '-';
	}
	var unit = abbreviated ? 'sec' : 'second';
	var amount = value;
	if (value > 59) {
		unit = abbreviated ? 'min' : 'minute';
		amount = value = value / 60;
		if (value > 59) {
			unit = abbreviated ? 'hr' : 'hour';
			amount = value = value / 60;
			if (value > 23) {
				unit = 'day';
				amount = value / 24;
			}
		}
	}
	amount = (amount < 10) ? Math.floor(amount * 10) / 10 : Math.floor(amount);
	var output = amount + ' ' + unit;
	if ((amount != 1) && !abbreviated) output += 's';
	return prefix + output;
}

function formatDataValue(value, dataType, suffix, floatPrecision) {
	// Format Y-axis labels using the same core rules as pixl-chart.
	var output = value;
	switch (dataType) {
		case 'bytes':
			output = getTextFromBytes( Math.floor(value), Math.pow(10, floatPrecision - 1) );
		break;
		case 'seconds':
			output = getTextFromSeconds(value, true);
		break;
		case 'milliseconds':
			output = (Math.abs(value) < 1000) ? Math.floor(value) + ' ms' : getTextFromSeconds(value / 1000, true);
		break;
		case 'integer':
			if (Math.abs(value) >= 1000000000) output = Math.floor(value / 1000000000) + 'B';
			else if (Math.abs(value) >= 1000000) output = Math.floor(value / 1000000) + 'M';
			else if (Math.abs(value) >= 10000) output = Math.floor(value / 1000) + 'K';
			else output = numberFormatter.format( Math.floor(value) );
		break;
		default:
			output = shortFloat(value, floatPrecision);
		break;
	}
	
	if (suffix) output += suffix;
	return '' + output;
}

function getDateRange(start, end) {
	// Match pixl-chart's automatic date format selection thresholds.
	var range = end - start;
	if (range > 2764800) return 'year';
	if (range > 172800) return 'month';
	if (range > 43200) return 'day';
	if (range > 600) return 'hour';
	return 'minute';
}

function formatDate(epoch, range) {
	// Use the process locale and time zone by leaving both unspecified.
	var dateStyles = {
		minute: { hour: 'numeric', hour12: false, minute: '2-digit', second: '2-digit' },
		hour: { hour: 'numeric', hour12: true, minute: '2-digit' },
		day: { hour: 'numeric', hour12: true },
		month: { month: 'short', day: 'numeric' },
		year: { month: 'short', day: 'numeric' }
	};
	return new Date(epoch * 1000).toLocaleString(undefined, dateStyles[range]);
}

function renderAxisLabels(left, right, width) {
	// Keep exactly two labels on one line.  On narrow terminals, divide the line
	// between them and truncate each side without allowing an overflow.
	if (width < 1) return '';
	left = '' + left;
	right = '' + right;
	if ((stringWidth(left) + stringWidth(right) + 1) > width) {
		var leftWidth = Math.floor((width - 1) / 2);
		var rightWidth = Math.max(0, width - leftWidth - 1);
		left = Width.truncate(left, leftWidth, leftWidth > 1 ? '…' : '');
		right = Width.truncate(right, rightWidth, rightWidth > 1 ? '…' : '');
	}
	return left + new Array(Math.max(0, width - stringWidth(left) - stringWidth(right)) + 1).join(' ') + right;
}

function overtypeLabel(cli, graphText, label, width, graphStyles, labelStyles) {
	// Y labels live inside the chart and deliberately replace any Braille cells
	// beneath them.  Style the two segments separately after measuring raw text.
	label = Width.truncate(label, width, width > 1 ? '…' : '');
	var labelWidth = stringWidth(label);
	return cli.applyStyles(label, labelStyles) +
		cli.applyStyles(graphText.slice(labelWidth), graphStyles);
}

module.exports = {
	
	chart: function(args) {
		// Render one static, filled timeseries chart as a multi-line string.
		args = args || {};
		var layoutWidth = ('width' in args) ?
			wholeNumber(args.width, 80, 0) : (this.width() || 80);
		var indent = wholeNumber(args.indent, 1, 0);
		var outerWidth = Math.max(0, layoutWidth - (indent * 2));
		var innerWidth = Math.max(0, outerWidth - 2);
		var height = wholeNumber(args.height, 14, 2);
		var indentText = this.space(indent);
		
		// A border needs at least its two corner cells.  Returning an empty string is
		// safer than overflowing when the requested margins consume the whole width.
		if (outerWidth < 2) return '';
		
		var graphStyles = styleList(args.color, []);
		var borderStyles = styleList(args.borderStyles, ['gray']);
		var labelStyles = styleList(args.labelStyles, ['gray']);
		var titleStyles = styleList(args.titleStyles, ['cyan', 'bold']);
		var rows = prepareData( Array.isArray(args.data) ? args.data : [] );
		applyDelta(rows, args);
		var dataType = args.dataType || 'integer';
		var dataSuffix = args.dataSuffix || '';
		var floatPrecision = wholeNumber(args.floatPrecision, 2, 1);
		var minVertScale = Number(args.minVertScale || 0);
		if (!isFinite(minVertScale) || (minVertScale < 0)) minVertScale = 0;
		
		// The Y scale is always zero-floored and otherwise bound to the highest
		// sample, unless minVertScale requests a larger fixed minimum.
		var yMax = minVertScale;
		rows.forEach( function(row) { yMax = Math.max(yMax, row.y, 0); } );
		var values = resampleData(rows, innerWidth * 2);
		var output = [];
		
		// Titles sit above the frame and align with its left border.
		if (args.title) {
			var title = ('' + args.title).replace(/\r?\n/g, ' ');
			title = Width.truncate(title, outerWidth, outerWidth > 1 ? '…' : '');
			output.push( indentText + this.applyStyles(title, titleStyles) );
		}
		
		// Render the border and all chart rows.  Fewer than two samples intentionally
		// leaves the Braille area blank, while one sample still supplies axis limits.
		output.push( indentText + this.applyStyles('┌' + this.repeat('─', innerWidth) + '┐', borderStyles) );
		for (var rowIndex = 0; rowIndex < height; rowIndex++) {
			var graphText = (rows.length >= 2) ?
				renderBrailleRow(values, rowIndex, height, innerWidth, yMax) : this.space(innerWidth);
			var content = this.applyStyles(graphText, graphStyles);
			
			if (rows.length && !rowIndex) {
				var topLabel = formatDataValue(yMax, dataType, dataSuffix, floatPrecision);
				content = overtypeLabel(this, graphText, topLabel, innerWidth, graphStyles, labelStyles);
			}
			else if (rows.length && (rowIndex == height - 1)) {
				var bottomLabel = formatDataValue(0, dataType, dataSuffix, floatPrecision);
				content = overtypeLabel(this, graphText, bottomLabel, innerWidth, graphStyles, labelStyles);
			}
			
			output.push(
				indentText +
				this.applyStyles('│', borderStyles) +
				content +
				this.applyStyles('│', borderStyles)
			);
		}
		output.push( indentText + this.applyStyles('└' + this.repeat('─', innerWidth) + '┘', borderStyles) );
		
		// Empty datasets have no axes.  One sample produces two identical timestamps,
		// which preserves the documented two-label layout without drawing an area.
		if (rows.length) {
			var xMin = rows[0].x;
			var xMax = rows[ rows.length - 1 ].x;
			var dateRange = getDateRange(xMin, xMax);
			var axisText = renderAxisLabels(
				formatDate(xMin, dateRange),
				formatDate(xMax, dateRange),
				outerWidth
			);
			output.push( indentText + this.applyStyles(axisText, labelStyles) );
		}
		
		return output.join('\n');
	}

};
