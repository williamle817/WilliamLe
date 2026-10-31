// Background: a living git graph that drifts slowly to the left.
// Branches fork off, commit, and merge back as new columns scroll in from the right.
(function () {
	const holder = document.getElementById('background');
	if (!holder) return;

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	holder.appendChild(canvas);

	const COLORS = ['#5ea8f2', '#f68124', '#2dd4bf', '#a78bfa', '#f472b6', '#4ade80'];
	const ROOT_NAMES = ['main', 'develop', 'release', 'staging'];
	const BRANCH_NAMES = [
		'feat/auth', 'feat/ui', 'fix/api', 'exp/algo', 'perf/cache', 'refactor/core', 'feat/search', 'fix/race',
		'chore/ci', 'icpc/dp', 'icpc/dijkstra', 'test/e2e', 'docs/readme', 'feat/graph', 'fix/overflow', 'perf/simd',
	];

	const STEP = 64;            // horizontal distance between columns of commits
	const LANE = 56;            // vertical distance between lanes
	const SPEED = 14;           // drift speed in px per second
	const COMMIT_CHANCE = 0.6;
	const FORK_CHANCE = 0.08;
	const MERGE_CHANCE = 0.06;
	const MAX_ACTIVE = 0.6;     // share of lanes that may hold a branch at once

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

	let width, height, dpr, laneTop, slots, edges, nodes, labels, column, offset, colorIndex, lastTime, frame;

	const laneY = (slot) => laneTop + slot * LANE;
	const pick = (list) => list[Math.floor(Math.random() * list.length)];
	const nextColor = () => COLORS[colorIndex++ % COLORS.length];
	const activeBranches = () => slots.filter(Boolean);

	function freeSlotNear(slot) {
		for (let d = 1; d <= 3; d++) {
			const candidates = [slot - d, slot + d].filter((s) => s >= 0 && s < slots.length && !slots[s]);
			if (candidates.length) return pick(candidates);
		}
		return -1;
	}

	function mergeTarget(branch) {
		let best = null;
		for (const other of slots) {
			if (!other || other === branch || other.merging) continue;
			const distance = Math.abs(other.slot - branch.slot);
			if (distance <= 4 && (!best || distance < Math.abs(best.slot - branch.slot))) best = other;
		}
		return best;
	}

	function extend(branch, x, y) {
		edges.push({ x1: branch.x, y1: branch.y, x2: x, y2: y, color: branch.color });
		branch.x = x;
		branch.y = y;
		branch.age++;
	}

	function generateColumn() {
		const x = column * STEP;
		const branches = activeBranches();
		const committed = new Set();

		// Decide merges up front so a merging branch is never picked as another one's target
		for (const b of branches) b.merging = !b.root && b.age > 2 && Math.random() < MERGE_CHANCE;

		for (const b of branches) {
			if (b.merging) continue;
			const y = laneY(b.slot);
			const bends = b.y !== y;
			extend(b, x, y);
			if (bends || Math.random() < COMMIT_CHANCE) {
				nodes.push({ x, y, color: b.color });
				committed.add(b);
			}
			if (b.root && (column + b.slot * 7) % 24 === 0)
				labels.push({ x: x + 8, y: y - 9, text: b.name, color: b.color });
		}

		for (const b of branches) {
			if (!b.merging) continue;
			b.merging = false;
			const target = mergeTarget(b);
			if (!target) {
				extend(b, x, laneY(b.slot));
				continue;
			}
			extend(b, x, target.y);
			nodes.push({ x, y: target.y, color: target.color, merge: true });
			slots[b.slot] = null;
		}

		let active = activeBranches().length;
		for (const b of activeBranches()) {
			if (active >= slots.length * MAX_ACTIVE || Math.random() >= FORK_CHANCE) continue;
			const slot = freeSlotNear(b.slot);
			if (slot < 0) continue;
			if (!committed.has(b)) nodes.push({ x, y: b.y, color: b.color });
			const child = { slot, color: nextColor(), x, y: b.y, age: 0, root: false };
			slots[slot] = child;
			labels.push({ x: x + STEP + 8, y: laneY(slot) - 9, text: pick(BRANCH_NAMES), color: child.color });
			active++;
		}

		column++;
	}

	function fill() {
		while (column * STEP < offset + width + STEP) generateColumn();
	}

	function prune() {
		const left = offset - STEP;
		edges = edges.filter((e) => e.x2 > left);
		nodes = nodes.filter((n) => n.x > left);
		labels = labels.filter((l) => l.x > left - 160);
	}

	function draw() {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		ctx.translate(-offset, 0);

		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		ctx.globalAlpha = 0.32;
		for (const e of edges) {
			ctx.strokeStyle = e.color;
			ctx.beginPath();
			ctx.moveTo(e.x1, e.y1);
			if (e.y1 === e.y2) ctx.lineTo(e.x2, e.y2);
			else ctx.bezierCurveTo(e.x1 + STEP * 0.6, e.y1, e.x2 - STEP * 0.6, e.y2, e.x2, e.y2);
			ctx.stroke();
		}

		for (const n of nodes) {
			ctx.beginPath();
			if (n.merge) {
				ctx.globalAlpha = 1;
				ctx.fillStyle = '#05070d';
				ctx.arc(n.x, n.y, 5.5, 0, Math.PI * 2);
				ctx.fill();
				ctx.globalAlpha = 0.75;
				ctx.strokeStyle = n.color;
				ctx.stroke();
			} else {
				ctx.globalAlpha = 0.6;
				ctx.fillStyle = n.color;
				ctx.arc(n.x, n.y, 3.5, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		ctx.globalAlpha = 0.45;
		ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
		for (const l of labels) {
			ctx.fillStyle = l.color;
			ctx.fillText(l.text, l.x, l.y);
		}
		ctx.globalAlpha = 1;
	}

	function sizeCanvas() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		width = holder.clientWidth;
		height = holder.clientHeight;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
	}

	function init() {
		sizeCanvas();
		const count = Math.ceil(height / LANE) + 1;
		laneTop = (height - (count - 1) * LANE) / 2;
		slots = new Array(count).fill(null);
		edges = [];
		nodes = [];
		labels = [];
		colorIndex = 0;
		column = 0;

		// Long-lived branches spread down the screen so the whole height has activity
		for (let s = 1, i = 0; s < count; s += 4, i++)
			slots[s] = { slot: s, color: nextColor(), x: 0, y: laneY(s), age: 0, root: true, name: ROOT_NAMES[i % ROOT_NAMES.length] };

		// Start with some history already on screen
		offset = STEP * 24;
		fill();
		prune();
	}

	function tick(now) {
		const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
		lastTime = now;
		offset += SPEED * dt;
		fill();
		prune();
		draw();
		frame = requestAnimationFrame(tick);
	}

	function start() {
		cancelAnimationFrame(frame);
		lastTime = 0;
		init();
		if (reducedMotion.matches) draw();
		else frame = requestAnimationFrame(tick);
	}

	let resizeTimer;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			// Mobile browser bars change the height a little while scrolling; don't rebuild the graph for that
			if (holder.clientWidth === width && Math.abs(holder.clientHeight - height) < 120) {
				sizeCanvas();
				draw();
			} else {
				start();
			}
		}, 150);
	});
	reducedMotion.addEventListener('change', start);

	start();
})();

