<script lang="ts">
	import { onMount } from 'svelte';
	import { Shader, Blob } from 'shaders/svelte';
	import { createTimeline } from 'animejs';
	import {
		ArrowUpRightIcon,
		ArrowElbowDownLeftIcon,
		MagnifyingGlassIcon,
		StarIcon,
		UserIcon,
		XIcon
	} from 'phosphor-svelte';
	import type { listProjects } from '#lib/server/projects.js';
	import type { User } from '#lib/server/auth.js';

	type Project = ReturnType<typeof listProjects>[number];
	let projects = $state<Project[]>([]);
	let query = $state('');
	let loading = $state(true);
	let error = $state('');
	let user = $state<User | null>(null);
	let accountLoading = $state(true);
	let accountError = $state('');
	let email = $state('');
	let linkSent = $state(false);
	let busy = $state(false);
	let blobCenter = $state({ x: 0.5, y: 0.5 });
	let blobOrigin = { x: 0.5, y: 0.5 };
	function randomBlobOrigin() {
		const radius = Math.sqrt(-2 * Math.log(1 - Math.random()));
		const angle = 2 * Math.PI * Math.random();
		const clamp = (value: number) => Math.min(0.85, Math.max(0.15, value));
		return {
			x: clamp(0.5 + radius * Math.cos(angle) * 0.22),
			y: clamp(0.5 + radius * Math.sin(angle) * 0.22)
		};
	}
	let reducedMotion = $state(false);
	let shaderReady = $state(false);
	function accountDialog() {
		return document.getElementById('account') as HTMLDialogElement;
	}
	let accountTimeline: ReturnType<typeof createTimeline> | undefined;
	let accountTrigger: HTMLButtonElement | undefined;
	let accountClosing = false;
	function clearAccountAnimations() {
		accountTimeline?.revert();
		accountTimeline = undefined;
	}
	function closeAccountAnimation() {
		accountClosing = false;
		accountDialog().classList.remove('closing');
		clearAccountAnimations();
		if (accountTrigger) {
			accountTrigger.style.visibility = '';
			accountTrigger.focus();
			accountTrigger = undefined;
		}
	}
	function requestAccountClose() {
		const dialog = accountDialog();
		if (accountClosing) return;
		if (reducedMotion || !accountTimeline || !accountTrigger) {
			dialog.close();
			return;
		}
		accountClosing = true;
		const current = dialog.getBoundingClientRect();
		const target = accountTrigger.getBoundingClientRect();
		clearAccountAnimations();
		const base = dialog.getBoundingClientRect();
		dialog.classList.add('closing');
		const ghost = dialog.querySelector<HTMLElement>('.account-ghost');
		const elements = dialog.querySelectorAll<HTMLElement>(
			'.panel-heading h2, .panel-heading .close, .email-field input, .email-field .submit-email, .signed-in, .primary, .panel-description, .account-error'
		);
		const timeline = createTimeline({
			autoplay: false,
			defaults: { ease: 'out(3)' },
			onComplete: () => dialog.close()
		});
		timeline.add(
			dialog,
			{
				translateX: [
					current.left + current.width / 2 - base.left - base.width / 2,
					target.left + target.width / 2 - base.left - base.width / 2
				],
				translateY: [
					current.top + current.height / 2 - base.top - base.height / 2,
					target.top + target.height / 2 - base.top - base.height / 2
				],
				scaleX: [current.width / base.width, target.width / base.width],
				scaleY: [current.height / base.height, target.height / base.height],
				duration: 650
			},
			0
		);
		elements.forEach((element, index) => {
			timeline.add(element, { translateX: [0, -20], opacity: [1, 0], duration: 180 }, index * 12);
		});
		if (ghost) timeline.add(ghost, { translateX: [45, 0], opacity: [0, 1], duration: 200 }, 340);
		accountTimeline = timeline.init();
		timeline.play();
	}
	function cancelAccount(event: Event) {
		event.preventDefault();
		requestAccountClose();
	}
	function openAccount(event: MouseEvent) {
		const button = event.currentTarget as HTMLButtonElement;
		const start = button.getBoundingClientRect();
		const dialog = accountDialog();
		clearAccountAnimations();
		accountTrigger = button;
		button.style.visibility = 'hidden';
		dialog.showModal();
		if (reducedMotion) return;
		const end = dialog.getBoundingClientRect();
		const ghost = dialog.querySelector<HTMLElement>('.account-ghost');
		const timeline = createTimeline({
			autoplay: false,
			defaults: { ease: 'out(3)' },
			onComplete: () => {
				if (accountClosing) accountDialog().close();
			}
		});
		timeline.add(
			dialog,
			{
				translateX: [start.left + start.width / 2 - end.left - end.width / 2, 0],
				translateY: [start.top + start.height / 2 - end.top - end.height / 2, 0],
				scaleX: [start.width / end.width, 1],
				scaleY: [start.height / end.height, 1],
				duration: 420
			},
			0
		);
		if (ghost) timeline.add(ghost, { translateX: [0, 72], opacity: [1, 0], duration: 230 }, 0);
		const elements = dialog.querySelectorAll<HTMLElement>(
			'.panel-heading h2, .panel-heading .close, .email-field input, .email-field .submit-email, .signed-in, .primary, .panel-description, .account-error'
		);
		elements.forEach((element, index) => {
			timeline.add(
				element,
				{ translateX: [-24, 0], opacity: [0, 1], duration: 260 },
				135 + index * 18
			);
		});
		accountTimeline = timeline.init();
		timeline.play();
	}
	function moveBlob(event: PointerEvent) {
		if (reducedMotion || event.pointerType !== 'mouse') return;
		blobCenter = {
			x: Math.min(
				0.95,
				Math.max(0.05, blobOrigin.x - (event.clientX / window.innerWidth - 0.5) * 0.2)
			),
			y: Math.min(
				0.95,
				Math.max(0.05, blobOrigin.y - (event.clientY / window.innerHeight - 0.5) * 0.2)
			)
		};
	}

	const statusLabels: Record<string, string> = {
		active: 'Active',
		maintenance: 'Maintenance',
		seeking: 'Seeking maintainer'
	};
	const examples = [
		{
			name: 'Lorem Ipsum',
			description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
			stack: ['TypeScript', 'Svelte']
		},
		{
			name: 'Dolor Sit',
			description: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
			stack: ['Python', 'FastAPI']
		},
		{
			name: 'Amet Studio',
			description: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
			stack: ['Rust', 'WebAssembly']
		},
		{
			name: 'Consectetur',
			description: 'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
			stack: ['JavaScript', 'CSS']
		}
	];
	let matchingExamples = $derived(
		examples.filter((example) =>
			[example.name, example.description, ...example.stack]
				.join(' ')
				.toLowerCase()
				.includes(query.trim().toLowerCase())
		)
	);
	let filtered = $derived(
		projects.filter(({ metadata: m }) =>
			[m.name, m.description, ...m.topics, ...m.techStack]
				.join(' ')
				.toLowerCase()
				.includes(query.trim().toLowerCase())
		)
	);

	async function request<T>(url: string, input?: Record<string, string>): Promise<T> {
		const response = await fetch(
			url,
			input
				? {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(input)
					}
				: undefined
		);
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
		return data;
	}

	async function loadProjects() {
		loading = true;
		error = '';
		try {
			const all: Project[] = [];
			let offset: number | null = 0;
			do {
				const page: { projects: Project[]; nextOffset: number | null } = await request(
					`/api/projects?offset=${offset}`
				);
				all.push(...page.projects);
				offset = page.nextOffset;
			} while (offset !== null);
			projects = all;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to load projects.';
		} finally {
			loading = false;
		}
	}

	async function loadAccount() {
		try {
			user = (await request<{ user: User | null }>('/api/auth/me')).user;
		} catch {
			accountError = 'Unable to check your account. Please try again.';
		} finally {
			accountLoading = false;
		}
	}

	async function authenticate(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		accountError = '';
		try {
			await request('/api/auth/request-otp', { email });
			linkSent = true;
		} catch (cause) {
			accountError = cause instanceof Error ? cause.message : 'Unable to sign in.';
		} finally {
			busy = false;
		}
	}

	async function logout() {
		busy = true;
		accountError = '';
		try {
			await request('/api/auth/logout', {});
			user = null;
		} catch (cause) {
			accountError = cause instanceof Error ? cause.message : 'Unable to sign out.';
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		blobOrigin = randomBlobOrigin();
		blobCenter = blobOrigin;
		const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = motionPreference.matches;
			if (reducedMotion) {
				blobCenter = blobOrigin;
				if (accountClosing) accountDialog().close();
				else clearAccountAnimations();
			}
		};
		updateMotion();
		motionPreference.addEventListener('change', updateMotion);
		void loadProjects();
		const params = new URLSearchParams(window.location.hash.slice(1));
		const token = params.get('token');
		const linkEmail = params.get('email');
		if (token && linkEmail) {
			history.replaceState(null, '', window.location.pathname + window.location.search);
			void request<{ user: User }>('/api/auth/verify-otp', { email: linkEmail, code: token })
				.then((result) => {
					user = result.user;
				})
				.catch((cause) => {
					accountError = cause instanceof Error ? cause.message : 'Unable to sign in.';
					accountDialog().showModal();
				})
				.finally(() => {
					accountLoading = false;
				});
		} else {
			void loadAccount();
		}
		return () => {
			motionPreference.removeEventListener('change', updateMotion);
			closeAccountAnimation();
		};
	});