// Terminal intro: types a couple of commands, then reveals the card.
// The <head> script decides whether it plays; any key, click or scroll skips it.
(function () {
	const root = document.documentElement;
	const term = document.querySelector('#intro .term');
	if (!root.classList.contains('intro') || !term) return;

	const steps = [
		{ cmd: 'whoami', out: 'william-le' },
		{ cmd: './portfolio --open' },
	];
	const skipEvents = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
	const caret = document.createElement('span');
	caret.className = 'caret';
	let timer;
	let finished = false;

	function finish() {
		if (finished) return;
		finished = true;
		clearTimeout(timer);
		try {
			sessionStorage.setItem('intro-seen', '1');
		} catch (e) { }
		root.classList.remove('intro');
		skipEvents.forEach((type) => window.removeEventListener(type, finish));
	}

	function addLine(className) {
		const line = document.createElement('p');
		if (className) line.className = className;
		term.appendChild(line);
		return line;
	}

	function run(index) {
		if (index >= steps.length) {
			timer = setTimeout(finish, 350);
			return;
		}

		const step = steps[index];
		const line = addLine();
		const prompt = document.createElement('span');
		prompt.className = 'prompt';
		prompt.textContent = '~ $ ';
		const cmd = document.createElement('span');
		line.append(prompt, cmd, caret);

		let typed = 0;
		(function type() {
			cmd.textContent = step.cmd.slice(0, ++typed);
			if (typed < step.cmd.length) {
				timer = setTimeout(type, 28 + Math.random() * 30);
				return;
			}
			timer = setTimeout(() => {
				if (step.out) addLine('out').textContent = step.out;
				timer = setTimeout(() => run(index + 1), step.out ? 220 : 0);
			}, 160);
		})();
	}

	skipEvents.forEach((type) => window.addEventListener(type, finish, { passive: true }));
	timer = setTimeout(() => run(0), 250);
})();