</script>

<svelte:head>
	<title>NST Shipyard</title>
	<meta
		name="description"
		content="The canonical list of current, ongoing student-led initiatives at NST S-VYASA"
	/>
</svelte:head>

<svelte:window onpointermove={moveBlob} />
<div class={['shader-background', { ready: shaderReady }]} aria-hidden="true">
	<Shader
		colorSpace="srgb"
		style="width: 100%; height: 100%"
		disableTelemetry={true}
		onready={() => (shaderReady = true)}
	>
		<Blob
			colorA="#0061ff"
			colorB="#60efff"
			size={0.5}
			deformation={0.5}
			softness={0.2}
			highlightIntensity={0.12}
			speed={reducedMotion ? 0 : 0.15}
			center={blobCenter}
		/>
	</Shader>
</div>

<div class="shell">
	<header>
		<a class="brand" href="/" aria-label="Shipyard home">
			<span class="brand-mark" aria-hidden="true">⌘</span>shipyard<span class="brand-period">
				.
			</span>
		</a>
		<label class={['search', { 'has-query': query.length > 0 }]}>
			<MagnifyingGlassIcon size={19} aria-hidden="true" />
			<input type="search" bind:value={query} aria-label="Search projects" />
		</label>
		<button
			class="account-pill"
			onclick={openAccount}
			disabled={accountLoading}
			aria-haspopup="dialog"
		>
			<span class="avatar" aria-hidden="true">
				{#if user}{user.email.charAt(0).toUpperCase()}{:else}<UserIcon
						size={16}
						aria-hidden="true"
					/>{/if}
			</span>
			<span class="account-label">
				{accountLoading ? 'Loading' : user ? user.email.split('@')[0] : 'Account'}
			</span>
		</button>
	</header>

	<main id="main">
		<div class="listing-header">
			<span aria-live="polite">
				{loading
					? 'Loading projects'
					: projects.length === 0 && !error
						? `${matchingExamples.length} example projects`
						: `${filtered.length} ${filtered.length === 1 ? 'project' : 'projects'}`}
			</span>
		</div>
		{#if loading}
			<div class="grid" aria-hidden="true">
				{#each [1, 2, 3, 4] as item (item)}<div class="skeleton"></div>{/each}
			</div>
		{:else if error}
			<div class="empty" role="alert">
				<h3>Projects couldn’t be loaded.</h3>
				<p>{error}</p>
				<button onclick={loadProjects}>Try again</button>
			</div>
		{:else if projects.length === 0 && matchingExamples.length > 0}
			<div class="grid" aria-label="Example projects">
				{#each matchingExamples as example (example.name)}
					<article class="project-card">
						<div class="card-top">
							<img
								class="project-mark"
								src="/images/project-avatar.svg"
								alt=""
								width="45"
								height="45"
							/><ArrowUpRightIcon size={20} aria-hidden="true" />
						</div>
						<div class="card-copy">
							<p class="owner">sample project</p>
							<h3>{example.name}</h3>
							<p class="description">{example.description}</p>
						</div>
						<div class="tags">
							{#each example.stack as tech (tech)}<span>{tech}</span>{/each}
						</div>
					</article>
				{/each}
			</div>
		{:else if filtered.length === 0}
			<div class="empty">
				<h3>{query.trim() ? 'No projects found.' : 'ERR:EMPTY'}</h3>
				<p>
					{query.trim() ? 'Try another project name, language, or topic.' : 'ERR:EMPTY'}
				</p>
			</div>
		{:else}
			<div class="grid">
				{#each filtered as project (project.id)}
					{@const m = project.metadata}
					<article class="project-card">
						<div class="card-top">
							<a
								class="project-mark"
								href={`https://github.com/${project.repositoryUrl.split('/')[3]}`}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`View ${project.repositoryUrl.split('/')[3]} on GitHub (opens in a new tab)`}
							>
								<img src="/images/project-avatar.svg" alt="" width="45" height="45" />
							</a><span class={['status', { active: project.status === 'active' }]}>
								{statusLabels[project.status] || project.status}
							</span>
						</div>
						<div class="card-copy">
							<p class="owner">{project.repositoryUrl.split('/')[3]}</p>
							<h3>
								<a
									class="repository-link"
									href={project.repositoryUrl}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={`${m.name} — view repository (opens in a new tab)`}
								>
									{m.name}
								</a>
							</h3>
							<p class="description">
								{m.description || 'Could not fetch description.'}
							</p>
						</div>
						<div class="tags">
							{#each m.techStack.slice(0, 3) as tech (tech)}<span>{tech}</span>{/each}
						</div>
						<div class="card-footer">
							<span class="stars"><StarIcon size={14} aria-hidden="true" /> {m.stars}</span><span>
								{m.goodFirstIssues.length
									? `${m.goodFirstIssues.length} starter issues`
									: 'Explore repository'}
							</span>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</main>
</div>

<dialog
	id="account"
	class="account-panel"
	aria-labelledby="account-heading"
	onclose={closeAccountAnimation}
	oncancel={cancelAccount}
>
	<div class="account-ghost" aria-hidden="true">
		<span class="avatar">
			{#if user}{user.email.charAt(0).toUpperCase()}{:else}<UserIcon
					size={16}
					aria-hidden="true"
				/>{/if}
		</span><span>{user ? user.email.split('@')[0] : 'Account'}</span>
	</div>
	<div class="account-content">
		<div class="panel-heading">
			<h2 id="account-heading">{user ? 'Your account' : 'Sign Up'}</h2>
			<button class="close" onclick={requestAccountClose} aria-label="Close account">
				<XIcon size={20} aria-hidden="true" />
			</button>
		</div>
		{#if user}
			<p class="signed-in">{user.email}</p>
			<button class="primary" onclick={logout} disabled={busy}>
				{busy ? 'Signing out' : 'Sign out'}
			</button>
		{:else}
			<form onsubmit={authenticate}>
				<div class="email-field">
					<input
						id="email"
						type="email"
						autocomplete="email"
						aria-label="Campus e-mail"
						placeholder="*@svyasa-sas.edu.in"
						bind:value={email}
						required
					/>
					<button
						class="submit-email"
						type="submit"
						disabled={busy}
						aria-label="Send sign-in link"
						title="Send sign-in link"
					>
						<ArrowElbowDownLeftIcon size={20} aria-hidden="true" />
					</button>
				</div>
				{#if linkSent}<p class="panel-description" role="status">
						Check your email for a sign-in link. It expires in 10 minutes.
					</p>{/if}
			</form>
		{/if}
		{#if accountError}<p class="account-error" role="alert">{accountError}</p>{/if}
	</div>
</dialog>

<style lang="sass">
@font-face
	font-family: "Monaspace Xenon"
	src: url('/fonts/MonaspaceXenonVar.woff2') format('woff2')
	font-style: normal
	font-weight: 200 800
	font-display: swap
$page-background: #0f1419
$ink: #fff
:global(body)
	margin: 0
	background: $page-background
	color: #fff
	color-scheme: dark
	caret-color: #ffb454
	font-family: "Monaspace Xenon", monospace
	-webkit-font-smoothing: antialiased
:global(::selection)
	background: #72502b
	color: #fff
:global(*)
	box-sizing: border-box
	border-radius: 0
:global(button), :global(input)
	font: inherit
:global(button)
	cursor: pointer
:global(button:disabled)
	cursor: wait
	opacity: 0.6
:global(:focus-visible)
	outline: 2px solid #ffb454
	outline-offset: 4px
.shader-background
	position: fixed
	inset: 0
	pointer-events: none
	visibility: hidden
	opacity: 1
.shader-background.ready
	visibility: visible
.shell
	position: relative
	min-height: 100dvh
	display: flex
	flex-direction: column
	max-width: 1440px
	margin: auto
	padding: 0 48px
header
	min-height: 106px
	display: flex
	align-items: center
	gap: 40px

.brand
	display: flex
	align-items: center
	text-decoration: none
	color: #fff
	font-weight: 750
	font-size: 25px
	letter-spacing: -1px
.brand-mark
	display: grid
	place-items: center
	width: 34px
	height: 34px
	background: #ffb454
	color: #fff
	font-size: 24px
	margin-right: 10px
.brand-period
	color: #ffb454
.search
	display: flex
	align-items: center
	justify-content: center
	gap: 0
	margin-left: auto
	height: 46px
	width: 46px
	flex-shrink: 0
	border-bottom: 1px solid transparent
	background: transparent
	color: #fff
	cursor: pointer
	transition: width 260ms ease, background-color 260ms ease, padding 260ms ease, gap 260ms ease
.search:hover
	background: rgba(15, 20, 25, 0.3)
.search:focus-within, .search.has-query
	justify-content: flex-start
	gap: 12px
	padding: 0 16px
	width: min(100%, 480px)
	background: rgba(15, 20, 25, 0.75)
	backdrop-filter: blur(5px)
	-webkit-backdrop-filter: blur(5px)
	border-bottom-color: #fff
.search :global(svg)
	flex: 0 0 auto
.search input
	border: 0
	outline: none
	width: 1px
	min-width: 0
	padding: 0
	background: transparent
	color: #fff
	font-size: 14px
.search:focus-within input, .search.has-query input
	width: 100%
	cursor: text
.account-pill
	display: flex
	align-items: center
	gap: 10px
	border: 0
	background: #191f26
	padding: 6px 12px 6px 6px
	height: 44px
	color: #fff
	max-width: 230px
	box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45)
.account-label
	font-size: 14px
	white-space: nowrap
	overflow: hidden
	text-overflow: ellipsis
.avatar
	display: grid
	place-items: center
	flex-shrink: 0
	height: 30px
	width: 30px
	background: #314559
	font-size: 15px
.listing-header
	display: flex
	align-items: center
	justify-content: space-between
	margin-bottom: 22px
	padding-top: 25px
.listing-header > span
	font-size: 13px
	color: #fff
main
	display: flex
	flex-direction: column
	flex: 1
.grid
	display: grid
	grid-template-columns: repeat(4, minmax(0, 1fr))
	gap: 20px
.project-card, .skeleton
	aspect-ratio: 3/4
	min-width: 0
	border: 1px solid rgba(120, 135, 151, 0.45)
	background: rgba(20, 27, 35, 0.48)
	backdrop-filter: blur(5px)
	-webkit-backdrop-filter: blur(5px)
.project-card
	border: 0
	position: relative
	padding: 22px
	display: flex
	flex-direction: column
	text-decoration: none
	color: #fff
	transition: background-color 220ms ease
.project-card:hover
	background: rgba(20, 27, 35, 0.72)
.repository-link
	color: #fff
	text-decoration: none
.repository-link::after
	content: ''
	position: absolute
	inset: 0
.project-card:has(.repository-link:focus-visible)
	outline: 2px solid #fff
	outline-offset: 4px
.card-top
	display: flex
	align-items: center
	justify-content: space-between
	gap: 8px
.card-top :global(svg)
	cursor: pointer
.project-mark
	position: relative
	z-index: 1
	text-decoration: none
	display: grid
	place-items: center
	width: 45px
	height: 45px
	background: #314559
	color: #fff
	font-size: 15px
	font-weight: 650
	flex-shrink: 0
.project-mark img
	width: 100%
	height: 100%
	object-fit: cover
.status
	font-size: 12px
	text-align: right
	color: #fff
.status.active
	color: #fff
.card-copy
	margin-top: 25px
.owner
	color: #fff
	font-size: 12px
	margin: 0 0 7px
	overflow: hidden
	text-overflow: ellipsis
.card-copy h3
	margin: 0 0 12px
	font-size: 21px
	font-weight: 600
	letter-spacing: -0.5px
	overflow-wrap: anywhere
	display: -webkit-box
	-webkit-line-clamp: 2
	line-clamp: 2
	-webkit-box-orient: vertical
	overflow: hidden
.description
	font-size: 14px
	line-height: 1.65
	color: #fff
	margin: 0 0 20px
	display: -webkit-box
	-webkit-line-clamp: 3
	line-clamp: 3
	-webkit-box-orient: vertical
	overflow: hidden
.tags
	display: flex
	gap: 5px
	flex-wrap: wrap
	margin-top: auto
	padding-top: 10px
	max-height: 65px
	overflow: hidden
.tags span
	font-size: 12px
	padding: 5px 7px
	background: #314559
	color: #e6e1cf
	max-width: 100%
	overflow: hidden
	text-overflow: ellipsis
	white-space: nowrap
.stars
	display: inline-flex
	align-items: center
	gap: 4px
.card-footer
	display: flex
	justify-content: space-between
	gap: 8px
	font-size: 12px
	color: #fff
	margin-top: 20px
	padding-top: 15px
.skeleton
	background: #191f26
.empty
	flex: 1
	display: flex
	flex-direction: column
	align-items: center
	justify-content: center
	text-align: center
	padding: 24px
.empty h3
	font-size: 22px
	font-weight: 550
	margin: 0 0 12px
.empty p
	color: #fff
	line-height: 1.6
.empty button
	border: 1px solid #5c6773
	padding: 10px 16px
	color: #fff
	background: #191f26
.account-panel
	inset: 0
	margin: auto
	width: min(420px, 100vw - 32px)
	max-height: calc(100dvh - 32px)
	overflow: hidden
	border: 1px solid #5c6773
	padding: 24px
	background: #191f26
	color: #fff
	box-shadow: 0 16px 50px rgba(32, 48, 32, 0.1254901961)
.account-panel::backdrop
	background: rgba(0, 0, 0, 0.8)
	backdrop-filter: blur(4px)
	animation: backdrop-enter 420ms ease-out both
.account-panel:global(.closing)::backdrop
	animation: backdrop-exit 650ms ease-out both
@keyframes backdrop-exit
	from
		background: rgba(0, 0, 0, 0.8)
		backdrop-filter: blur(4px)
	to
		background: rgba(0, 0, 0, 0)
		backdrop-filter: blur(0)
@keyframes backdrop-enter
	from
		background: rgba(0, 0, 0, 0)
		backdrop-filter: blur(0)
	to
		background: rgba(0, 0, 0, 0.8)
		backdrop-filter: blur(4px)
.account-ghost
	position: absolute
	top: 6px
	right: 12px
	display: flex
	align-items: center
	gap: 10px
	opacity: 0
	pointer-events: none
.account-content
	max-height: calc(100dvh - 82px)
	overflow-y: auto
.panel-heading
	display: flex
	align-items: center
	justify-content: space-between
	gap: 12px
.panel-heading + form
	margin-top: 20px
.panel-heading h2
	font-size: 21px
	font-weight: 600
	margin: 0
.close
	transform: translateY(-2px)
	border: 0
	background: transparent
	font-size: 26px
	color: #fff
.panel-description, .signed-in
	color: #fff
	font-size: 14px
	line-height: 1.6
	overflow-wrap: anywhere
.email-field
	position: relative
.email-field input
	padding-right: 52px
form input::placeholder
	color: #fff
	opacity: 1
form input
	background: #0f1419
	color: #fff
	width: 100%
	border: 1px solid #5c6773
	padding: 11px
.submit-email
	position: absolute
	right: 1px
	top: 1px
	bottom: 1px
	width: 44px
	display: grid
	place-items: center
	border: 0
	background: transparent
	color: #fff
.primary
	width: 100%
	background: #ffb454
	color: #fff
	border: 0
	padding: 12px
	margin-top: 18px
	font-size: 14px
.account-error
	color: #fff
	font-size: 14px
	line-height: 1.5
@media (max-width: 1100px)
	.shell
		padding: 0 28px
	header
		gap: 24px
	.grid
		gap: 14px
	.project-card
		padding: 16px
	.card-copy
		margin-top: 18px
	.card-copy h3
		font-size: 18px
	.status
		font-size: 11px
@media (max-width: 900px)
	.grid
		grid-template-columns: repeat(2, minmax(0, 1fr))
	.project-card
		padding: 24px
	.card-copy
		margin-top: 28px
	.status
		font-size: 12px
@media (max-width: 580px)
	.shell
		padding: 0 20px
	header
		flex-wrap: wrap
		gap: 18px
		padding: 22px 0
	.brand
		font-size: 23px
	.account-pill
		margin-left: auto
		max-width: 160px
	.search
		order: 3
		margin-left: 0
	.search:focus-within, .search.has-query
		width: 100%
	.grid
		grid-template-columns: minmax(0, 1fr)
	.project-card
		padding: 26px
	.card-copy
		margin-top: 32px
	.card-copy h3
		font-size: 24px
	.description
		font-size: 16px
@media (prefers-reduced-motion: reduce)
	.search, .project-card
		transition: none
	.account-panel::backdrop, .account-panel:global(.closing)::backdrop
		animation: none
</style>
